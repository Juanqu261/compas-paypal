/**
 * COMPAS smoke test on the PayPal sandbox: the category layer and the
 * purchase policy on top of real PayPal orders.
 *
 *   npm run compas:smoke -- [--mode enforced|monitored] [--scenario all|pharmacy|liquor]
 *                           [--budget 4000] [--amount 1120] [--yes]
 *
 * One mandate in the chosen mode, then each purchase goes through
 * purchaseUnderMandate, the same use case the backend uses. An ALLOW creates
 * a PayPal order that you approve as the payer, and the settlement captures
 * it, as the backend's return route does. The registry and the gateway are
 * wrapped only to print what each layer does.
 *
 * Expected:
 *   pharmacy, any mode    ALLOW, PayPal order approved and captured
 *   liquor, enforced      DENY, stops before any PayPal call
 *   liquor, monitored     ALLOW + PAYER_MONITORED_EXCEPTION, approved and captured
 *
 * DEMO_MERCHANT_PAYPAL_ID plays both shops. Each role gets its own category
 * service: the pharmacy one seeds the account as CIIU 4773 and the liquor one
 * seeds it as CIIU 4724. One trust log holding both would be contradictory
 * verified evidence, which is REVIEW for every purchase.
 *
 * Merchant evidence comes from the simulated Nequi Negocios seed (demo/test data).
 *
 * With DATABASE_URL, the mandate, the spending log and the observation log
 * are written to Postgres, and the mandate's remaining capacity is reserved
 * there. The two category trust logs stay in memory: one account playing two
 * shops in one shared log would contradict itself.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { purchaseUnderMandate } from "../src/application/purchase-under-mandate.ts";
import { PayPalOrderSettlement } from "../src/application/settle-paypal-order.ts";
import { buildSpendingReport } from "../src/application/spending-report.ts";
import type { Mandate, PurposeEnforcement } from "../src/domain/mandate.ts";
import { normalizePayPalAccountId } from "../src/domain/merchant-identifiers.ts";
import type { MoneyAmount } from "../src/domain/money.ts";
import type { PurchaseIntent } from "../src/domain/purchase.ts";
import { createDemoPartyDirectory } from "../src/integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../src/integrations/mandates/in-memory-mandate-repository.ts";
import { createMerchantHistoryService } from "../src/integrations/merchant-history/create-merchant-history-service.ts";
import { createMerchantCategoryService } from "../src/integrations/merchant-registry/create-merchant-category-service.ts";
import { createPayPalGateway } from "../src/integrations/paypal/create-paypal-gateway.ts";
import { PayPalGatewayError } from "../src/integrations/paypal/errors.ts";
import { connectDatabase } from "../src/integrations/postgres/database.ts";
import { PostgresMandateRepository } from "../src/integrations/postgres/postgres-mandate-repository.ts";
import { PostgresSpendingLog } from "../src/integrations/postgres/postgres-spending-log.ts";
import { InMemorySpendingLog } from "../src/integrations/spending/in-memory-spending-log.ts";
import type { MerchantRegistry } from "../src/ports/merchant-registry.ts";
import type { PayPalGateway } from "../src/ports/paypal-gateway.ts";
import {
  confirm,
  listenForPayPalReturn,
  money,
  requireEnv,
  SMOKE_CANCEL_PATH,
  SMOKE_RETURN_PATH,
  smokePort,
  step,
} from "./lib/smoke-io.ts";

const { values: args } = parseArgs({
  options: {
    mode: { type: "string", default: "enforced" },
    scenario: { type: "string", default: "all" },
    budget: { type: "string", default: "4000" },
    amount: { type: "string", default: "1120" },
    yes: { type: "boolean", default: false },
  },
});

type Scenario = {
  name: "pharmacy" | "liquor";
  merchantDisplayName: string;
  lineDescription: string;
  lineCategory: string;
  /** The category layer this shop is seeded in. */
  registry: MerchantRegistry;
  expect: { outcome: "ALLOW" | "DENY"; paid: boolean; monitoredException: boolean };
};

class OperatorStopped extends Error {}

