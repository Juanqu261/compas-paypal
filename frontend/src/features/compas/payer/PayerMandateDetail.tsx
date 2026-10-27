"use client";

import { useState } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import { compasApi, errorCode } from "../api/client";
import type { MandateView, MeResponse, SpendingResponse } from "../api/contracts";
import { useMandate, useSpending } from "../api/hooks";
import type { PayPalReturn } from "../demo-identities";
import { formatDate } from "../lib/dates";
import { categoryList, ENFORCEMENT_LABEL, errorText, isAuthorized, payerStatusLabel } from "../lib/labels";
import { ActivityList } from "../ui/ActivityList";
import { CapacityRoute } from "../ui/CapacityRoute";
import { ChevronRightIcon, ShieldIcon, WalletIcon } from "../ui/icons";
import { RulesSummary } from "../ui/RulesSummary";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Facts,
  LoadingState,
  Notice,
  ScreenHeading,
  SectionTitle,
  StaleDataNotice,
  StatusBadge,
} from "../ui/primitives";
import { Avatar, CategoryStack } from "../ui/visuals";

export type DetailNotice =
  | { kind: "paypal-return"; result: PayPalReturn["result"] }
  | { kind: "authorize-error"; code: string }
  | { kind: "activated" };

/** What PayPal's redirect said, as a hint. The activity below is the backend's record. */
function PayPalReturnNotice({ result }: { result: PayPalReturn["result"] }) {
  switch (result) {
    case "completed":
      return <Notice title="Pago aprobado y realizado">PayPal cobró la compra y le pagó al comercio.</Notice>;
    case "pending":
      return (
        <Notice tone="warn" title="Pago en proceso">
          PayPal aceptó el cobro y aún no lo completa. Esta pantalla se actualiza sola.
        </Notice>
      );
    case "waiting":
      return (
        <Notice tone="warn" title="El pago aún no está aprobado">
          Cuando lo apruebes en PayPal, COMPAS lo cobra. Nada se cobra antes.
        </Notice>
      );
    case "cancelled":
      return (
        <Notice tone="warn" title="Cancelaste el pago en PayPal">
          No se cobró nada.
        </Notice>
      );
    case "unconfirmed":
      return (
        <Notice tone="warn" title="Confirmando con PayPal">
          PayPal no confirmó el resultado todavía. Esta pantalla se actualiza sola.
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="danger" title="El pago no se realizó">
          No se cobró nada. El motivo está en los movimientos.
        </Notice>
      );
  }
}

function Totals({ mandate, spending }: { mandate: MandateView; spending?: SpendingResponse }) {
  const totals = spending?.activity.totals;
  const authorized = isAuthorized(mandate);
  const waiting = totals ? totals.inProgressCount + totals.awaitingApprovalCount : 0;
  return (
    <Facts
      rows={[
        { label: "Para", value: mandate.delegate.displayName },
        {
          label: "Uso",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <CategoryStack categories={mandate.purposePolicy.eligibleCategories} />
              {categoryList(mandate.purposePolicy.eligibleCategories)}
            </span>
          ),
        },
        { label: authorized ? "Presupuesto autorizado" : "Presupuesto por autorizar", value: formatMoneyAmount(mandate.budget) },
        ...(authorized
          ? [
              { label: "Pagado", value: totals ? formatMoneyAmount(totals.completed) : "…" },
              ...(totals && waiting > 0
                ? [{ label: `Por aprobar o en proceso (${waiting})`, value: formatMoneyAmount(totals.inProgress) }]
                : []),
            ]
          : []),
        { label: "Vigencia", value: `${formatDate(mandate.validFrom)} al ${formatDate(mandate.expiresAt)}` },
        { label: "Control", value: ENFORCEMENT_LABEL[mandate.purposePolicy.enforcement] },
      ]}
    />
  );
}

