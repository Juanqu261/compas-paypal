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
      return <Notice title="Payment approved and completed">PayPal charged the purchase and paid the merchant.</Notice>;
    case "pending":
      return (
        <Notice tone="warn" title="Payment in progress">
          PayPal accepted the charge but hasn&apos;t completed it yet. This screen updates on its own.
        </Notice>
      );
    case "waiting":
      return (
        <Notice tone="warn" title="The payment isn't approved yet">
          Once you approve it at PayPal, COMPAS captures it. Nothing is charged before then.
        </Notice>
      );
    case "cancelled":
      return (
        <Notice tone="warn" title="You cancelled the payment at PayPal">
          Nothing was charged.
        </Notice>
      );
    case "unconfirmed":
      return (
        <Notice tone="warn" title="Confirming with PayPal">
          PayPal hasn&apos;t confirmed the result yet. This screen updates on its own.
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="danger" title="The payment didn't go through">
          Nothing was charged. The reason is in the activity.
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
        { label: "For", value: mandate.delegate.displayName },
        {
          label: "Use",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <CategoryStack categories={mandate.purposePolicy.eligibleCategories} />
              {categoryList(mandate.purposePolicy.eligibleCategories)}
            </span>
          ),
        },
        { label: authorized ? "Authorized budget" : "Budget to authorize", value: formatMoneyAmount(mandate.budget) },
        ...(authorized
          ? [
              { label: "Paid", value: totals ? formatMoneyAmount(totals.completed) : "…" },
              ...(totals && waiting > 0
                ? [{ label: `Awaiting approval or in progress (${waiting})`, value: formatMoneyAmount(totals.inProgress) }]
                : []),
            ]
          : []),
        { label: "Valid", value: `${formatDate(mandate.validFrom)} to ${formatDate(mandate.expiresAt)}` },
        { label: "Rules", value: ENFORCEMENT_LABEL[mandate.purposePolicy.enforcement] },
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

  if (mandate.resource.status === "loading") return <LoadingState label="Loading the budget" />;
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
          <ScreenHeading focusOnMount={focusOnMount}>For {view.delegate.displayName}</ScreenHeading>
          <StatusBadge status={view.status} label={payerStatusLabel(view)} />
        </div>
      </div>

      {notice?.kind === "paypal-return" ? <PayPalReturnNotice result={notice.result} /> : null}
      {notice?.kind === "activated" && view.status === "ACTIVE" ? (
        <Notice title="Budget active">
          {view.delegate.displayName} can use it now. Each allowed purchase will come to you to approve at PayPal.
        </Notice>
      ) : null}
      {mandate.refreshError ? <StaleDataNotice error={mandate.refreshError} /> : null}
      {authorizeError && auth?.canAuthorize ? (
        <Notice tone="danger" title="The budget didn't become active">
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
            {busy === "authorize" ? "Activating…" : "Authorize budget"}
          </Button>
          <p className="text-center text-[12px] text-(--cx-muted)">
            Up to {formatMoneyAmount(view.budget)}. You&apos;ll approve each payment at PayPal.
          </p>
        </div>
      ) : null}

      {toApprove.length > 0 ? (
        <section aria-labelledby="detail-approve" className="space-y-1 rounded-(--cx-radius) border border-(--cx-route)/40 p-3.5">
          <SectionTitle id="detail-approve">Waiting for your approval at PayPal</SectionTitle>
          <p className="text-[13px] text-(--cx-muted)">
            {view.delegate.displayName} made a purchase that follows your rules. Approve it to pay the merchant.
          </p>
          <ActivityList entries={toApprove} />
        </section>
      ) : null}

      {spendingData && !spendingData.activity.totals.capacityReconciled ? (
        <Notice tone="warn" title="Available amount doesn't reflect every purchase yet">
          Every payment still needs your approval at PayPal.
        </Notice>
      ) : null}

      <p className="flex gap-2 text-[13px] leading-snug text-(--cx-ink)">
        <WalletIcon className="mt-px size-[18px] shrink-0 text-(--cx-route)" />
        {isAuthorized(view)
          ? "This is an authorization, not a balance: your money stays in your PayPal until you approve each payment."
          : `It doesn't authorize anything yet. Your money doesn't move.`}
      </p>
      {isAuthorized(view) && payerApproval === "ANY_ACCOUNT" ? (
        <p className="text-[12px] text-(--cx-muted)">
          In this demo, any PayPal test account can approve the payments.
        </p>
      ) : null}

      <section aria-labelledby="detail-activity" className="space-y-1">
        <SectionTitle id="detail-activity">Activity</SectionTitle>
        {entries.length > 0 ? (
          <>
            {/* The approve button is in "Waiting for your approval" above, once. */}
            <ActivityList entries={entries.slice(0, 3)} approvals={false} />
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex w-full items-center justify-between py-2 text-[14px] font-semibold text-(--cx-ink) focus-visible:outline-2 focus-visible:outline-(--cx-focus)"
            >
              See all
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : (
          <p className="py-2 text-[13px] text-(--cx-muted)">
            {view.status === "ACTIVE" ? "No purchases yet." : "No activity."}
          </p>
        )}
      </section>

      <section aria-labelledby="detail-summary" className="space-y-1">
        <SectionTitle id="detail-summary">Summary</SectionTitle>
        <Totals mandate={view} spending={spendingData} />
      </section>

      <details className="rounded-(--cx-radius) border border-(--cx-line) [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between p-3.5 text-[14px] font-semibold text-(--cx-ink)">
          Full rules
          <ChevronRightIcon className="size-4 text-(--cx-muted)" />
        </summary>
        <div className="border-t border-(--cx-line) p-3.5">
          <RulesSummary policy={view.purposePolicy} />
        </div>
      </details>

      {auth?.canRevoke ? (
        <div className="space-y-2">
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy !== null}>
            {draftOnly ? "Discard draft" : "Revoke authorization"}
          </Button>
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={draftOnly ? "Discard this draft?" : "Revoke this authorization?"}
        confirmLabel={draftOnly ? "Discard draft" : "Revoke authorization"}
        busy={busy === "revoke"}
        onConfirm={revoke}
        onCancel={() => setConfirming(false)}
      >
        {draftOnly
          ? "You won't be able to authorize it afterward."
          : `${view.delegate.displayName} will no longer be able to pay with this budget, and a payment waiting for approval won't be charged. Purchases already paid are not reversed.`}
      </ConfirmDialog>
    </div>
  );
}
