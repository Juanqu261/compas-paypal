/**
 * COMPAS smoke test on the Interledger test network: the category layer and
 * the purchase policy on top of real Open Payments.
 *
 *   npm run compas:smoke -- [--mode enforced|monitored] [--scenario all|pharmacy|liquor]
 *                           [--budget 4000] [--amount 1000] [--keep-grant] [--yes]
 *
 * One payer consent, one mandate in the chosen mode, then each purchase goes
 * through purchaseUnderMandate, the same use case the backend uses. The
 * registry and the gateway are wrapped only to print what each layer does.
 *
 * Expected:
 *   pharmacy, any mode    ALLOW, real payment completes
 *   liquor, enforced      DENY, stops before any Open Payments call
 *   liquor, monitored     ALLOW + PAYER_MONITORED_EXCEPTION, real payment completes
 *
 * DEMO_MERCHANT_WALLET_ADDRESS plays both shops. Each role gets its own
 * category service: the pharmacy one seeds the wallet as CIIU 4773 and the
 * liquor one seeds it as CIIU 4724. One trust log holding both would be
 * contradictory verified evidence, which is REVIEW for every purchase.
 *
 * Merchant evidence comes from the simulated Nequi Negocios seed (demo/test data).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { purchaseUnderMandate } from "../src/application/purchase-under-mandate.ts";
import { buildSpendingReport } from "../src/application/spending-report.ts";
import type { Mandate, PurposeEnforcement } from "../src/domain/mandate.ts";
import type { MoneyAmount } from "../src/domain/money.ts";
import type { PurchaseIntent } from "../src/domain/purchase.ts";
import { createMerchantCategoryService } from "../src/integrations/merchant-registry/create-merchant-category-service.ts";
import { createOpenPaymentsGateway } from "../src/integrations/open-payments/create-open-payments-gateway.ts";
import { OpenPaymentsGatewayError } from "../src/integrations/open-payments/errors.ts";
import { InMemorySpendingLog } from "../src/integrations/spending/in-memory-spending-log.ts";
import type { MerchantRegistry } from "../src/ports/merchant-registry.ts";
import type { OpenPaymentsGateway } from "../src/ports/open-payments-gateway.ts";
import {
  confirm,
  isFinal,
  listenForFinishRedirect,
  money,
  POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
  requireEnv,
  step,
} from "./lib/smoke-io.ts";

const { values: args } = parseArgs({
  options: {
    mode: { type: "string", default: "enforced" },
    scenario: { type: "string", default: "all" },
    budget: { type: "string", default: "4000" },
    amount: { type: "string", default: "1000" },
    "keep-grant": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

const FINISH_PATH = "/smoke-finish";

type Scenario = {
  name: "pharmacy" | "liquor";
  merchantWalletAddressUrl: string;
  merchantDisplayName: string;
  lineDescription: string;
  lineCategory: string;
  asset: { assetCode: string; assetScale: number };
  /** The category layer this shop is seeded in. */
  registry: MerchantRegistry;
  expect: { outcome: "ALLOW" | "DENY"; paid: boolean; monitoredException: boolean };
};

class OperatorStopped extends Error {}

function assetOf(wallet: { assetCode: string; assetScale: number }): Scenario["asset"] {
  return { assetCode: wallet.assetCode, assetScale: wallet.assetScale };
}

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
    async resolve(walletAddressUrl) {
      const resolution = await registry.resolve(walletAddressUrl);
      console.log(`  [category layer] ${resolution.walletAddressUrl}`);
      if (resolution.categories.length === 0) console.log("    no categories resolved");
      for (const resolved of resolution.categories) {
        console.log(`    ${resolved.category.padEnd(14)} ${resolved.trustLevel.padEnd(18)} from ${resolved.sourceIds.join(", ")}`);
      }
      if (resolution.conflicts.length > 0) console.log(`    conflicts: ${resolution.conflicts.length}`);
      return resolution;
    },
  };
}

/** Prints each Open Payments call the purchase flow makes, and asks before money moves. */
function loggingPayments(gateway: OpenPaymentsGateway): Pick<
  OpenPaymentsGateway,
  "createIncomingPayment" | "createQuote" | "createOutgoingPayment"
