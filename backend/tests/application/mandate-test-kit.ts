import { type MandateServiceDeps, MandateService } from "../../src/application/mandates.ts";
import type { SpendingRecord } from "../../src/domain/spending.ts";
import { InMemoryAuditRepository } from "../../src/integrations/audit/in-memory-audit-repository.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { InMemoryGrantStore } from "../../src/integrations/open-payments/in-memory-grant-store.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import { NotImplementedError } from "../../src/lib/not-implemented.ts";
import type { AuditRepository } from "../../src/ports/audit-repository.ts";
import type { GrantStore } from "../../src/ports/grant-store.ts";
import type { MandateRepository } from "../../src/ports/mandate-repository.ts";
import type { PartyDirectory } from "../../src/ports/party-directory.ts";
import type { StartPayerGrantInput } from "../../src/ports/open-payments-gateway.ts";
import type { SpendingLog } from "../../src/ports/spending-log.ts";

export const NOW = new Date("2026-10-16T15:00:00Z");
export const PEDRO = { partyId: "demo-payer-pedro" };
export const ANDREA = { partyId: "demo-delegate-andrea" };
export const GLADYS = { partyId: "demo-beneficiary-gladys" };
export const STRANGER = { partyId: "someone-else" };
export const PAYER_WALLET = "https://wallet.test/pedro";

/**
 * A gateway double over a real grant store, in memory unless one is given. Like the real adapter, it
 * stores a PENDING grant on start and deletes it on a successful cancel.
 * `finishGrant` stands in for a verified finish callback. Test code only:
 * the tokens below are placeholders, never real ones.
 */
export function fakeGateway(options: {
  start?: "ok" | "not-configured" | "asset-mismatch" | "upstream";
  cancel?: "ok" | "upstream";
  wallet?: { assetCode: string; assetScale: number } | "not-configured";
  grants?: GrantStore;
} = {}) {
  const grants = options.grants ?? new InMemoryGrantStore();
  const calls = { start: [] as StartPayerGrantInput[], cancel: [] as string[], spent: [] as string[] };
  const state = { cancel: options.cancel ?? "ok" };
  const gatewayError = (code: string) => Object.assign(new Error(`gateway ${code}`), { code });
  return {
    calls,
    grants,
    failCancel(next: "ok" | "upstream") {
      state.cancel = next;
    },
    /** What a verified finish does at the provider: the stored grant becomes ACTIVE. */
    async finishGrant(grantKey: string) {
      const stored = await grants.get(grantKey);
      if (!stored) throw new Error(`no grant ${grantKey}`);
      await grants.put({
        state: "ACTIVE",
        grantKey,
        payerWalletAddressUrl: stored.payerWalletAddressUrl,
        resourceServer: stored.resourceServer,
        continueUri: stored.continueUri,
        continueAccessToken: "test-continue-token",
        accessToken: "test-access-token",
        manageUrl: "https://auth.test/manage",
      });
    },
    gateway: {
      async resolveWallet(walletAddressUrl: string) {
        if (options.wallet === "not-configured") throw new NotImplementedError("OpenPaymentsGateway.resolveWallet");
        const asset = options.wallet ?? { assetCode: "USD", assetScale: 2 };
        return { walletAddressUrl, authServer: "https://auth.test", resourceServer: "https://rs.test", ...asset };
      },
      async startPayerGrant(input: StartPayerGrantInput) {
        calls.start.push(input);
        if (options.start === "not-configured") throw new NotImplementedError("OpenPaymentsGateway.startPayerGrant");
        if (options.start === "asset-mismatch") throw gatewayError("ASSET_MISMATCH");
        if (options.start === "upstream") throw gatewayError("UPSTREAM");
        await grants.put({
          state: "PENDING",
          grantKey: input.grantKey,
          payerWalletAddressUrl: input.payerWalletAddressUrl,
          resourceServer: "https://rs.test",
          grantEndpoint: "https://auth.test",
          clientNonce: "test-client-nonce",
          finishNonce: "test-finish-nonce",
          continueUri: "https://auth.test/continue",
          continueAccessToken: "test-continue-token",
        });
        return { redirectUrl: `https://auth.test/interact/${input.grantKey}` };
      },
      async cancelPayerGrant(grantKey: string) {
        calls.cancel.push(grantKey);
        if (state.cancel === "upstream") throw gatewayError("UPSTREAM");
        await grants.delete(grantKey);
      },
      async readGrantSpentAmounts(grantKey: string) {
        calls.spent.push(grantKey);
        return { spentDebitAmount: { value: "1120", assetCode: "USD", assetScale: 2 } };
      },
    },
  };
}

export function serviceKit(options: {
  gateway?: ReturnType<typeof fakeGateway>;
  payerWallet?: string | null;
  now?: () => Date;
  payerGrants?: MandateServiceDeps["payerGrants"];
  /** Postgres adapters for the database tests. In memory by default. */
  storage?: { mandates: MandateRepository; audit: AuditRepository; spending: SpendingLog };
  newId?: () => string;
  parties?: PartyDirectory;
} = {}) {
  const gateway = options.gateway ?? fakeGateway();
  const mandates: MandateRepository = options.storage?.mandates ?? new InMemoryMandateRepository();
  const audit: AuditRepository = options.storage?.audit ?? new InMemoryAuditRepository();
  const spending: SpendingLog = options.storage?.spending ?? new InMemorySpendingLog();
  let ids = 0;
  let clock = options.now ?? (() => NOW);
  const deps: MandateServiceDeps = {
    mandates,
    parties: options.parties ?? new StaticPartyDirectory([
      {
        id: PEDRO.partyId,
        displayName: "Pedro",
        ...(options.payerWallet === null ? {} : { walletAddressUrl: options.payerWallet ?? PAYER_WALLET }),
      },
      { id: ANDREA.partyId, displayName: "Andrea" },
      { id: GLADYS.partyId, displayName: "Gladys" },
    ]),
    payments: gateway.gateway,
    grants: gateway.grants,
    audit,
    spending,
    ...(options.payerGrants ? { payerGrants: options.payerGrants } : {}),
    // Events in one test can share a millisecond; a moving clock keeps their order.
    now: () => new Date(clock().getTime() + ids),
    newId: () => (++ids, options.newId?.() ?? `test-${ids}`),
  };
  return {
    service: new MandateService(deps),
    gateway,
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

export function spendingRecord(overrides: Partial<SpendingRecord>): SpendingRecord {
  return {
    id: "decision-1",
    mandateId: "mandate-test-1",
    purchaseIntentId: "intent-1",
    merchantWalletAddressUrl: "https://wallet.test/drogueria-central",
    merchantDisplayName: "Droguería Central",
    requestedAmount: { value: "45000", assetCode: "COP", assetScale: 2 },
    debitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
    decision: { outcome: "ALLOW", reasons: [] },
    purposeCheck: { outcome: "ALLOW", reasons: [], matchedCategories: ["MEDICATION"], enforced: true },
    merchantCategories: [{ category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED" }],
    monitoredException: false,
    openPayments: {
      incomingPaymentUrl: "https://wallet.test/incoming/1",
      quoteId: "https://wallet.test/quotes/1",
      outgoingPaymentUrl: "https://wallet.test/outgoing/1",
      state: "COMPLETED",
    },
    recordedAt: "2026-10-16T16:00:00.000Z",
    ...overrides,
  };
}
