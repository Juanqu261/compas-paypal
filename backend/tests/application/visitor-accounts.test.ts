import assert from "node:assert/strict";
import test from "node:test";
import { handleDemoAccounts } from "../../src/api/demo-accounts.ts";
import { DelegatePurchaseService, type DelegatePurchaseDeps } from "../../src/application/delegate-purchases.ts";
import { PayPalOrderSettlement } from "../../src/application/settle-paypal-order.ts";
import {
  readPresenterAccounts,
  WorkspaceAccounts,
  WorkspaceMerchantDirectory,
  WorkspacePartyDirectory,
} from "../../src/integrations/demo-workspaces/demo-accounts.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { StaticMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit } from "./mandate-test-kit.ts";
import { fakePayPal, historyDeps, LIQUOR_PAYPAL_ID, PAYER_PAYPAL_ID, PHARMACY_PAYPAL_ID, stubRegistry } from "./purchase-test-kit.ts";

const PHARMACY = "demo-merchant-drogueria-central";
const LIQUOR = "demo-merchant-liquor";
/** demo/test data: a visitor's own sandbox accounts, from another developer account. */
const VISITOR_BUSINESS = "FYFGX237GSG2U";
const VISITOR_PERSONAL = "KUHH9HTUKXYMN";

function charge(mandateId: string, merchantId: string, category: string, key = "key-0123456789abcdef") {
  const amount = { value: "1120", assetCode: "USD", assetScale: 2 };
  return { mandateId, merchantId, amount, lineItems: [{ category, amount }], idempotencyKey: key };
}

/** One visitor's demo: its accounts, the account-aware directories, purchases and the settlement. */
async function visitorKit() {
  const kit = serviceKit();
  const created = await kit.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  const mandateId = created.mandate.id;
  assert.ok((await kit.service.authorize(PEDRO, mandateId)).ok);

  const accounts = new WorkspaceAccounts();
  const merchants = new WorkspaceMerchantDirectory(
    new StaticMerchantDirectory([
      { id: PHARMACY, displayName: "Droguería Central", paypalMerchantId: PHARMACY_PAYPAL_ID },
      { id: LIQUOR, displayName: "Licorera de ejemplo", paypalMerchantId: LIQUOR_PAYPAL_ID },
    ]),
    accounts,
  );
  // The presenter's payer, as DEMO_PAYER_PAYPAL_ID would set it.
  const parties = new WorkspacePartyDirectory(
    new StaticPartyDirectory([{ id: PEDRO.partyId, displayName: "Pedro", paypalPayerId: PAYER_PAYPAL_ID }]),
    accounts,
  );
  const paypal = fakePayPal();
  const deps = historyDeps();
  let ids = 0;
  const purchaseDeps: DelegatePurchaseDeps = {
    mandates: kit.service,
    merchants,
    registry: stubRegistry(),
    history: deps,
    payments: paypal.gateway,
    spending: kit.spending,
    capacity: kit.mandates,
    execution: () =>
      accounts.get()
        ? { allowed: true }
        : { allowed: false, code: "SANDBOX_ACCOUNTS_REQUIRED", reason: "Choose the accounts first." },
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  };
  const settlement = new PayPalOrderSettlement({
    payments: paypal.gateway,
    spending: kit.spending,
    mandates: kit.mandates,
    parties,
    history: deps,
    now: () => NOW,
  });
  return { kit, mandateId, accounts, paypal, settlement, service: new DelegatePurchaseService(purchaseDeps) };
}

test("without sandbox accounts, a demo checks a purchase but creates no PayPal order", async () => {
  const { mandateId, accounts, paypal, service } = await visitorKit();
  const preview = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(preview.ok);
  assert.equal(preview.preview.next, "ORDER");
  assert.equal(preview.preview.execution, "SANDBOX_ACCOUNTS_REQUIRED");
  const refused = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!refused.ok && refused.code, "SANDBOX_ACCOUNTS_REQUIRED");
  assert.equal(paypal.totalCalls(), 0);

  accounts.set({ source: "PRESENTER" });
  const allowed = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(allowed.ok);
  assert.equal(allowed.preview.execution, "ENABLED");
});

test("with a visitor's accounts, the order pays their business account, and the pharmacy's evidence still decides", async () => {
  const { kit, mandateId, accounts, paypal, settlement, service } = await visitorKit();
  accounts.set({ source: "VISITOR", payerPayPalId: VISITOR_PERSONAL, payeeMerchantId: VISITOR_BUSINESS });

  const purchase = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(purchase.ok);
  assert.equal(purchase.purchase.outcome, "ALLOW", "decided on Droguería Central's evidence");
  assert.equal(paypal.calls.create[0].payeeMerchantId, VISITOR_BUSINESS);
  const [record] = await kit.spending.listByMandate(mandateId);
  assert.equal(record.paypalMerchantId, PHARMACY_PAYPAL_ID, "the record names the merchant whose evidence was read");
  assert.equal(record.payeeMerchantId, VISITOR_BUSINESS);

  const [orderId] = [...paypal.orders.keys()];
  paypal.approve(orderId, VISITOR_PERSONAL);
  assert.equal((await settlement.approved(orderId)).result, "COMPLETED");
});

