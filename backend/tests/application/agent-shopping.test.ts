import assert from "node:assert/strict";
import test from "node:test";
import type { ToolResult } from "../../src/application/agent-shopping.ts";
import { ANDREA } from "./mandate-test-kit.ts";
import {
  agentKit,
  GIFT_CARD,
  IBUPROFEN,
  LOOKALIKE,
  LOSARTAN,
  LOSARTAN_CUM,
  PHARMACY,
  usd,
} from "./agent-test-kit.ts";

const losartan = (quantity = 1) => ({ errandId: "errand-losartan", merchantId: PHARMACY, items: [{ skuId: LOSARTAN.skuId, quantity }] });

test("search offers only vetted shops, and only SKUs the errand accepts", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const result = await kit.shopping.searchEligibleMerchants(principal, { errandId: "errand-losartan" });
  assert.equal(result.isError, false);
  const merchants = result.data.merchants as { merchantId: string; displayName: string; confidence: string; offers: Record<string, unknown>[] }[];
  // The lookalike sells the same medicine, but nothing independent says so: it is not offered, or named.
  assert.deepEqual(merchants.map((merchant) => merchant.merchantId), [PHARMACY]);
  assert.equal(merchants[0].confidence, "HIGH");
  // Not the ibuprofen, not the gift card: neither is on the errand.
  assert.deepEqual(merchants[0].offers.map((offer) => offer.skuId), [LOSARTAN.skuId]);
  assert.equal(merchants[0].offers[0].forErrandItem, "Losartán 50 mg");
  assert.deepEqual(merchants[0].offers[0].unitPrice, { ...usd("1120"), display: "11.20 USD" });
  assert.ok(!JSON.stringify(result.data).includes(LOOKALIKE));
});

test("a merchant's catalog text never reaches the agent", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize(["errand-losartan", "errand-other"]);
  const outputs = [
    await kit.shopping.searchEligibleMerchants(principal, { errandId: "errand-losartan" }),
    await kit.shopping.checkPurchase(principal, { ...losartan(), items: [{ skuId: GIFT_CARD.skuId }] }),
    await kit.shopping.proposePurchase(principal, { ...losartan(), items: [{ skuId: GIFT_CARD.skuId }] }),
    await kit.shopping.getMandateStatus(principal, { errandId: "errand-losartan" }),
  ];
  for (const output of outputs) assert.ok(!JSON.stringify(output).includes("IGNORE PREVIOUS"));
});

test("a clean cart orders once, at the catalog's price, and a retry does not order again", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const first = await kit.shopping.proposePurchase(principal, losartan());
  assert.equal(first.isError, false);
  assert.equal(first.data.outcome, "ALLOW");
  assert.deepEqual(first.data.payment, { status: "ORDER_CREATED", state: "AWAITING_PAYER_APPROVAL" });
  assert.match(String(first.data.nextStep), /payer/);
  assert.equal(kit.paypal.calls.create.length, 1);
  assert.equal(kit.paypal.calls.create[0].amount.value, "1120");
  // The PayPal order names no product, SKU or CUM.
  assert.ok(!JSON.stringify(kit.paypal.calls.create[0]).includes(LOSARTAN_CUM));
  assert.ok(!JSON.stringify(kit.paypal.calls.create[0]).includes(LOSARTAN.skuId));

  const again = await kit.shopping.proposePurchase(principal, losartan());
  assert.equal(again.data.decisionId, first.data.decisionId);
  assert.equal(again.data.replayed, true);
  assert.equal(kit.paypal.calls.create.length, 1);
});

test("the agent cannot set an amount or a category", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const result = await kit.shopping.proposePurchase(principal, {
    ...losartan(),
    amount: usd("1"),
    items: [{ skuId: LOSARTAN.skuId, quantity: 1, amount: usd("1"), category: "MEDICATION", price: usd("1") }],
  });
  assert.equal(result.data.outcome, "ALLOW");
  assert.equal(kit.paypal.calls.create[0].amount.value, "1120");
});

