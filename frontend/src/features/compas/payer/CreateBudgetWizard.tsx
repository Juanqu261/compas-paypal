"use client";

import { useState, type ReactNode } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import { CompasApiError, compasApi, errorCode } from "../api/client";
import type { PartyView } from "../api/contracts";
import { parseAmountInput } from "../lib/amounts";
import { addDays, endOfDayIso, formatDate, startOfDayIso, toDateInput } from "../lib/dates";
import { categoryList, CONFIDENCE_LABEL, ENFORCEMENT_LABEL, errorText } from "../lib/labels";
import {
  type Asset,
  DURATIONS,
  stepForField,
  stepIssues,
  toCreateBody,
  WIZARD_STEP_LABEL,
  WIZARD_STEPS,
  type WizardDraft,
  type WizardStep,
} from "../lib/wizard";
import { ContactPicker } from "../ui/ContactPicker";
import { ConfidencePicker, EnforcementPicker, FieldIssue, TextField } from "../ui/forms";
import { CalendarIcon, ShieldIcon, SlidersIcon, WalletIcon } from "../ui/icons";
import { Button, Notice, ScreenHeading } from "../ui/primitives";
import { Avatar, CategoryStack, CategoryTiles, StepBar } from "../ui/visuals";

const STEP_TITLE: Record<WizardStep, string> = {
  contact: "Who gets the budget?",
  budget: "How much, and for what?",
  confirm: "Review and authorize",
};

/**
 * Budgets are in USD: every PayPal order COMPAS creates is in the budget's
 * currency, and COMPAS does not convert. Pedro's PayPal handles his own
 * funding currency when he approves an order.
 */
export const BUDGET_ASSET: Asset = { assetCode: "USD", assetScale: 2 };

function SummaryRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--cx-card) text-(--cx-ink)">{icon}</span>
      <span className="min-w-0 text-[15px] text-(--cx-ink)">{children}</span>
    </li>
  );
}