function parseMode(raw: string): PurposeEnforcement {
  if (raw === "enforced") return "ENFORCED";
  if (raw === "monitored") return "MONITORED";
  throw new Error(`--mode must be enforced or monitored, not ${raw}`);
}

function readMedicationFixture(): { mandate: Mandate } {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../data/fixtures/demo/medication-pharmacy.json");
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Prints what the category layer returns for each merchant the policy asks about. */
function loggingRegistry(registry: MerchantRegistry): MerchantRegistry {
  return {
    async resolve(paypalMerchantId) {
      const resolution = await registry.resolve(paypalMerchantId);
      console.log(`  [category layer] PayPal merchant ${resolution.paypalMerchantId}`);
      if (resolution.categories.length === 0) console.log("    no categories resolved");
      for (const resolved of resolution.categories) {
        console.log(`    ${resolved.category.padEnd(14)} ${resolved.trustLevel.padEnd(18)} from ${resolved.sourceIds.join(", ")}`);
      }
      if (resolution.conflicts.length > 0) console.log(`    conflicts: ${resolution.conflicts.length}`);
      return resolution;
    },
  };
}

/** Prints the PayPal order the purchase flow creates, and asks before it does. */
function loggingPayments(gateway: PayPalGateway): Pick<PayPalGateway, "createOrder"> {
  return {
    async createOrder(input) {
      console.log(`  [compas] policy returned ALLOW (decision ${input.metadata.compasDecisionId})`);
      if (!(await confirm("  Create the PayPal order for the payer to approve?", args.yes))) {
        throw new OperatorStopped("Stopped before the PayPal order. No money moved.");
      }
      const order = await gateway.createOrder(input);
      console.log(`  [paypal] order ${order.id} (${order.status}) payable to ${order.payeeMerchantId}, ${money(order.amount)}`);
      return order;
    },
  };
}

const database = connectDatabase();

async function main(): Promise<void> {
  const enforcement = parseMode(args.mode);
  if (!["all", "pharmacy", "liquor"].includes(args.scenario)) {
    throw new Error(`--scenario must be all, pharmacy or liquor, not ${args.scenario}`);
  }
  const merchantId = normalizePayPalAccountId(requireEnv("DEMO_MERCHANT_PAYPAL_ID"));
  if (!merchantId) throw new Error("DEMO_MERCHANT_PAYPAL_ID is not a PayPal merchant id.");
  const port = smokePort();

  console.log(database ? "storage: Postgres (DATABASE_URL)" : "storage: in memory");
  const setup = createPayPalGateway({
    returnUrl: `http://localhost:${port}${SMOKE_RETURN_PATH}`,
    cancelUrl: `http://localhost:${port}${SMOKE_CANCEL_PATH}`,
  });
  if (!setup.configured) throw new Error(`PayPal is not configured. Missing: ${setup.missing.join(", ")}`);
  const gateway = setup.gateway;

  step("1. Start the COMPAS category layer");
  // The same sandbox account plays the pharmacy and the liquor store, each in its own trust log.
  const pharmacyCategories = await createMerchantCategoryService({
    env: { ...process.env, DEMO_MERCHANT_PAYPAL_ID: merchantId, DEMO_LIQUOR_PAYPAL_ID: undefined },
    logWarning: () => {},
  });
  const liquorCategories = await createMerchantCategoryService({
    env: { ...process.env, DEMO_MERCHANT_PAYPAL_ID: undefined, DEMO_LIQUOR_PAYPAL_ID: merchantId },
    logWarning: () => {},
  });
  console.log(`pharmacy role: PayPal merchant ${merchantId} is seeded as CIIU 4773 (pharmacy)`);
  console.log("liquor role:   the same account, in a separate trust log, is seeded as CIIU 4724 (liquor store)");
  console.log(
    `${pharmacyCategories.demoSubmissions + liquorCategories.demoSubmissions} simulated Nequi Negocios submissions (demo/test data), each through ingestCategoryClaim with an Ed25519 signature check`,
  );

  const scenarios: Scenario[] = [];
  if (args.scenario !== "liquor") {
    scenarios.push({
      name: "pharmacy",
      merchantDisplayName: "Droguería Central",
      lineDescription: "Acetaminophen",
      lineCategory: "MEDICATION",
      registry: pharmacyCategories.registry,
      expect: { outcome: "ALLOW", paid: true, monitoredException: false },
    });
  }
  if (args.scenario !== "pharmacy") {
    scenarios.push({
      name: "liquor",
      merchantDisplayName: "Example liquor store",
      lineDescription: "Alcohol",
      lineCategory: "ALCOHOL",
      registry: liquorCategories.registry,
      expect: enforcement === "ENFORCED"
        ? { outcome: "DENY", paid: false, monitoredException: false }
        : { outcome: "ALLOW", paid: true, monitoredException: true },
    });
  }
  if (scenarios.length === 0) throw new Error("Nothing to run.");

  step("2. Build the mandate (from the medication fixture)");
  const fixture = readMedicationFixture().mandate;
  const now = Date.now();
  const budget: MoneyAmount = { ...fixture.budget, value: args.budget };
  let mandate: Mandate = {
    ...fixture,
    id: `smoke-mandate-${randomUUID()}`,
    budget,
    remainingAuthorizedAmount: budget,
    purposePolicy: { ...fixture.purposePolicy, enforcement },
    status: "ACTIVE",
    validFrom: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  console.log(`mandate     ${mandate.id}`);
  console.log(`delegate    ${mandate.delegate.displayName}, payer ${mandate.payer.displayName}`);
  console.log(`purpose     ${mandate.purposePolicy.eligibleCategories.join(", ")}, minimum merchant confidence ${mandate.purposePolicy.merchantConfidence.minimum}`);
  console.log(`enforcement ${enforcement}${enforcement === "MONITORED" ? '  (the payer ticked "allow even if not fully approved")' : ""}`);
  console.log(`budget      ${money(budget)}. ACTIVE: the payer approves each order at PayPal, so no PayPal step comes first.`);
  const mandates = database ? new PostgresMandateRepository(database) : new InMemoryMandateRepository();
  await mandates.save(mandate);

  const spending = database ? new PostgresSpendingLog(database) : new InMemorySpendingLog();
  const history = await createMerchantHistoryService(database ? { database } : {});
  const parties = createDemoPartyDirectory();
  const settlement = new PayPalOrderSettlement({
    payments: gateway,
    spending,
    mandates,
    parties,
    history,
    logWarning: (message) => console.log(`  [compas] ${message}`),
  });
  if (!(await parties.getById(mandate.payer.id))?.paypalPayerId) {
    console.log("DEMO_PAYER_PAYPAL_ID is not set: any sandbox account that approves an order pays it.");
  }

  const listener = listenForPayPalReturn(port);
  const failures: string[] = [];
  try {
    for (const [index, scenario] of scenarios.entries()) {
      step(`${3 + index}. Purchase at the ${scenario.name}: Andrea buys ${scenario.lineDescription}`);
      const amount: MoneyAmount = { ...budget, value: args.amount };
      const intent: PurchaseIntent = {
        id: `smoke-intent-${scenario.name}-${randomUUID()}`,
        mandateId: mandate.id,
        delegateId: mandate.delegate.id,
        paypalMerchantId: merchantId,
        merchantDisplayName: scenario.merchantDisplayName,
        lineItems: [{ id: "line-1", description: scenario.lineDescription, category: scenario.lineCategory, amount }],
        amount,
        createdAt: new Date().toISOString(),
      };
      console.log(`  [compas] mandate rules: status, validity window, delegate`);

      let result;
      try {
        result = await purchaseUnderMandate(
          { mandate, intent },
          {
            merchants: loggingRegistry(scenario.registry),
            payments: loggingPayments(gateway),
            spending,
            history,
            capacity: mandates,
          },
        );
      } catch (error) {
        if (error instanceof OperatorStopped) {
          console.log(`  ${error.message}`);
          failures.push(`${scenario.name}: stopped by the operator`);
          continue;
        }
        throw error;
      }

      const { decision, order } = result;
      const check = decision.purposeCheck;
      if (check) {
        console.log(`  [compas] purpose check: ${check.outcome}${check.enforced ? "" : " (not enforced: MONITORED)"}`);
        console.log(`           matched categories: ${check.matchedCategories.join(", ") || "none"}`);
        const confidence = check.merchantConfidence;
        if (confidence) {
          console.log(`           trust matrix ${confidence.matrixVersion}: ${confidence.category} ${confidence.corroboration} x ${confidence.historyGrade} = ${confidence.confidence}`);
        }
      }
      console.log(`  [compas] decision ${decision.outcome}`);
      for (const reason of decision.reasons) console.log(`           ${reason.code}: ${reason.message}`);

      let paid = false;
      if (!order) {
        console.log("  [compas] createOrder was not called. No PayPal call was made for this purchase.");
      } else {
        console.log(`  Open this URL, log in as the sandbox payer and approve:\n\n    ${order.approvalUrl}\n`);
        console.log(`  Waiting for PayPal to send you to http://localhost:${port}${SMOKE_RETURN_PATH} ...`);
        const back = await listener.next();
        if (back.orderId !== order.id) throw new Error(`PayPal returned for another order: ${back.orderId}`);
        const outcome = back.approved ? await settlement.approved(order.id) : await settlement.cancelled(order.id);
        console.log(`  [compas] settlement: ${outcome.result}${back.approved ? " (mandate checked again, then captured)" : ""}`);
        paid = outcome.result === "COMPLETED" || outcome.result === "PENDING";
        mandate = (await mandates.getById(mandate.id)) ?? mandate;
        console.log(`  [compas] remaining authorized amount ${money(mandate.remainingAuthorizedAmount)}`);
      }

      const record = (await spending.listByMandate(mandate.id)).find((entry) => entry.id === decision.id);
      const ok =
        decision.outcome === scenario.expect.outcome &&
        paid === scenario.expect.paid &&
        record?.monitoredException === scenario.expect.monitoredException;
      console.log(`  ${ok ? "PASS" : "FAIL"}: expected ${scenario.expect.outcome}${scenario.expect.paid ? ", paid" : ", not paid"}${scenario.expect.monitoredException ? ", monitored exception" : ""}`);
      if (!ok) failures.push(scenario.name);
    }

    step(`${3 + scenarios.length}. The payer's spending report`);
    const report = await buildSpendingReport(mandate, spending);
    const { totals } = report;
    console.log(`enforcement ${report.enforcement}, budget ${money(report.budget)}`);
    console.log(`paid ${money(totals.paid)} in ${totals.paidCount} of ${totals.attempts} attempts; not paid ${totals.notPaidCount}`);
    console.log(`paid outside the purpose ${totals.paidOutsidePurpose}, monitored exceptions ${totals.monitoredExceptions}`);
    for (const entry of [...report.entries].reverse()) {
      const shop = entry.merchantDisplayName ?? entry.paypalMerchantId;
      const cats = entry.merchantCategories.map((c) => `${c.category}/${c.trustLevel}`).join(", ") || "none";
      const matched = entry.purposeCheck?.matchedCategories.join(", ") || "no";
      console.log(`- ${shop}: ${entry.decision.outcome}${entry.monitoredException ? " (monitored exception)" : ""}`);
      console.log(`    categories ${cats}; matched purpose: ${matched}; charge ${money(entry.requestedAmount)}; PayPal ${entry.paypal.orderId ? `order ${entry.paypal.orderId} ${entry.paypal.state}` : "none"}`);
    }

    if (failures.length > 0) throw new Error(`Smoke test failed: ${failures.join(", ")}`);
    console.log("\nCOMPAS smoke test passed: category layer, purchase policy and PayPal, end to end.");
  } finally {
    listener.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof PayPalGatewayError) {
    console.error(`\n[${error.code}] ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ""}`);
    if (error.code === "PAYEE_ACCOUNT_INVALID") console.error("DEMO_MERCHANT_PAYPAL_ID must be a sandbox business account's merchant id.");
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
}).finally(() => database?.end({ timeout: 5 }));