test("an injected second box is held before PayPal, and so is an in-purpose extra", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();

  const twoBoxes = await kit.shopping.proposePurchase(principal, losartan(2));
  assert.equal(twoBoxes.data.outcome, "REVIEW");
  assert.deepEqual(twoBoxes.data.reasonCodes, ["ERRAND_MISMATCH"]);
  assert.equal((twoBoxes.data.payment as { status: string }).status, "NOT_CREATED");

  // Ibuprofen is a real medicine with a verified CUM, so the purpose check passes. The errand does not.
  const extra = await kit.shopping.proposePurchase(principal, {
    ...losartan(),
    items: [{ skuId: LOSARTAN.skuId }, { skuId: IBUPROFEN.skuId }],
  });
  assert.equal(extra.data.outcome, "REVIEW");
  assert.deepEqual(extra.data.reasonCodes, ["ERRAND_MISMATCH"]);
  assert.equal(kit.paypal.calls.create.length, 0);
  assert.match(String(extra.data.nextStep), /Do not retry/);
});

test("a gift card is held: no verified CUM, no order", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const result = await kit.shopping.proposePurchase(principal, {
    ...losartan(),
    items: [{ skuId: LOSARTAN.skuId }, { skuId: GIFT_CARD.skuId }],
  });
  assert.equal(result.data.outcome, "REVIEW");
  assert.ok((result.data.reasonCodes as string[]).includes("ERRAND_MISMATCH"));
  assert.equal(kit.paypal.calls.create.length, 0);
});

test("a lookalike pharmacy is never paid, even when the agent names it", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const result = await kit.shopping.proposePurchase(principal, {
    errandId: "errand-losartan",
    merchantId: LOOKALIKE,
    items: [{ skuId: "fo-losartan-50" }],
  });
  assert.equal(result.isError, false);
  assert.equal(result.data.outcome, "REVIEW");
  assert.deepEqual(result.data.reasonCodes, ["MERCHANT_EVIDENCE_INSUFFICIENT"]);
  assert.equal(kit.paypal.calls.create.length, 0);

  const unknown = await kit.shopping.proposePurchase(principal, { ...losartan(), merchantId: "some-other-shop" });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.data.error, "UNKNOWN_MERCHANT");
  assert.equal(kit.paypal.calls.create.length, 0);
});

test("an errand outside the grant, someone else's, or unknown gets one identical refusal", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize(["errand-losartan"]);
  const answers: ToolResult[] = [];
  for (const errandId of ["errand-other", "errand-foreign", "errand-nope"]) {
    for (const call of [
      kit.shopping.searchEligibleMerchants(principal, { errandId }),
      kit.shopping.checkPurchase(principal, { ...losartan(), errandId }),
      kit.shopping.proposePurchase(principal, { ...losartan(), errandId }),
      kit.shopping.getMandateStatus(principal, { errandId }),
    ]) {
      answers.push(await call);
    }
  }
  assert.ok(answers.every((answer) => answer.isError && answer.data.outcome === "DENY" && answer.data.recorded === false));
  assert.ok(answers.every((answer) => JSON.stringify(answer) === JSON.stringify(answers[0])));
  assert.equal(kit.paypal.calls.create.length, 0);

  // A malformed id is refused for its shape. Search and status, which take only the id, say the same as above.
  for (const errandId of ["not-an-id", 7, undefined]) {
    const search = await kit.shopping.searchEligibleMerchants(principal, { errandId });
    assert.equal(JSON.stringify(search), JSON.stringify(answers[0]));
  }
});

test("another delegate's agent cannot use this errand, and a grant does not cover errands added later", async () => {
  const kit = await agentKit();
  const other = await kit.authorize(["errand-other"]);
  const refused = await kit.shopping.proposePurchase(other.principal, losartan());
  assert.equal(refused.data.outcome, "DENY");
  assert.deepEqual(refused.data.reasonCodes, ["DELEGATE_NOT_AUTHORIZED"]);
  assert.equal(kit.paypal.calls.create.length, 0);

  // Same delegate, same mandate, but the grant names errand-other only.
  const ok = await kit.authorize(["errand-losartan"]);
  assert.equal((await kit.shopping.proposePurchase(ok.principal, losartan())).data.outcome, "ALLOW");
});

