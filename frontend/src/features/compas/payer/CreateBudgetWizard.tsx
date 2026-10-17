"use client";

import { useState } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import { CompasApiError, compasApi, errorCode } from "../api/client";
import type { MeResponse, PartyView } from "../api/contracts";
import { parseAmountInput } from "../lib/amounts";
import { addDays, endOfDayIso, startOfDayIso, toDateInput } from "../lib/dates";
import { CATEGORY_DESCRIPTION, CATEGORY_LABEL, errorText } from "../lib/labels";
import {
  type Asset,
  stepForField,
  stepIssues,
  toCreateBody,
  WIZARD_STEPS,
  type WizardDraft,
  type WizardStep,
} from "../lib/wizard";
import { AuthorizationSummary } from "../ui/AuthorizationSummary";
import {
  CategoryPicker,
  ConfidencePicker,
  EnforcementPicker,
  ParticipantPicker,
  TextField,
} from "../ui/forms";
import { Button, Notice, ScreenHeading } from "../ui/primitives";

const STEP_TITLE: Record<WizardStep, string> = {
  participants: "¿Para quién es este presupuesto?",
  purpose: "¿En qué se podrá utilizar?",
  budget: "¿Cuánto puede gastar y hasta cuándo?",
  rules: "¿Cómo quieres controlar las compras?",
  review: "Revisa y autoriza",
};

/** When the wallet's asset can't be read, the budget uses USD and the wallet checks it at consent. */
const FALLBACK_ASSET: Asset = { assetCode: "USD", assetScale: 2 };

export function walletAsset(me: MeResponse | undefined): Asset {
  return me?.payerWallet.status === "RESOLVED"
    ? { assetCode: me.payerWallet.assetCode, assetScale: me.payerWallet.assetScale }
    : FALLBACK_ASSET;
}

export function newDraftDates(today = new Date()) {
  return { startDate: toDateInput(today), endDate: toDateInput(addDays(today, 30)) };
}

