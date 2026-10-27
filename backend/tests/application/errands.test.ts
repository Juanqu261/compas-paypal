import assert from "node:assert/strict";
import test from "node:test";
import { ErrandService } from "../../src/application/errands.ts";
import type { Actor } from "../../src/application/mandates.ts";
import { purchaseUnderMandate } from "../../src/application/purchase-under-mandate.ts";
import { PayPalOrderSettlement } from "../../src/application/settle-paypal-order.ts";
import type { Errand } from "../../src/domain/errand.ts";
import type { Mandate } from "../../src/domain/mandate.ts";
import { JsonCumRegistry } from "../../src/integrations/cum/json-cum-registry.ts";
import { InMemoryErrandRepository } from "../../src/integrations/errands/in-memory-errand-repository.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { DEMO_CUM_FILE } from "../../src/integrations/merchant-registry/data-paths.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import type { ErrandLine } from "../../src/policy/errand-check.ts";
import { fakeModel, fakeSearch } from "./analyst-test-kit.ts";
import { fakePayPal, historyDeps, intent, mandate, NOW, PHARMACY_PAYPAL_ID, stubRegistry } from "./purchase-test-kit.ts";

const LOSARTAN_50 = "20062603-28";
const LOSARTAN_50_OTHER = "19996998-1";
const ACETAMINOFEN = "52478-2";
const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });

function errand(overrides: Partial<Errand> = {}): Errand {
  return {
    id: "errand-losartan",
    mandateId: "demo-mandate-medication",
    delegateId: "demo-delegate-andrea",
    kind: "ONE_OFF",
    status: "ACTIVE",
    items: [{ label: "Losartán 50 mg", acceptedCums: [LOSARTAN_50, LOSARTAN_50_OTHER], maxUnits: 1 }],
    maxAmount: usd("2000"),
    expiresAt: "2026-11-15T00:00:00Z",
    draftedBy: "DELEGATE",
    confirmedAt: "2026-10-16T14:00:00Z",
    createdAt: "2026-10-16T14:00:00Z",
    ...overrides,
  };
}

async function setup(mandateOverrides: Parameters<typeof mandate> = []) {
  const paypal = fakePayPal();
  const spending = new InMemorySpendingLog();
  const mandates = new InMemoryMandateRepository();
  const errands = new InMemoryErrandRepository();
  const theMandate = mandate(...mandateOverrides);
  await mandates.save(theMandate);
  await errands.create(errand());
  let ids = 0;
  const deps = {
    merchants: stubRegistry(),
    payments: paypal.gateway,
    spending,
    history: historyDeps(),
    capacity: mandates,
    errands,
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  };
  const buy = async (lines: readonly ErrandLine[], options: { amount?: string; errand?: Errand; mandate?: Mandate } = {}) =>
    purchaseUnderMandate(
      {
        mandate: options.mandate ?? theMandate,
        intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION", { amount: usd(options.amount ?? "1120") }),
        errand: { errand: options.errand ?? (await errands.get("errand-losartan"))!, lines },
      },
      deps,
    );
  return { paypal, spending, mandates, errands, deps, buy, theMandate };
}

const codes = (result: Awaited<ReturnType<typeof purchaseUnderMandate>>) => result.decision.reasons.map((reason) => reason.code);

test("the confirmed box is allowed, ordered, and its unit is held", async () => {
  const { buy, errands, paypal } = await setup();
  const result = await buy([{ cum: LOSARTAN_50, quantity: 1 }]);
  assert.equal(result.decision.outcome, "ALLOW");
  assert.equal(paypal.calls.create.length, 1);
  assert.deepEqual((await errands.usage("errand-losartan", new Date(0)))?.units, [1]);
});

test("an injected second box is held: REVIEW ERRAND_MISMATCH, and no PayPal order", async () => {
  const { buy, paypal } = await setup();
  const result = await buy([{ cum: LOSARTAN_50, quantity: 2 }]);
  assert.equal(result.decision.outcome, "REVIEW");
  assert.deepEqual(codes(result), ["ERRAND_MISMATCH"]);
  assert.equal(paypal.calls.create.length, 0);
});

test("an in-purpose extra (another drug) is held, even though the purpose check passes", async () => {
  const { buy } = await setup();
  const result = await buy([{ cum: LOSARTAN_50, quantity: 1 }, { cum: ACETAMINOFEN, quantity: 1 }]);
  assert.equal(result.decision.outcome, "REVIEW");
  assert.equal(result.decision.purposeCheck?.outcome, "ALLOW");
  assert.deepEqual(codes(result), ["ERRAND_MISMATCH"]);
});