test("a cancelled or expired errand holds the cart instead of ordering", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  await kit.errands.cancel("errand-losartan");
  const result = await kit.shopping.proposePurchase(principal, losartan());
  assert.equal(result.data.outcome, "REVIEW");
  assert.deepEqual(result.data.reasonCodes, ["ERRAND_MISMATCH"]);
  assert.equal(kit.paypal.calls.create.length, 0);
});

test("check_purchase is a dry run: it orders nothing and says what would happen", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const fits = await kit.shopping.checkPurchase(principal, losartan());
  assert.equal(fits.data.wouldHappen, "ALLOW");
  const twice = await kit.shopping.checkPurchase(principal, losartan(2));
  assert.equal(twice.data.wouldHappen, "REVIEW");
  assert.deepEqual(twice.data.reasonCodes, ["ERRAND_MISMATCH"]);
  assert.equal(kit.paypal.totalCalls(), 0);
  const spent = await kit.mandates.service.get(ANDREA, kit.mandateId);
  assert.ok(spent.ok && spent.mandate.remainingAuthorizedAmount.value === "4000");
});

test("get_mandate_status shows what an allowed purchase holds", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  const before = await kit.shopping.getMandateStatus(principal, { errandId: "errand-losartan" });
  assert.deepEqual((before.data.errand as { items: unknown[] }).items, [{ label: "Losartán 50 mg", unitsAllowed: 1, unitsHeld: 0 }]);
  await kit.shopping.proposePurchase(principal, losartan());
  const after = await kit.shopping.getMandateStatus(principal, { errandId: "errand-losartan" });
  const errand = after.data.errand as { items: unknown[]; amountHeld: { value: string }; status: string };
  assert.deepEqual(errand.items, [{ label: "Losartán 50 mg", unitsAllowed: 1, unitsHeld: 1 }]);
  assert.equal(errand.amountHeld.value, "1120");
  assert.equal(errand.status, "ACTIVE");
  assert.equal((after.data.budget as { remaining: { value: string } }).remaining.value, "2880");
});

test("bad arguments are tool errors, not decisions", async () => {
  const kit = await agentKit();
  const { principal } = await kit.authorize();
  for (const input of [
    undefined,
    {},
    { ...losartan(), items: [] },
    { ...losartan(), items: [{ skuId: "has space" }] },
    { ...losartan(), items: [{ skuId: LOSARTAN.skuId, quantity: 0 }] },
    { ...losartan(), items: [{ skuId: LOSARTAN.skuId }, { skuId: LOSARTAN.skuId }] },
    { ...losartan(), merchantId: "Not A Merchant" },
    { ...losartan(), errandId: "not-an-id" },
    { ...losartan(), idempotencyKey: "short" },
  ]) {
    const result = await kit.shopping.proposePurchase(principal, input);
    assert.equal(result.isError, true);
    assert.equal(result.data.error, "INVALID_INPUT");
  }
  const unknownSku = await kit.shopping.proposePurchase(principal, { ...losartan(), items: [{ skuId: "dc-nope" }] });
  assert.equal(unknownSku.data.error, "UNKNOWN_SKU");
  assert.equal(kit.paypal.calls.create.length, 0);
});

test("a revoked agent is stopped at authentication, before any tool runs", async () => {
  const kit = await agentKit();
  const { principal, token } = await kit.authorize();
  assert.equal((await kit.shopping.proposePurchase(principal, losartan())).data.outcome, "ALLOW");
  await kit.auth.revokeGrant(ANDREA, principal.grant.id);
  assert.equal(await kit.auth.authenticate(`Bearer ${token.access_token}`), undefined);
});