test("with a visitor's accounts, only their personal account's approval is captured", async () => {
  const { kit, mandateId, accounts, paypal, settlement, service } = await visitorKit();
  accounts.set({ source: "VISITOR", payerPayPalId: VISITOR_PERSONAL, payeeMerchantId: VISITOR_BUSINESS });
  assert.ok((await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"))).ok);
  const [orderId] = [...paypal.orders.keys()];
  // The presenter's Pedro approves instead of the visitor.
  paypal.approve(orderId, PAYER_PAYPAL_ID);
  const outcome = await settlement.approved(orderId);
  assert.equal(outcome.result, "FAILED");
  assert.equal(paypal.calls.capture.length, 0);
  const [record] = await kit.spending.listByMandate(mandateId);
  assert.equal(record.paypal.failureCode, "PAYER_ACCOUNT_MISMATCH");
});

test("an order that pays anyone but the recorded payee is never captured", async () => {
  const { kit, mandateId, accounts, paypal, settlement, service } = await visitorKit();
  accounts.set({ source: "VISITOR", payerPayPalId: VISITOR_PERSONAL, payeeMerchantId: VISITOR_BUSINESS });
  assert.ok((await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"))).ok);
  const [orderId] = [...paypal.orders.keys()];
  // The pharmacy's own account is the evidence key, not this purchase's payee.
  paypal.orders.get(orderId)!.payeeMerchantId = PHARMACY_PAYPAL_ID;
  paypal.approve(orderId, VISITOR_PERSONAL);
  assert.equal((await settlement.approved(orderId)).result, "FAILED");
  assert.equal(paypal.calls.capture.length, 0);
  const [record] = await kit.spending.listByMandate(mandateId);
  assert.equal(record.paypal.failureCode, "ORDER_MISMATCH");
});

test("with the presenter's accounts, nothing is overridden: the pharmacy's own account is paid and Pedro's is pinned", async () => {
  const { kit, mandateId, accounts, paypal, settlement, service } = await visitorKit();
  accounts.set({ source: "PRESENTER" });
  assert.ok((await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"))).ok);
  assert.equal(paypal.calls.create[0].payeeMerchantId, PHARMACY_PAYPAL_ID);
  const [record] = await kit.spending.listByMandate(mandateId);
  assert.equal(record.payeeMerchantId, undefined);
  const [orderId] = [...paypal.orders.keys()];
  paypal.approve(orderId, PAYER_PAYPAL_ID);
  assert.equal((await settlement.approved(orderId)).result, "COMPLETED");
});

test("a business account PayPal doesn't know is reported as such, and the budget is given back", async () => {
  const { kit, mandateId, accounts, paypal, service } = await visitorKit();
  accounts.set({ source: "VISITOR", payerPayPalId: VISITOR_PERSONAL, payeeMerchantId: "ZZZZZZZZZZZZZ" });
  paypal.failures.create = Object.assign(new Error("PayPal create order failed (422 PAYEE_ACCOUNT_INVALID)"), {
    code: "PAYEE_ACCOUNT_INVALID",
  });
  const result = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!result.ok && result.code, "PAYEE_ACCOUNT_INVALID");
  assert.equal((await kit.mandates.getById(mandateId))?.remainingAuthorizedAmount.value, "4000");
});

test("a visitor's account IDs are checked for form, and passwords are never part of it", () => {
  const presenter = readPresenterAccounts({});
  const accounts = new WorkspaceAccounts();
  const post = (body: unknown) => handleDemoAccounts({ method: "POST", body }, { accounts, presenter });

  const invalid = post({ source: "VISITOR", payerPayPalId: "pedro@example.com", payeeMerchantId: "short" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(
    (invalid.body.fieldErrors as { field: string }[]).map((error) => error.field),
    ["payerPayPalId", "payeeMerchantId"],
  );
  const same = post({ source: "VISITOR", payerPayPalId: VISITOR_PERSONAL, payeeMerchantId: VISITOR_PERSONAL });
  assert.equal(same.status, 400);
  assert.equal(accounts.get(), undefined);

  const ok = post({ source: "VISITOR", payerPayPalId: ` ${VISITOR_PERSONAL.toLowerCase()} `, payeeMerchantId: VISITOR_BUSINESS, password: "x" });
  assert.equal(ok.status, 200);
  assert.deepEqual(accounts.get(), { source: "VISITOR", payerPayPalId: VISITOR_PERSONAL, payeeMerchantId: VISITOR_BUSINESS });
  assert.equal(JSON.stringify(accounts.get()).includes("password"), false);
  assert.equal(ok.body.stored, "IN_THIS_DEMO_ONLY");
});

test("the presenter's accounts: open without a key, only with the right key otherwise, never without them", () => {
  const configured = { DEMO_MERCHANT_PAYPAL_ID: PHARMACY_PAYPAL_ID, DEMO_PAYER_PAYPAL_ID: PAYER_PAYPAL_ID };
  const use = (env: NodeJS.ProcessEnv, presenterKey?: string) => {
    const accounts = new WorkspaceAccounts();
    const result = handleDemoAccounts(
      { method: "POST", body: { source: "PRESENTER", ...(presenterKey ? { presenterKey } : {}) } },
      { accounts, presenter: readPresenterAccounts(env) },
    );
    return { status: result.status, error: result.body.error, accounts: accounts.get() };
  };

  assert.deepEqual(use(configured).accounts, { source: "PRESENTER" });
  assert.equal(use({}).error, "PRESENTER_UNAVAILABLE");

  const keyed = { ...configured, COMPAS_PRESENTER_KEY: "a-long-presenter-secret" };
  assert.equal(readPresenterAccounts(keyed).access, "KEY");
  assert.equal(use(keyed).error, "PRESENTER_KEY_REQUIRED");
  assert.equal(use(keyed, "wrong").status, 403);
  assert.deepEqual(use(keyed, "a-long-presenter-secret").accounts, { source: "PRESENTER" });

  const view = handleDemoAccounts({ method: "GET" }, { accounts: new WorkspaceAccounts(), presenter: readPresenterAccounts(keyed) });
  assert.equal(JSON.stringify(view.body).includes("a-long-presenter-secret"), false, "the key is never sent back");
  assert.equal(view.body.presenter, "KEY");
});