export function PayerMandateDetail({
  partyId,
  id,
  active,
  focusOnMount,
  notice,
  onOpenHistory,
  payerApproval,
}: {
  partyId: string;
  id: string;
  active: boolean;
  focusOnMount: boolean;
  notice?: DetailNotice;
  onOpenHistory: () => void;
  /** Whether only Pedro's own PayPal account can approve. Unknown until /me answers. */
  payerApproval?: MeResponse["payerApproval"];
}) {
  const mandate = useMandate(partyId, id, active);
  const spending = useSpending(partyId, id, active);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"authorize" | "revoke" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [authorizeError, setAuthorizeError] = useState<string | null>(
    notice?.kind === "authorize-error" ? notice.code : null,
  );

  if (mandate.resource.status === "loading") return <LoadingState label="Cargando el presupuesto" />;
  if (mandate.resource.status === "error") return <ErrorState error={mandate.resource.error} onRetry={mandate.reload} />;
  const view = mandate.resource.data;
  const auth = view.authorization;
  const spendingData = spending.resource.status === "ready" ? spending.resource.data : undefined;

  async function authorize() {
    setBusy("authorize");
    setActionError(null);
    try {
      await compasApi.authorize(partyId, id);
      setAuthorizeError(null);
    } catch (error) {
      setAuthorizeError(errorCode(error));
    } finally {
      setBusy(null);
      mandate.reload();
    }
  }

  async function revoke() {
    setBusy("revoke");
    setActionError(null);
    try {
      await compasApi.revoke(partyId, id);
      setConfirming(false);
    } catch (error) {
      setActionError(errorText(errorCode(error)));
    } finally {
      setBusy(null);
      mandate.reload();
      spending.reload();
    }
  }

  const draftOnly = view.status === "DRAFT";
  const entries = spendingData?.activity.entries ?? [];
  const toApprove = entries.filter((entry) => entry.approvalUrl);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={view.delegate.displayName} seed={view.delegate.id} size="lg" />
        <div className="min-w-0 space-y-1">
          <ScreenHeading focusOnMount={focusOnMount}>Para {view.delegate.displayName}</ScreenHeading>
          <StatusBadge status={view.status} label={payerStatusLabel(view)} />
        </div>
      </div>

      {notice?.kind === "paypal-return" ? <PayPalReturnNotice result={notice.result} /> : null}
      {notice?.kind === "activated" && view.status === "ACTIVE" ? (
        <Notice title="Presupuesto activo">
          {view.delegate.displayName} ya puede usarlo. Cada compra permitida te llegará para aprobarla en PayPal.
        </Notice>
      ) : null}
      {mandate.refreshError ? <StaleDataNotice error={mandate.refreshError} /> : null}
      {authorizeError && auth?.canAuthorize ? (
        <Notice tone="danger" title="El presupuesto no quedó activo">
          {errorText(authorizeError)}
        </Notice>
      ) : null}

      <div className="rounded-(--cx-radius) border border-(--cx-line) p-4">
        <CapacityRoute mandate={view} />
      </div>

      {auth?.canAuthorize ? (
        <div className="space-y-2">
          <Button onClick={authorize} disabled={busy !== null}>
            <ShieldIcon className="size-5" />
            {busy === "authorize" ? "Activando…" : "Autorizar presupuesto"}
          </Button>
          <p className="text-center text-[12px] text-(--cx-muted)">
            Hasta {formatMoneyAmount(view.budget)}. Aprobarás cada pago en PayPal.
          </p>
        </div>
      ) : null}

      {toApprove.length > 0 ? (
        <section aria-labelledby="detail-approve" className="space-y-1 rounded-(--cx-radius) border border-(--cx-route)/40 p-3.5">
          <SectionTitle id="detail-approve">Por aprobar en PayPal</SectionTitle>
          <p className="text-[13px] text-(--cx-muted)">
            {view.delegate.displayName} hizo una compra que cumple tus reglas. Apruébala para pagarle al comercio.
          </p>
          <ActivityList entries={toApprove} />
        </section>
      ) : null}

      {spendingData && !spendingData.activity.totals.capacityReconciled ? (
        <Notice tone="warn" title="La capacidad aún no descuenta todas las compras">
          Cada pago igual necesita tu aprobación en PayPal.
        </Notice>
      ) : null}

      <p className="flex gap-2 text-[13px] leading-snug text-(--cx-ink)">
        <WalletIcon className="mt-px size-[18px] shrink-0 text-(--cx-route)" />
        {isAuthorized(view)
          ? "Es una autorización, no un saldo: el dinero sigue en tu PayPal hasta que apruebes cada pago."
          : `Aún no autoriza nada. Tu dinero no se mueve.`}
      </p>
      {isAuthorized(view) && payerApproval === "ANY_ACCOUNT" ? (
        <p className="text-[12px] text-(--cx-muted)">
          En esta demostración, cualquier cuenta de PayPal de prueba puede aprobar los pagos.
        </p>
      ) : null}

      <section aria-labelledby="detail-activity" className="space-y-1">
        <SectionTitle id="detail-activity">Movimientos</SectionTitle>
        {entries.length > 0 ? (
          <>
            {/* The approve button is in "Por aprobar" above, once. */}
            <ActivityList entries={entries.slice(0, 3)} approvals={false} />
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex w-full items-center justify-between py-2 text-[14px] font-semibold text-(--cx-ink) focus-visible:outline-2 focus-visible:outline-(--cx-focus)"
            >
              Ver todos
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : (
          <p className="py-2 text-[13px] text-(--cx-muted)">
            {view.status === "ACTIVE" ? "Aún no hay compras." : "Sin movimientos."}
          </p>
        )}
      </section>

      <section aria-labelledby="detail-summary" className="space-y-1">
        <SectionTitle id="detail-summary">Resumen</SectionTitle>
        <Totals mandate={view} spending={spendingData} />
      </section>

      <details className="rounded-(--cx-radius) border border-(--cx-line) [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between p-3.5 text-[14px] font-semibold text-(--cx-ink)">
          Reglas completas
          <ChevronRightIcon className="size-4 text-(--cx-muted)" />
        </summary>
        <div className="border-t border-(--cx-line) p-3.5">
          <RulesSummary policy={view.purposePolicy} />
        </div>
      </details>

      {auth?.canRevoke ? (
        <div className="space-y-2">
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy !== null}>
            {draftOnly ? "Descartar borrador" : "Revocar autorización"}
          </Button>
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={draftOnly ? "¿Descartar este borrador?" : "¿Revocar esta autorización?"}
        confirmLabel={draftOnly ? "Descartar borrador" : "Revocar autorización"}
        busy={busy === "revoke"}
        onConfirm={revoke}
        onCancel={() => setConfirming(false)}
      >
        {draftOnly
          ? "No se podrá autorizar después."
          : `${view.delegate.displayName} ya no podrá pagar con este presupuesto, y un pago por aprobar ya no se cobrará. Las compras ya pagadas no se revierten.`}
      </ConfirmDialog>
    </div>
  );
}
