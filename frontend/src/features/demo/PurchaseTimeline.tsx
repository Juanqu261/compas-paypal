"use client";

import { useMemo } from "react";
import { useDemoSession } from "./DemoSession";
import { useMandateList, useSpending } from "@/features/compas/api/hooks";
import { DEMO_PARTY_IDS } from "@/features/compas/demo-identities";
import { presentMerchantDisplayName } from "@/features/compas/lib/merchant-display";
import { formatMoneyAmount } from "@/lib/format-money";

type StepState = "idle" | "done" | "current" | "blocked";

type Step = {
  id: string;
  title: string;
  detail: string;
  state: StepState;
};

function chargeDecision(charge: ReturnType<typeof useDemoSession>["charge"]) {
  const result = charge?.result;
  if (result?.kind === "PREVIEW") {
    return result.preview.next === "ORDER" ? "ALLOW" : result.preview.next === "STOP_DENY" ? "DENY" : "REVIEW";
  }
  if (result?.kind === "PURCHASE") return result.purchase.outcome;
  return undefined;
}

/**
 * Act 2 readout: a verifiable timeline from real COMPAS / PayPal sandbox state.
 * Capacity language stays non-custodial (authorized / reserved / available / captured).
 */
export function PurchaseTimeline() {
  const { charge } = useDemoSession();
  const mandates = useMandateList(DEMO_PARTY_IDS.pedro, "payer", true, 0);
  const active = useMemo(() => {
    const list = mandates.resource.status === "ready" ? mandates.resource.data : [];
    return list.find((m) => m.status === "ACTIVE") ?? list[0];
  }, [mandates.resource]);
  const spending = useSpending(DEMO_PARTY_IDS.pedro, active?.id ?? null, true);
  const activity = spending.resource.status === "ready" ? spending.resource.data.activity : undefined;
  const entries = activity?.entries ?? [];
  const latest = entries[0];
  const outcome = chargeDecision(charge);
  const merchant = charge?.merchantDisplayName
    ? presentMerchantDisplayName(charge.merchantDisplayName)
    : latest?.merchantDisplayName
      ? presentMerchantDisplayName(latest.merchantDisplayName)
      : "Central Pharmacy";

  const mandateActive = active?.status === "ACTIVE";
  const awaiting = latest?.kind === "AWAITING_APPROVAL";
  const completed = latest?.kind === "COMPLETED";
  const denied = outcome === "DENY" || latest?.kind === "DENIED";
  const reasons = latest?.reasonCodes?.length
    ? latest.reasonCodes.join(", ")
    : charge?.result?.kind === "PURCHASE"
      ? charge.result.purchase.reasonCodes.join(", ")
      : "";

  const steps: Step[] = [
    {
      id: "mandate",
      title: "Pedro authorizes the mandate",
      detail: mandateActive
        ? `ACTIVE · authorized ${active ? formatMoneyAmount(active.budget) : ""}`
        : "No ACTIVE mandate in this demo yet",
      state: mandateActive ? "done" : "current",
    },
    {
      id: "request",
      title: "Andrea requests the purchase",
      detail: charge
        ? `${formatMoneyAmount(charge.amount)} at ${merchant}`
        : "Wait for the charge from the pharmacy phone",
      state: charge ? "done" : mandateActive ? "current" : "idle",
    },
    {
      id: "policy",
      title: "COMPAS checks purpose",
      detail: denied
        ? `DENY${reasons ? ` · ${reasons}` : ""} · no PayPal order created`
        : outcome === "ALLOW" || awaiting || completed
          ? "ALLOW · mandate and merchant rules matched"
          : outcome === "REVIEW"
            ? "REVIEW · held for a person"
            : "Waiting for a decision",
      state: denied
        ? "blocked"
        : outcome || awaiting || completed
          ? "done"
          : charge
            ? "current"
            : "idle",
    },
    {
      id: "order",
      title: "ALLOW creates a PayPal order",
      detail: denied
        ? "No order (policy stopped before PayPal)"
        : awaiting || completed
          ? "Real sandbox order, waiting or already approved"
          : "Only after ALLOW",
      state: denied ? "blocked" : awaiting || completed ? "done" : outcome === "ALLOW" ? "current" : "idle",
    },
    {
      id: "approve",
      title: "Pedro approves at PayPal",
      detail: completed
        ? "Approved in Sandbox"
        : awaiting
          ? "Open the approval link on Pedro’s phone"
          : "The payer must approve; COMPAS never charges alone",
      state: completed ? "done" : awaiting ? "current" : "idle",
    },
    {
      id: "capture",
      title: "COMPAS captures",
      detail: completed
        ? "COMPLETED after payer, payee, amount and mandate checks"
        : "Only after PayPal APPROVED and COMPAS re-checks",
      state: completed ? "done" : "idle",
    },
    {
      id: "receive",
      title: `${merchant} is paid`,
      detail: completed
        ? "Visible in PayPal Business Sandbox / payments API"
        : "Money goes to the Business account, not to Andrea",
      state: completed ? "done" : "idle",
    },
    {
      id: "budget",
      title: "Capacity updates",
      detail: active
        ? [
            `Authorized ${formatMoneyAmount(active.budget)}`,
            activity?.totals?.inProgress
              ? `· reserved ${formatMoneyAmount(activity.totals.inProgress)}`
              : null,
            `· available ${formatMoneyAmount(active.remainingAuthorizedAmount)}`,
            completed && latest ? `· captured ${formatMoneyAmount(latest.requestedAmount)}` : null,
          ]
            .filter(Boolean)
            .join(" ")
        : "Capacity is authorization, not custody in COMPAS",
      state: completed || mandateActive ? (completed ? "done" : "idle") : "idle",
    },
  ];

  return (
    <section
      aria-labelledby="purchase-timeline-heading"
      className="mt-8 rounded-3xl border border-ink/10 bg-paper p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-route-deep uppercase">Verifiable path</p>
          <h2 id="purchase-timeline-heading" className="font-display text-2xl text-ink">
            From mandate to payment
          </h2>
        </div>
        <p className="max-w-md text-sm text-ink-soft">
          States come from COMPAS and PayPal Sandbox. Capacity is authorization, not money COMPAS holds.
          Simulated: app screens. Real: sandbox orders and captures.
        </p>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`rounded-2xl border p-3 ${
              step.state === "done"
                ? "border-route/40 bg-route/5"
                : step.state === "current"
                  ? "border-ink bg-shoal/50 ring-2 ring-ink/10"
                  : step.state === "blocked"
                    ? "border-buff bg-buff/30"
                    : "border-ink/10 bg-paper"
            }`}
          >
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              {index + 1}.{" "}
              {step.state === "done" ? "Done" : step.state === "current" ? "Now" : step.state === "blocked" ? "Blocked" : "Pending"}
            </p>
            <p className="mt-1 font-semibold text-ink">{step.title}</p>
            <p className="mt-1 text-sm text-ink-soft">{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