> {
  return {
    async createIncomingPayment(input) {
      const incoming = await gateway.createIncomingPayment(input);
      console.log(`  [open payments] incoming payment ${incoming.url}`);
      console.log(`                  amount ${money(incoming.incomingAmount)} (no money moves)`);
      return incoming;
    },
    async createQuote(input) {
      const quote = await gateway.createQuote(input);
      console.log(`  [open payments] quote ${quote.id}`);
      console.log(`                  debit ${money(quote.debitAmount)}, merchant receives ${money(quote.receiveAmount)}`);
      return quote;
    },
    async createOutgoingPayment(input) {
      console.log(`  [compas] policy returned ALLOW (decision ${input.metadata.compasDecisionId})`);
      if (!(await confirm("  Create the outgoing payment?", args.yes))) {
        throw new OperatorStopped("Stopped before the outgoing payment. No money moved.");
      }
      const outgoing = await gateway.createOutgoingPayment(input);
      console.log(`  [open payments] outgoing payment ${outgoing.url}`);
      return outgoing;
    },
  };
}

async function main(): Promise<void> {
  const enforcement = parseMode(args.mode);
  if (!["all", "pharmacy", "liquor"].includes(args.scenario)) {
    throw new Error(`--scenario must be all, pharmacy or liquor, not ${args.scenario}`);
  }
  const payerWallet = requireEnv("DEMO_PAYER_WALLET_ADDRESS");
  const pharmacyWallet = requireEnv("DEMO_MERCHANT_WALLET_ADDRESS");
  const smokePort = Number(process.env.OP_SMOKE_PORT?.trim() || 4123);

  const setup = await createOpenPaymentsGateway({ finishUri: `http://localhost:${smokePort}${FINISH_PATH}` });
  if (!setup.configured) {
    throw new Error(`Open Payments client is not configured. Missing: ${setup.missing.join(", ")}`);
  }
  const gateway = setup.gateway;

  step("1. Start the COMPAS category layer");
  // The same test wallet plays the pharmacy and the liquor store, each in its own trust log.
  const pharmacyCategories = await createMerchantCategoryService({
    env: { ...process.env, DEMO_MERCHANT_WALLET_ADDRESS: pharmacyWallet, DEMO_LIQUOR_WALLET_ADDRESS: undefined },
    logWarning: () => {},
  });
  const liquorCategories = await createMerchantCategoryService({
    env: { ...process.env, DEMO_MERCHANT_WALLET_ADDRESS: undefined, DEMO_LIQUOR_WALLET_ADDRESS: pharmacyWallet },
    logWarning: () => {},
  });
  console.log("pharmacy role: the merchant wallet is seeded as CIIU 4773 (pharmacy)");
  console.log("liquor role:   the same wallet, in a separate trust log, is seeded as CIIU 4724 (liquor store)");
  console.log(
    `${pharmacyCategories.demoSubmissions + liquorCategories.demoSubmissions} simulated Nequi Negocios submissions (demo/test data), each through ingestCategoryClaim with an Ed25519 signature check`,
  );

  step("2. Resolve wallet addresses (Open Payments)");
  const payer = await gateway.resolveWallet(payerWallet);
  const pharmacy = await gateway.resolveWallet(pharmacyWallet);
  console.log(`payer    ${payer.walletAddressUrl} (${payer.assetCode}, scale ${payer.assetScale})`);
  console.log(`merchant ${pharmacy.walletAddressUrl} (${pharmacy.assetCode}, scale ${pharmacy.assetScale}), plays both shops`);

  const scenarios: Scenario[] = [];
  if (args.scenario !== "liquor") {
    scenarios.push({
      name: "pharmacy",
      merchantWalletAddressUrl: pharmacy.walletAddressUrl,
      merchantDisplayName: "Droguería Central",
      lineDescription: "Acetaminophen",
      lineCategory: "MEDICATION",
      asset: assetOf(pharmacy),
      registry: pharmacyCategories.registry,
      expect: { outcome: "ALLOW", paid: true, monitoredException: false },
    });
  }
  if (args.scenario !== "pharmacy") {
    scenarios.push({
      name: "liquor",
      merchantWalletAddressUrl: pharmacy.walletAddressUrl,
      merchantDisplayName: "Example liquor store",
      lineDescription: "Alcohol",
      lineCategory: "ALCOHOL",
      asset: assetOf(pharmacy),
      registry: liquorCategories.registry,
      expect: enforcement === "ENFORCED"
        ? { outcome: "DENY", paid: false, monitoredException: false }
        : { outcome: "ALLOW", paid: true, monitoredException: true },
    });
  }
  if (scenarios.length === 0) throw new Error("Nothing to run.");

  step("3. Build the mandate (from the medication fixture)");
  const fixture = readMedicationFixture().mandate;
  const now = Date.now();
  const budget: MoneyAmount = { value: args.budget, assetCode: payer.assetCode, assetScale: payer.assetScale };
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
  console.log(`purpose     ${mandate.purposePolicy.eligibleCategories.join(", ")}, accepted evidence ${mandate.purposePolicy.acceptedTrustLevels.join(" | ")}`);
  console.log(`enforcement ${enforcement}${enforcement === "MONITORED" ? '  (the payer ticked "allow even if not fully approved")' : ""}`);
  console.log(`budget      ${money(budget)}`);

  step("4. Payer consent: outgoing-payment grant on the payer wallet (no receiver)");
  const listener = listenForFinishRedirect(smokePort, FINISH_PATH);
  let redirectUrl: string;
  try {
    ({ redirectUrl } = await gateway.startPayerGrant({
      grantKey: mandate.id,
      payerWalletAddressUrl: payer.walletAddressUrl,
      debitLimit: budget,
    }));
  } catch (error) {
    listener.close();
    throw error;
  }
  console.log(`Open this URL, log in as the payer and accept:\n\n  ${redirectUrl}\n`);
  console.log(`Waiting for the redirect to http://localhost:${smokePort}${FINISH_PATH} ...`);
  const finish = await listener.params;
  if (finish.get("result") === "grant_rejected") throw new Error("The payer rejected the grant.");
  const interactRef = finish.get("interact_ref");
  const hash = finish.get("hash");
  if (!interactRef || !hash) throw new Error(`Unexpected finish redirect: ${finish.toString()}`);
  await gateway.finishPayerGrant({ grantKey: mandate.id, interactRef, hash });
  console.log("grant ACTIVE. Open Payments now caps every debit at the budget.");

  const spending = new InMemorySpendingLog();
  const failures: string[] = [];

  try {
    for (const [index, scenario] of scenarios.entries()) {
      step(`${5 + index}. Purchase at the ${scenario.name}: Andrea buys ${scenario.lineDescription}`);
      const amount: MoneyAmount = { value: args.amount, ...scenario.asset };
      const intent: PurchaseIntent = {
        id: `smoke-intent-${scenario.name}-${randomUUID()}`,
        mandateId: mandate.id,
        delegateId: mandate.delegate.id,
        merchantWalletAddressUrl: scenario.merchantWalletAddressUrl,
        merchantDisplayName: scenario.merchantDisplayName,
        lineItems: [{ id: "line-1", description: scenario.lineDescription, category: scenario.lineCategory, amount }],
        amount,
        createdAt: new Date().toISOString(),
      };
      console.log(`  [compas] mandate rules: status, validity window, delegate`);

      let result;
      try {
        result = await purchaseUnderMandate(
          { mandate, intent, payerWalletAddressUrl: payer.walletAddressUrl },
          {
            merchants: loggingRegistry(scenario.registry),
            payments: loggingPayments(gateway),
            spending,
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

      const { decision, record } = result;
      const check = decision.purposeCheck;
      if (check) {
        console.log(`  [compas] purpose check: ${check.outcome}${check.enforced ? "" : " (not enforced: MONITORED)"}`);
        console.log(`           matched categories: ${check.matchedCategories.join(", ") || "none"}`);
      }
      console.log(`  [compas] decision ${decision.outcome}`);
      for (const reason of decision.reasons) console.log(`           ${reason.code}: ${reason.message}`);
      if (!result.payment) {
        console.log(`  [compas] createOutgoingPayment was not called. Open Payments calls made: ${record.openPayments.incomingPaymentUrl ? "incoming payment + quote" : "none"}`);
      }

      let completed = false;
      if (result.payment && record.openPayments.incomingPaymentUrl) {
        let outgoing = result.payment;
        let receiver = await gateway.readIncomingPayment(record.openPayments.incomingPaymentUrl);
        for (let attempt = 0; attempt < POLL_ATTEMPTS && !isFinal(outgoing, receiver); attempt++) {
          await sleep(POLL_INTERVAL_MS);
          outgoing = await gateway.readOutgoingPayment({ grantKey: mandate.id, outgoingPaymentUrl: outgoing.url });
          receiver = await gateway.readIncomingPayment(record.openPayments.incomingPaymentUrl);
        }
        completed = outgoing.state === "COMPLETED" || receiver.completed;
        await spending.recordPayment(record.id, { outgoingPaymentUrl: outgoing.url, state: outgoing.state });
        console.log(`  [open payments] sender state=${outgoing.state} sent=${money(outgoing.sentAmount)}; receiver completed=${receiver.completed} received=${money(receiver.receivedAmount)}`);

        // No mandate repository yet: the smoke test tracks remaining capacity itself.
        if (record.debitAmount) {
          const remaining = BigInt(mandate.remainingAuthorizedAmount.value) - BigInt(record.debitAmount.value);
          mandate = { ...mandate, remainingAuthorizedAmount: { ...mandate.remainingAuthorizedAmount, value: remaining.toString() } };
          console.log(`  [compas] remaining authorized amount ${money(mandate.remainingAuthorizedAmount)}`);
        }
      }

      const ok =
        decision.outcome === scenario.expect.outcome &&
        Boolean(result.payment) === scenario.expect.paid &&
        (!scenario.expect.paid || completed) &&
        record.monitoredException === scenario.expect.monitoredException;
      console.log(`  ${ok ? "PASS" : "FAIL"}: expected ${scenario.expect.outcome}${scenario.expect.paid ? ", paid" : ", not paid"}${scenario.expect.monitoredException ? ", monitored exception" : ""}`);
      if (!ok) failures.push(scenario.name);
    }

    step(`${5 + scenarios.length}. The payer's spending report`);
    const report = await buildSpendingReport(mandate, spending);
    const { totals } = report;
    console.log(`enforcement ${report.enforcement}, budget ${money(report.budget)}`);
    console.log(`paid ${money(totals.paid)} in ${totals.paidCount} of ${totals.attempts} attempts; not paid ${totals.notPaidCount}`);
    console.log(`paid outside the purpose ${totals.paidOutsidePurpose}, monitored exceptions ${totals.monitoredExceptions}`);
    for (const entry of [...report.entries].reverse()) {
      const shop = entry.merchantDisplayName ?? entry.merchantWalletAddressUrl;
      const cats = entry.merchantCategories.map((c) => `${c.category}/${c.trustLevel}`).join(", ") || "none";
      const matched = entry.purposeCheck?.matchedCategories.join(", ") || "no";
      console.log(`- ${shop}: ${entry.decision.outcome}${entry.monitoredException ? " (monitored exception)" : ""}`);
      console.log(`    categories ${cats}; matched purpose: ${matched}; debit ${money(entry.debitAmount)}; payment ${entry.openPayments.outgoingPaymentUrl ?? "none"}`);
    }

    if (failures.length > 0) throw new Error(`Smoke test failed: ${failures.join(", ")}`);
    console.log("\nCOMPAS smoke test passed: category layer, purchase policy and Open Payments, end to end.");
  } finally {
    if (!args["keep-grant"]) {
      step("Cleanup: cancel the payer grant");
      await gateway.cancelPayerGrant(mandate.id);
      console.log("grant cancelled");
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof OpenPaymentsGatewayError) {
    console.error(`\n[${error.code}] ${error.message}`);
    if (error.code === "QUOTE_EXPIRED") console.error("The quote expired while waiting at the prompt. Run again and confirm sooner, or pass --yes.");
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