test("a line without a verified CUM, or an amount over the errand, is held", async () => {
  const { buy } = await setup();
  assert.deepEqual(codes(await buy([{ quantity: 1 }])), ["ERRAND_MISMATCH"]);
  assert.deepEqual(codes(await buy([{ cum: LOSARTAN_50, quantity: 1 }], { amount: "2500" })), ["ERRAND_MISMATCH"]);
});

test("MONITORED relaxes the purpose checks, never the errand", async () => {
  const { buy } = await setup(["MONITORED"]);
  const result = await buy([{ cum: LOSARTAN_50, quantity: 3 }]);
  assert.equal(result.decision.outcome, "REVIEW");
  assert.ok(!codes(result).includes("PAYER_MONITORED_EXCEPTION"));
});

test("someone else's errand is a hard DENY: DELEGATE_NOT_AUTHORIZED", async () => {
  const { buy, paypal } = await setup();
  const result = await buy([{ cum: LOSARTAN_50, quantity: 1 }], { errand: errand({ delegateId: "demo-contact-camila" }) });
  assert.equal(result.decision.outcome, "DENY");
  assert.deepEqual(codes(result), ["DELEGATE_NOT_AUTHORIZED"]);
  assert.equal(paypal.calls.create.length, 0);
});

test("a cancelled or expired errand holds", async () => {
  const { buy } = await setup();
  assert.deepEqual(codes(await buy([{ cum: LOSARTAN_50, quantity: 1 }], { errand: errand({ status: "CANCELLED" }) })), ["ERRAND_MISMATCH"]);
  assert.deepEqual(codes(await buy([{ cum: LOSARTAN_50, quantity: 1 }], { errand: errand({ expiresAt: NOW.toISOString() }) })), ["ERRAND_MISMATCH"]);
});

test("the errand's units are used once: a second purchase for the same box is held", async () => {
  const { buy } = await setup();
  assert.equal((await buy([{ cum: LOSARTAN_50, quantity: 1 }])).decision.outcome, "ALLOW");
  const second = await buy([{ cum: LOSARTAN_50_OTHER, quantity: 1 }]);
  assert.equal(second.decision.outcome, "REVIEW");
});

test("concurrent purchases never reserve more than the errand allows, and the loser gets its capacity back", async () => {
  const { buy, mandates } = await setup();
  const results = await Promise.all([buy([{ cum: LOSARTAN_50, quantity: 1 }]), buy([{ cum: LOSARTAN_50, quantity: 1 }])]);
  assert.deepEqual(results.map((result) => result.decision.outcome).sort(), ["ALLOW", "REVIEW"]);
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "2880");
});

test("an order PayPal refuses to create gives the errand's units back", async () => {
  const { buy, paypal, errands } = await setup();
  paypal.failures.create = new Error("PayPal is down");
  await assert.rejects(buy([{ cum: LOSARTAN_50, quantity: 1 }]));
  assert.deepEqual((await errands.usage("errand-losartan", new Date(0)))?.units, [0]);
});

test("an order the payer cancels at PayPal gives the errand's units back", async () => {
  const { buy, paypal, errands, spending, mandates, deps } = await setup();
  const { order } = await buy([{ cum: LOSARTAN_50, quantity: 1 }]);
  const settlement = new PayPalOrderSettlement({
    payments: paypal.gateway,
    spending,
    mandates,
    parties: new StaticPartyDirectory([{ id: "demo-payer-pedro", displayName: "Pedro" }]),
    history: deps.history,
    errands,
    now: () => NOW,
  });
  await settlement.cancelled(order!.id);
  assert.deepEqual((await errands.usage("errand-losartan", new Date(0)))?.units, [0]);
  assert.equal((await buy([{ cum: LOSARTAN_50, quantity: 1 }])).decision.outcome, "ALLOW");
});

// ---------------------------------------------------------------------------
// The errand service
// ---------------------------------------------------------------------------

const MANDATE_ID = "mandate-test";
const ANDREA: Actor = { partyId: "demo-delegate-andrea" };
const PEDRO: Actor = { partyId: "demo-payer-pedro" };