export function CreateBudgetWizard({
  partyId,
  me,
  participants,
  draft,
  onDraftChange,
  step,
  onStepChange,
  focusOnMount,
  onAuthorizationStarted,
  onCreatedWithoutConsent,
  onDraftSaved,
}: {
  partyId: string;
  me: MeResponse;
  participants: readonly PartyView[];
  draft: WizardDraft;
  onDraftChange: (next: WizardDraft) => void;
  step: WizardStep;
  onStepChange: (next: WizardStep) => void;
  focusOnMount: boolean;
  /** The backend created the draft and the payer's wallet gave a consent URL. */
  onAuthorizationStarted: (mandateId: string, redirectUrl: string) => void;
  /** The draft exists, but authorization could not start. */
  onCreatedWithoutConsent: (mandateId: string, errorCode: string) => void;
  /** This environment can't ask the wallet for a grant, so only the draft was saved, on purpose. */
  onDraftSaved: (mandateId: string, reason: string) => void;
}) {
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<readonly { field: string; message: string }[]>([]);

  const asset = walletAsset(me);
  const assetConfirmed = me.payerWallet.status === "RESOLVED";
  // Only ask the wallet when the backend says this session may. Otherwise save a draft and say so.
  const draftOnlyReason =
    me.payerGrants === "enabled"
      ? null
      : me.payerGrants === "not_configured"
        ? "OPEN_PAYMENTS_NOT_CONFIGURED"
        : "PAYER_GRANTS_DISABLED_FOR_DEMO";
  // The wizard only renders after the person opened it, never during prerender.
  const [today] = useState(() => new Date());
  const index = WIZARD_STEPS.indexOf(step);
  const issues = stepIssues(step, draft, asset, today);
  const issueFor = (field: keyof WizardDraft) =>
    showIssues ? issues.find((issue) => issue.field === field)?.message : undefined;
  const update = (patch: Partial<WizardDraft>) => onDraftChange({ ...draft, ...patch });

  function next() {
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    setShowIssues(false);
    onStepChange(WIZARD_STEPS[index + 1]);
  }

  async function submit() {
    const body = toCreateBody(draft, asset);
    if (!body) return;
    setBusy(true);
    setSubmitError(null);
    setServerIssues([]);
    let mandateId: string;
    try {
      mandateId = (await compasApi.createMandate(partyId, body)).id;
    } catch (error) {
      setBusy(false);
      if (error instanceof CompasApiError && error.fieldErrors.length > 0) {
        setServerIssues(error.fieldErrors);
        onStepChange(stepForField(error.fieldErrors[0].field));
        return;
      }
      setSubmitError(errorText(errorCode(error)));
      return;
    }
    if (draftOnlyReason) {
      setBusy(false);
      onDraftSaved(mandateId, draftOnlyReason);
      return;
    }
    try {
      const { redirectUrl } = await compasApi.authorize(partyId, mandateId);
      onAuthorizationStarted(mandateId, redirectUrl);
    } catch (error) {
      setBusy(false);
      onCreatedWithoutConsent(mandateId, errorCode(error));
    }
  }

  const delegate = participants.find((person) => person.id === draft.delegateId);
  const beneficiary = participants.find((person) => person.id === draft.beneficiaryId);
  const parsedBudget = parseAmountInput(draft.amount, asset.assetScale);
  const parsedCap = draft.confidence !== "HIGH" ? parseAmountInput(draft.capAmount, asset.assetScale) : undefined;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-(--cx-muted)">
          Paso {index + 1} de {WIZARD_STEPS.length}
        </p>
        <div aria-hidden="true" className="mt-1.5 flex gap-1">
          {WIZARD_STEPS.map((item, position) => (
            <span
              key={item}
              className={`h-1 flex-1 rounded-full ${position <= index ? "bg-(--cx-route)" : "bg-(--cx-line)"}`}
            />
          ))}
        </div>
        <div className="mt-4">
          <ScreenHeading focusOnMount={focusOnMount}>{STEP_TITLE[step]}</ScreenHeading>
        </div>
      </div>

      {serverIssues.length > 0 ? (
        <Notice tone="danger" title="COMPAS no aceptó el presupuesto">
          <ul className="list-disc pl-4">
            {serverIssues.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {step === "participants" ? (
        <div className="space-y-5">
          <ParticipantPicker
            legend="Quién podrá pagar"
            hint="Recibe permiso para pagar compras. No recibe tu dinero."
            name="delegate"
            people={participants}
            value={draft.delegateId}
            onChange={(delegateId) => update({ delegateId })}
            issue={issueFor("delegateId")}
          />
          <ParticipantPicker
            legend="Para quién es"
            hint="No necesita billetera. Es a quien benefician las compras."
            name="beneficiary"
            people={participants}
            value={draft.beneficiaryId}
            onChange={(beneficiaryId) => update({ beneficiaryId })}
            issue={issueFor("beneficiaryId")}
          />
          <Notice>Por ahora solo puedes elegir personas de demostración. Aún no hay agenda de contactos.</Notice>
        </div>
      ) : null}

      {step === "purpose" ? (
        <div className="space-y-3">
          <p className="text-[14px] leading-snug text-(--cx-muted)">
            COMPAS solo dejará pagar en comercios de estas categorías.
          </p>
          <CategoryPicker
            value={draft.categories}
            onChange={(categories) => update({ categories })}
            issue={issueFor("categories")}
          />
          {draft.categories.length === 1 ? (
            <p className="text-[13px] text-(--cx-muted)">
              {CATEGORY_LABEL[draft.categories[0]]}: {CATEGORY_DESCRIPTION[draft.categories[0]]}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "budget" ? (
        <div className="space-y-4">
          <TextField
            label="Monto máximo"
            hint="Es lo máximo que se podrá pagar. El dinero sigue en tu billetera hasta cada compra."
            value={draft.amount}
            onChange={(amount) => update({ amount })}
            inputMode="decimal"
            suffix={asset.assetCode}
            issue={issueFor("amount")}
          />
          {!assetConfirmed ? (
            <Notice tone="warn">
              No pudimos leer la moneda de tu billetera. Usaremos {asset.assetCode}, sin convertir nada. Si tu billetera
              usa otra moneda, rechazará la autorización y el presupuesto no se activará.
            </Notice>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Desde"
              type="date"
              value={draft.startDate}
              min={toDateInput(today)}
              onChange={(startDate) => update({ startDate })}
              issue={issueFor("startDate")}
            />
            <TextField
              label="Hasta"
              type="date"
              value={draft.endDate}
              min={draft.startDate}
              onChange={(endDate) => update({ endDate })}
              issue={issueFor("endDate")}
            />
          </div>
          <p className="text-[13px] text-(--cx-muted)">Es un presupuesto único. No se renueva cada mes.</p>
        </div>
      ) : null}

      {step === "rules" ? (
        <div className="space-y-6">
          <EnforcementPicker
            value={draft.enforcement}
            acknowledged={draft.monitoredAcknowledged}
            onChange={(enforcement) => update({ enforcement, monitoredAcknowledged: false })}
            onAcknowledge={(monitoredAcknowledged) => update({ monitoredAcknowledged })}
            issue={issueFor("monitoredAcknowledged")}
          />
          <ConfidencePicker value={draft.confidence} onChange={(confidence) => update({ confidence })} />
          <details className="rounded-(--cx-radius) border border-(--cx-line) p-3.5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer text-[14px] font-semibold text-(--cx-ink)">Configuración avanzada</summary>
            <div className="mt-3">
              {draft.confidence === "HIGH" ? (
                <p className="text-[13px] text-(--cx-muted)">
                  Con confianza alta no hace falta un límite adicional: solo pasan comercios verificados.
                </p>
              ) : (
                <TextField
                  label="Límite por compra en comercios con confianza menor que alta"
                  hint="Opcional. Una compra más grande en esos comercios quedará retenida para revisión."
                  value={draft.capAmount}
                  onChange={(capAmount) => update({ capAmount })}
                  inputMode="decimal"
                  suffix={asset.assetCode}
                  issue={issueFor("capAmount")}
                />
              )}
            </div>
          </details>
        </div>
      ) : null}

      {step === "review" && parsedBudget.ok ? (
        <div className="space-y-4">
          <AuthorizationSummary
            payer={me.party.displayName}
            delegate={delegate?.displayName ?? ""}
            beneficiary={beneficiary?.displayName ?? ""}
            categories={draft.categories}
            budget={{ ...asset, value: parsedBudget.minorUnits }}
            validFrom={startOfDayIso(draft.startDate) ?? draft.startDate}
            expiresAt={endOfDayIso(draft.endDate) ?? draft.endDate}
            enforcement={draft.enforcement}
            confidence={draft.confidence}
            cap={parsedCap?.ok ? { ...asset, value: parsedCap.minorUnits } : undefined}
          />
          {draftOnlyReason ? (
            <Notice tone="warn" title="Se guardará como borrador">
              {errorText(draftOnlyReason)} Un borrador no autoriza nada: {delegate?.displayName ?? "la persona"} no
              podrá usarlo hasta que lo apruebes en tu billetera.
            </Notice>
          ) : (
            <Notice title="Qué pasa al autorizar">
              Te llevaremos a tu billetera para que apruebes un permiso de hasta{" "}
              {formatMoneyAmount({ ...asset, value: parsedBudget.minorUnits })}. No se mueve dinero ahora: cada
              compra se paga desde tu billetera directo al comercio, solo si cumple tus reglas.
            </Notice>
          )}
          {!assetConfirmed ? (
            <Notice tone="warn">
              La moneda {asset.assetCode} no está confirmada por tu billetera. COMPAS no hace conversiones: si no
              coincide, la billetera rechazará la autorización.
            </Notice>
          ) : null}
          {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
        </div>
      ) : null}

      <div className="space-y-2 pt-1">
        {step === "review" ? (
          <Button onClick={submit} disabled={busy}>
            {busy ? "Creando presupuesto…" : draftOnlyReason ? "Guardar borrador" : "Crear y autorizar presupuesto"}
          </Button>
        ) : (
          <Button onClick={next}>Continuar</Button>
        )}
        {index > 0 ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setShowIssues(false);
              onStepChange(WIZARD_STEPS[index - 1]);
            }}
          >
            Atrás
          </Button>
        ) : null}
      </div>
    </div>
  );
}
