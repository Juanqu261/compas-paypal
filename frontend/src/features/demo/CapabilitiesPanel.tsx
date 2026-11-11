"use client";

import { useEffect, useState } from "react";
import { compasApi, CompasApiError } from "@/features/compas/api/client";
import type { CapabilityStory } from "@/features/compas/api/contracts";
import { DEMO_PARTY_IDS } from "@/features/compas/demo-identities";
import { formatMoneyAmount } from "@/lib/format-money";

const PEDRO = DEMO_PARTY_IDS.pedro;
const ANDREA = DEMO_PARTY_IDS.andrea;
const USD = { assetCode: "USD", assetScale: 2 } as const;
const REFUND_KEY = "capability-refund-demo-01";
const RECEIPT_TOTAL = { value: "1500", ...USD };

/**
 * Optional panel under the three acts. The figures are demo/test data.
 * The simulated capture and the simulated refund do not call PayPal.
 * A matching receipt is document consistency, not proof the medicine was delivered.
 */
export function CapabilitiesPanel() {
  const [story, setStory] = useState<CapabilityStory | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [medication, setMedication] = useState<string | null>(null);
  const [alcohol, setAlcohol] = useState<string | null>(null);
  const [covered, setCovered] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState("ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    compasApi
      .capabilityStory(PEDRO)
      .then((loaded) => {
        if (!cancelled) setStory(loaded);
      })
      .catch((caught) => {
        if (!cancelled && !(caught instanceof CompasApiError && caught.status === 404)) {
          setError(caught instanceof Error ? caught.message : "The care story could not be read.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof CompasApiError ? caught.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }

  const purchaseId = story?.purchase?.id || story?.story.purchaseId || "";
  const captured = purchaseId.length > 0;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-8" data-testid="capabilities-panel">
      <details className="rounded-lg border border-ink/15 bg-paper/80">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Care story: compare, split, receipt, refund, monthly plan</summary>
        <div className="space-y-4 px-4 pb-4">
          <p className="text-sm text-ink-soft">
            Fictional demo/test data. Pedro still approves every real PayPal order in Act 2. This panel does not charge PayPal. A verified receipt means the
            document matches the authorized purchase. It does not prove physical delivery.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="capabilities-open"
              disabled={busy}
              className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold"
              onClick={() =>
                run(async () => {
                  setStory(await compasApi.openCapabilityStory(PEDRO));
                })
              }
            >
              Open Gladys’s monthly plan
            </button>
            <button
              type="button"
              data-testid="capabilities-generate"
              disabled={busy || !story || planStatus !== "ACTIVE"}
              className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              onClick={() =>
                run(async () => {
                  if (!story) return;
                  const cycle = await compasApi.generateCareCycle(PEDRO, story.story.carePlanId);
                  setPeriodId(cycle.cycle.periodId);
                })
              }
            >
              Generate next cycle
            </button>
            <button
              type="button"
              data-testid="capabilities-confirm"
              disabled={busy || !story || !periodId || captured}
              className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              onClick={() =>
                run(async () => {
                  if (!story || !periodId) return;
                  const cycle = await compasApi.confirmCareCycle(ANDREA, story.story.carePlanId, periodId);
                  setConfirmed(Boolean(cycle.cycle.errandId));
                })
              }
            >
              Andrea confirms the cycle
            </button>
          </div>
          <p data-testid="capabilities-cycle" className="text-sm text-ink">
            {periodId ? `Cycle ${periodId}. PayPal order created: no.` : "No cycle yet. Generating one does not create a PayPal order."}
            {confirmed ? " Andrea confirmed an errand." : ""}
          </p>
          {story ? (
            <>
              <p data-testid="capabilities-remaining" className="font-medium text-ink">
                Remaining authorization capacity: {formatMoneyAmount(story.remaining)}. This is not a PayPal balance.
              </p>
              <div data-testid="capabilities-comparison">
                <h2 className="font-semibold text-ink">Pharmacy comparison</h2>
                <p className="text-sm text-ink-soft">{story.comparison.explanation}</p>
                <table className="mt-2 w-full text-left text-sm">
                  <caption className="sr-only">Eligible and excluded pharmacy offers for the authorized CUM</caption>
                  <thead>
                    <tr>
                      <th className="py-1 pr-3">Merchant</th>
                      <th className="py-1 pr-3">Price</th>
                      <th className="py-1">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {story.comparison.eligible.map((offer) => (
                      <tr key={offer.merchantId} data-testid={offer.merchantId === story.comparison.selected?.merchantId ? "capabilities-selected" : undefined}>
                        <td className="py-1 pr-3">{offer.displayName}</td>
                        <td className="py-1 pr-3">{formatMoneyAmount(offer.unitPrice)}</td>
                        <td className="py-1">{offer.confidence}</td>
                      </tr>
                    ))}
                    {story.comparison.excluded.map((offer) => (
                      <tr key={offer.merchantId}>
                        <td className="py-1 pr-3">{offer.displayName}</td>
                        <td className="py-1 pr-3">Excluded</td>
                        <td className="py-1">{offer.reason ?? offer.confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p data-testid="capabilities-savings" className="mt-1 text-sm text-ink">
                  {story.comparison.savings
                    ? `Saved ${formatMoneyAmount(story.comparison.savings)} against the highest eligible offer in this comparison.`
                    : "Savings are shown only when two eligible offers can be compared."}
                </p>
              </div>
              <div data-testid="capabilities-partition">
                <h2 className="font-semibold text-ink">Split basket</h2>
                <p className="text-sm text-ink">{story.partition.explanation}</p>
                <ul className="mt-1 text-sm text-ink-soft">
                  {story.partition.eligible.map((line) => (
                    <li key={line.id}>Covered: {line.label} {formatMoneyAmount(line.amount)}</li>
                  ))}
                  {story.partition.ineligible.map((line) => (
                    <li key={line.id}>
                      Separate personal payment, not paid by the mandate: {line.label} {formatMoneyAmount(line.amount)} ({line.reasonCodes.join(", ")})
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="capabilities-preview-medication"
                  disabled={busy}
                  className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const preview = await compasApi.previewCapabilityFixture(ANDREA, "medication");
                      setMedication(`${preview.next}. PayPal order created: no.`);
                    })
                  }
                >
                  Preview medication
                </button>
                <button
                  type="button"
                  data-testid="capabilities-preview-alcohol"
                  disabled={busy}
                  className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const preview = await compasApi.previewCapabilityFixture(ANDREA, "alcohol");
                      setAlcohol(`${preview.next}. PayPal order created: no.`);
                    })
                  }
                >
                  Preview alcohol
                </button>
                <button
                  type="button"
                  data-testid="capabilities-covered"
                  disabled={busy}
                  className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const preview = await compasApi.previewCoveredPurchase(ANDREA);
                      setCovered(`${preview.lineCount ?? 0} covered line, ${preview.next}. The shampoo is not in this check.`);
                    })
                  }
                >
                  Check covered lines only
                </button>
              </div>
              <p data-testid="capabilities-previews" className="text-sm text-ink">
                {medication ? `Medication: ${medication} ` : ""}
                {alcohol ? `Alcohol: ${alcohol} ` : ""}
                {covered ?? ""}
              </p>
              <button
                type="button"
                data-testid="capabilities-capture"
                disabled={busy || !confirmed || captured}
                className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() =>
                  run(async () => {
                    const capturedStory = await compasApi.recordCapabilityCapture(PEDRO);
                    const next = await compasApi.capabilityStory(PEDRO);
                    setStory({ ...next, remaining: capturedStory.remaining, purchase: capturedStory.purchase });
                  })
                }
              >
                Record simulated USD 15 capture
              </button>
              <p className="text-sm text-ink-soft">Simulation only. Act 2 is where Pedro approves a real sandbox order.</p>
              {captured ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="capabilities-evidence-valid"
                    disabled={busy}
                    className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold"
                    onClick={() =>
                      run(async () => {
                        const result = await compasApi.submitCapabilityEvidence(ANDREA, {
                          purchaseId,
                          receipt: {
                            merchantId: "demo-merchant-drogueria-central",
                            items: [{ cum: "19996998-1", quantity: 1, lineTotal: RECEIPT_TOTAL }],
                            total: RECEIPT_TOTAL,
                          },
                        });
                        setEvidence(`${result.evidence.verificationStatus}. Payment status stays ${result.paymentStatus}.`);
                      })
                    }
                  >
                    Submit matching receipt
                  </button>
                  <button
                    type="button"
                    data-testid="capabilities-evidence-invalid"
                    disabled={busy}
                    className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold"
                    onClick={() =>
                      run(async () => {
                        const result = await compasApi.submitCapabilityEvidence(ANDREA, {
                          purchaseId,
                          receipt: {
                            merchantId: "demo-merchant-drogueria-central",
                            items: [{ cum: "20000000-1", quantity: 1, lineTotal: RECEIPT_TOTAL }],
                            total: RECEIPT_TOTAL,
                          },
                        });
                        setMismatch(`${result.evidence.verificationStatus}. Payment status stays ${result.paymentStatus}.`);
                      })
                    }
                  >
                    Submit a different medicine
                  </button>
                  <button
                    type="button"
                    data-testid="capabilities-refund"
                    disabled={busy}
                    className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold"
                    onClick={() =>
                      run(async () => {
                        const refund = await compasApi.simulateCapabilityRefund(PEDRO, {
                          purchaseId,
                          idempotencyKey: REFUND_KEY,
                          amount: { value: "500", ...USD },
                        });
                        const next = await compasApi.capabilityStory(PEDRO);
                        setStory({ ...next, remaining: refund.remaining });
                      })
                    }
                  >
                    Simulate a USD 5 refund
                  </button>
                </div>
              ) : null}
              <p data-testid="capabilities-evidence-status" className="text-sm text-ink">
                {evidence ?? "No matching receipt yet."}
              </p>
              <p data-testid="capabilities-evidence-invalid-status" className="text-sm text-ink">
                {mismatch ?? "No mismatched receipt yet."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || planStatus !== "ACTIVE"}
                  className="rounded-md border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      if (!story) return;
                      const result = await compasApi.setCarePlanStatus(PEDRO, story.story.carePlanId, "pause");
                      setPlanStatus(result.plan.status);
                    })
                  }
                >
                  Pause plan
                </button>
                <button
                  type="button"
                  disabled={busy || planStatus !== "PAUSED"}
                  className="rounded-md border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      if (!story) return;
                      const result = await compasApi.setCarePlanStatus(PEDRO, story.story.carePlanId, "resume");
                      setPlanStatus(result.plan.status);
                    })
                  }
                >
                  Resume plan
                </button>
                <button
                  type="button"
                  data-testid="capabilities-revoke"
                  disabled={busy || planStatus === "REVOKED"}
                  className="rounded-md border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      if (!story) return;
                      const result = await compasApi.setCarePlanStatus(PEDRO, story.story.carePlanId, "revoke");
                      setPlanStatus(result.plan.status);
                    })
                  }
                >
                  Revoke plan
                </button>
              </div>
              <p className="text-sm text-ink-soft">Plan status: {planStatus}. A revoked plan does not resume and does not create another errand.</p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">No care story yet. Opening one creates Pedro’s medication mandate and a monthly plan. It does not create a PayPal order.</p>
          )}
          {error ? (
            <p role="alert" data-testid="capabilities-error" className="text-sm text-ink">
              {error}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