function service(model = fakeModel(() => ({ items: [{ searchText: "losartán 50 mg tabletas", quantity: 1 }] }))) {
  const cums = JsonCumRegistry.fromFile(DEMO_CUM_FILE);
  const errands = new InMemoryErrandRepository();
  const theMandate = mandate("ENFORCED", { id: MANDATE_ID });
  const svc = new ErrandService({
    mandates: {
      async forParticipant(actor, id) {
        if (id !== theMandate.id) return { ok: false, code: "NOT_FOUND", message: "No such budget." };
        if (actor.partyId === theMandate.payer.id) return { ok: true, mandate: theMandate, role: "PAYER" };
        if (actor.partyId === theMandate.delegate.id) return { ok: true, mandate: theMandate, role: "DELEGATE" };
        return { ok: false, code: "NOT_FOUND", message: "No such budget." };
      },
    },
    errands,
    registry: cums,
    model,
    search: fakeSearch(cums),
    now: () => NOW,
    newId: () => "test",
  });
  return { svc, errands, model };
}

const confirmed = (overrides: Record<string, unknown> = {}) => ({
  mandateId: MANDATE_ID,
  kind: "ONE_OFF",
  items: [{ label: "Losartán 50 mg", acceptedCums: [LOSARTAN_50], maxUnits: 1 }],
  maxAmount: usd("2000"),
  expiresAt: "2026-11-15T00:00:00Z",
  confirmed: true,
  ...overrides,
});

test("only the delegate's confirmed request makes an errand", async () => {
  const { svc } = service();
  const unconfirmed = await svc.create(ANDREA, confirmed({ confirmed: undefined }));
  assert.equal(!unconfirmed.ok && unconfirmed.code, "INVALID_ERRAND");
  const byPayer = await svc.create(PEDRO, confirmed());
  assert.equal(!byPayer.ok && byPayer.code, "NOT_THE_DELEGATE");
  const made = await svc.create(ANDREA, confirmed());
  assert.equal(made.ok && made.errand.displayStatus, "ACTIVE");
  assert.equal(made.ok && made.errand.id, "errand-test");
});

test("an errand accepts only active CUMs, within the budget and the mandate's window", async () => {
  const { svc } = service();
  const inactive = await svc.create(ANDREA, confirmed({ items: [{ label: "Hyzaar", acceptedCums: ["217467-12"], maxUnits: 1 }] }));
  assert.ok(!inactive.ok && inactive.fieldErrors?.some((error) => error.code === "CUM_NOT_ACTIVE"));
  const over = await svc.create(ANDREA, confirmed({ maxAmount: usd("5000") }));
  assert.ok(!over.ok && over.fieldErrors?.some((error) => error.code === "OVER_BUDGET"));
  const late = await svc.create(ANDREA, confirmed({ expiresAt: "2027-06-01T00:00:00Z" }));
  assert.ok(!late.ok && late.fieldErrors?.some((error) => error.code === "AFTER_MANDATE"));
});

test("a draft needs consent, proposes CUM candidates, and is never an errand", async () => {
  const { svc, errands, model } = service();
  const noConsent = await svc.draft(ANDREA, { mandateId: MANDATE_ID, utterance: "la losartán de mi abuela" });
  assert.equal(!noConsent.ok && noConsent.code, "CONSENT_REQUIRED");
  assert.equal(model.calls.length, 0, "nothing was sent to the model without consent");

  const result = await svc.draft(ANDREA, { mandateId: MANDATE_ID, utterance: "Pide la losartán de mi abuela, la de siempre", consent: true });
  assert.ok(result.ok);
  assert.equal(result.draft.draftedBy, "MODEL");
  assert.ok(result.draft.items[0].candidates.some((candidate) => candidate.cum === LOSARTAN_50));
  assert.match(model.calls[0].user, /<delegate_request>/);
  assert.equal((await errands.listByMandate(MANDATE_ID)).length, 0);
});

test("the payer can read the errands, and only the delegate cancels", async () => {
  const { svc } = service();
  const made = await svc.create(ANDREA, confirmed());
  assert.ok(made.ok);
  const listed = await svc.list(PEDRO, MANDATE_ID);
  assert.equal(listed.ok && listed.errands.length, 1);
  const byPayer = await svc.cancel(PEDRO, made.errand.id);
  assert.equal(!byPayer.ok && byPayer.code, "NOT_THE_DELEGATE");
  const cancelled = await svc.cancel(ANDREA, made.errand.id);
  assert.equal(cancelled.ok && cancelled.errand.displayStatus, "CANCELLED");
});