export function CreateBudgetWizard({
  partyId,
  participants,
  draft,
  onDraftChange,
  step,
  onStepChange,
  focusOnMount,
  onAuthorized,
  onCreatedWithoutConsent,
}: {
  partyId: string;
  participants: readonly PartyView[];
  draft: WizardDraft;
  onDraftChange: (next: WizardDraft) => void;
  step: WizardStep;
  onStepChange: (next: WizardStep) => void;
  focusOnMount: boolean;
  /** The backend created the budget and activated it. Each purchase still waits for Pedro's PayPal approval. */
  onAuthorized: (mandateId: string) => void;
  /** The draft exists, but it could not be activated. */
  onCreatedWithoutConsent: (mandateId: string, errorCode: string) => void;
}) {
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<readonly { field: string; message: string }[]>([]);

  const asset = BUDGET_ASSET;
  // The wizard only renders after the person opened it, never during prerender.
  const [today] = useState(() => new Date());
  const index = WIZARD_STEPS.indexOf(step);
  const issues = stepIssues(step, draft, asset, today);
  const issueFor = (field: keyof WizardDraft) =>
    showIssues ? issues.find((issue) => issue.field === field)?.message : undefined;
  const update = (patch: Partial<WizardDraft>) => onDraftChange({ ...draft, ...patch });

  const contact = participants.find((person) => person.id === draft.contactId);
  const parsedBudget = parseAmountInput(draft.amount, asset.assetScale);
  const parsedCap = draft.confidence !== "HIGH" ? parseAmountInput(draft.capAmount, asset.assetScale) : undefined;
  const advancedChanged = draft.enforcement !== "ENFORCED" || draft.confidence !== "HIGH";

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
    if (!body || busy) return;
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
    try {
      await compasApi.authorize(partyId, mandateId);
      setBusy(false);
      onAuthorized(mandateId);
    } catch (error) {
      setBusy(false);
      onCreatedWithoutConsent(mandateId, errorCode(error));
    }
  }

  const chosenDays = DURATIONS.find(
    (option) => draft.startDate === toDateInput(today) && draft.endDate === toDateInput(addDays(today, option.days)),
  )?.days;

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <StepBar steps={WIZARD_STEPS.map((item) => WIZARD_STEP_LABEL[item])} current={index} />
        <ScreenHeading focusOnMount={focusOnMount}>{STEP_TITLE[step]}</ScreenHeading>
      </div>

      {serverIssues.length > 0 ? (
        <Notice tone="danger" title="COMPAS didn't accept the budget">
          <ul className="list-disc pl-4">
            {serverIssues.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {step === "contact" ? (
        <ContactPicker
          people={participants}
          value={draft.contactId}
          onChange={(contactId) => update({ contactId })}
          issue={issueFor("contactId")}
        />
      ) : null}

      {step === "budget" ? (
        <div className="space-y-6">
          <div>
            <label htmlFor="budget-amount" className="text-[14px] font-semibold text-(--cx-ink)">
              Maximum amount
            </label>
            <div className="mt-1.5 flex items-baseline gap-2 border-b-2 border-(--cx-line-strong) pb-1 focus-within:border-(--cx-route)">
              <input
                id="budget-amount"
                value={draft.amount}
                onChange={(event) => update({ amount: event.target.value })}
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                aria-invalid={issueFor("amount") ? true : undefined}
                className="h-12 min-w-0 flex-1 bg-transparent text-[34px] font-semibold tracking-tight text-(--cx-ink) outline-none tabular-nums placeholder:text-(--cx-line-strong)"
              />
              <span className="text-[16px] font-semibold text-(--cx-muted)">{asset.assetCode}</span>
            </div>
            <FieldIssue message={issueFor("amount")} />
          </div>

          <div>
            <p className="mb-2 text-[14px] font-semibold text-(--cx-ink)">What can it be used for?</p>
            <CategoryTiles
              legend="What can it be used for?"
              value={draft.categories}
              onChange={(categories) => update({ categories })}
            />
            <FieldIssue message={issueFor("categories")} />
          </div>

          <div>
            <p className="mb-2 text-[14px] font-semibold text-(--cx-ink)">Until when?</p>
            <div role="group" aria-label="Duration" className="flex flex-wrap gap-2">
              {DURATIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  aria-pressed={chosenDays === option.days}
                  onClick={() =>
                    update({ startDate: toDateInput(today), endDate: toDateInput(addDays(today, option.days)) })
                  }
                  className="h-10 rounded-full border border-(--cx-line-strong) px-4 text-[14px] font-medium text-(--cx-ink) aria-pressed:border-(--cx-route) aria-pressed:bg-(--cx-route) aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-focus)"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[14px] text-(--cx-ink)">
              <CalendarIcon className="size-5 text-(--cx-muted)" />
              <label htmlFor="budget-end" className="text-(--cx-muted)">
                Ends on
              </label>
              <input
                id="budget-end"
                type="date"
                value={draft.endDate}
                min={draft.startDate}
                onChange={(event) => update({ endDate: event.target.value })}
                className="h-10 rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) px-2 text-[15px] text-(--cx-ink) tabular-nums focus-visible:outline-2 focus-visible:outline-(--cx-focus)"
              />
            </div>
            <FieldIssue message={issueFor("endDate") ?? issueFor("startDate")} />
          </div>

          <details className="rounded-(--cx-radius) border border-(--cx-line) [&_summary::-webkit-details-marker]:hidden" open={advancedChanged || Boolean(issueFor("monitoredAcknowledged") ?? issueFor("capAmount"))}>
            <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-[14px] font-semibold text-(--cx-ink)">
              <SlidersIcon className="size-5 text-(--cx-muted)" />
              Advanced options
              <span className="ml-auto text-[12px] font-normal text-(--cx-muted)">
                {advancedChanged ? "Changed" : "Recommended"}
              </span>
            </summary>
            <div className="space-y-6 border-t border-(--cx-line) p-3.5">
              <EnforcementPicker
                value={draft.enforcement}
                acknowledged={draft.monitoredAcknowledged}
                onChange={(enforcement) => update({ enforcement, monitoredAcknowledged: false })}
                onAcknowledge={(monitoredAcknowledged) => update({ monitoredAcknowledged })}
                issue={issueFor("monitoredAcknowledged")}
              />
              <ConfidencePicker value={draft.confidence} onChange={(confidence) => update({ confidence })} />
              {draft.confidence !== "HIGH" ? (
                <TextField
                  label="Per-purchase limit at lower-confidence merchants"
                  hint="Optional. A larger purchase is held for review."
                  value={draft.capAmount}
                  onChange={(capAmount) => update({ capAmount })}
                  inputMode="decimal"
                  suffix={asset.assetCode}
                  issue={issueFor("capAmount")}
                />
              ) : null}
              <TextField
                label="Starts on"
                type="date"
                value={draft.startDate}
                min={toDateInput(today)}
                onChange={(startDate) => update({ startDate })}
                issue={issueFor("startDate")}
              />
            </div>
          </details>
        </div>
      ) : null}

      {step === "confirm" && parsedBudget.ok && contact ? (
        <div className="space-y-4">
          <div className="rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <Avatar name={contact.displayName} seed={contact.id} size="lg" />
              <p className="text-[18px] leading-tight font-semibold text-(--cx-ink)">
                Budget for {contact.displayName}
              </p>
            </div>
            <ul className="mt-3 divide-y divide-(--cx-line)">
              <SummaryRow icon={<CategoryStack categories={draft.categories} />}>{categoryList(draft.categories)}</SummaryRow>
              <SummaryRow icon={<WalletIcon className="size-5" />}>
                <span className="font-semibold tabular-nums">
                  {formatMoneyAmount({ ...asset, value: parsedBudget.minorUnits })}
                </span>
              </SummaryRow>
              <SummaryRow icon={<CalendarIcon className="size-5" />}>
                Until {formatDate(endOfDayIso(draft.endDate) ?? draft.endDate)}
                {draft.startDate !== toDateInput(today) ? `, starting ${formatDate(startOfDayIso(draft.startDate) ?? draft.startDate)}` : ""}
              </SummaryRow>
              <SummaryRow icon={<ShieldIcon className="size-5" />}>
                {ENFORCEMENT_LABEL[draft.enforcement]}
                {draft.confidence !== "HIGH" ? `. ${CONFIDENCE_LABEL[draft.confidence]} confidence` : ""}
                {parsedCap?.ok ? `, up to ${formatMoneyAmount({ ...asset, value: parsedCap.minorUnits })} per purchase` : ""}
              </SummaryRow>
            </ul>
          </div>

          <p className="flex gap-2 text-[13px] leading-snug text-(--cx-ink)">
            <WalletIcon className="mt-px size-[18px] shrink-0 text-(--cx-route)" />
            Your money stays in your PayPal. {contact.displayName} will be able to request allowed purchases with this
            authorization, and you approve each payment at PayPal.
          </p>
          <p className="text-[13px] text-(--cx-muted)">
            Each allowed purchase will reach you as a PayPal payment for that exact amount, payable to the merchant.
          </p>
          {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
        </div>
      ) : null}

      <div className="space-y-2 pt-1">
        {step === "confirm" ? (
          <Button onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create and authorize"}
          </Button>
        ) : (
          <Button onClick={next} disabled={step === "contact" && !draft.contactId}>
            Continue
          </Button>
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
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
