import { type MandateServiceDeps, MandateService } from "../../src/application/mandates.ts";
import type { SpendingRecord } from "../../src/domain/spending.ts";
import { InMemoryAuditRepository } from "../../src/integrations/audit/in-memory-audit-repository.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { paypalAcceptsAsset } from "../../src/integrations/paypal/amounts.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import type { AuditRepository } from "../../src/ports/audit-repository.ts";
import type { MandateRepository } from "../../src/ports/mandate-repository.ts";
import type { PartyDirectory } from "../../src/ports/party-directory.ts";
import type { SpendingLog } from "../../src/ports/spending-log.ts";

export const NOW = new Date("2026-10-16T15:00:00Z");
export const PEDRO = { partyId: "demo-payer-pedro" };
export const ANDREA = { partyId: "demo-delegate-andrea" };
export const GLADYS = { partyId: "demo-beneficiary-gladys" };
export const STRANGER = { partyId: "someone-else" };
/** Pedro's PayPal sandbox account in the tests. Not a real account. */
export const PAYER_PAYPAL_ID = "TESTPAYERPEDR";

/** A settlement stand-in that only counts the reconciliations the service asks for. */
export function countingSettlement(options: { fail?: boolean } = {}) {
  const refreshed: string[] = [];
  return {
    refreshed,
    async refresh(mandateId: string) {
      refreshed.push(mandateId);
      if (options.fail) throw Object.assign(new Error("PayPal down"), { code: "UPSTREAM" });
    },
  };
}

export function serviceKit(options: {
  now?: () => Date;
  /** Postgres adapters for the database tests. In memory by default. */
  storage?: { mandates: MandateRepository; audit: AuditRepository; spending: SpendingLog };
  newId?: () => string;
  parties?: PartyDirectory;
  settlement?: MandateServiceDeps["settlement"];
} = {}) {
  const mandates: MandateRepository = options.storage?.mandates ?? new InMemoryMandateRepository();
  const audit: AuditRepository = options.storage?.audit ?? new InMemoryAuditRepository();
  const spending: SpendingLog = options.storage?.spending ?? new InMemorySpendingLog();
  let ids = 0;
  let clock = options.now ?? (() => NOW);
  const deps: MandateServiceDeps = {
    mandates,
    parties: options.parties ?? new StaticPartyDirectory([
      { id: PEDRO.partyId, displayName: "Pedro", paypalPayerId: PAYER_PAYPAL_ID },
      { id: ANDREA.partyId, displayName: "Andrea" },
      { id: GLADYS.partyId, displayName: "Gladys" },
    ]),
    audit,
    spending,
    acceptsAsset: paypalAcceptsAsset,
    ...(options.settlement ? { settlement: options.settlement } : {}),
    // Events in one test can share a millisecond; a moving clock keeps their order.
    now: () => new Date(clock().getTime() + ids),
    newId: () => (++ids, options.newId?.() ?? `test-${ids}`),
  };
  return {
    service: new MandateService(deps),
    mandates,
    audit,
    spending,
    setNow(next: Date) {
      clock = () => next;
    },
  };
}

/** The demo story's budget: USD 40 for MEDICATION, Andrea spends, Gladys benefits. */
export function medicationRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    delegateId: ANDREA.partyId,
    beneficiaryId: GLADYS.partyId,
    categories: ["MEDICATION"],
    budget: { value: "4000", assetCode: "USD", assetScale: 2 },
    validFrom: "2026-10-16T05:00:00.000Z",
    expiresAt: "2026-11-15T04:59:59.000Z",
    ...overrides,
  };
}

/** A captured pharmacy purchase. Its PayPal references are placeholders, not PayPal resources. */
export function spendingRecord(overrides: Partial<SpendingRecord>): SpendingRecord {
  return {
    id: "decision-1",
    mandateId: "mandate-test-1",
    purchaseIntentId: "intent-1",
    paypalMerchantId: "TESTPHARMACY2",
    merchantDisplayName: "Droguería Central",
    requestedAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
    decision: { outcome: "ALLOW", reasons: [] },
    purposeCheck: { outcome: "ALLOW", reasons: [], matchedCategories: ["MEDICATION"], enforced: true },
    merchantCategories: [{ category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED" }],
    lineCategories: ["MEDICATION"],
    hasUncategorizedLines: false,
    monitoredException: false,
    paypal: { orderId: "TESTORDER00000001", captureId: "TESTCAPTURE00000001", state: "COMPLETED" },
    recordedAt: "2026-10-16T16:00:00.000Z",
    ...overrides,
  };
}
