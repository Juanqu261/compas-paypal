/**
 * Open Payments smoke test on the Interledger test network.
 *
 *   npm run op:smoke -- [--budget 4000] [--amount 1000] [--interval R/...] [--keep-grant] [--yes]
 *
 * It drives the real gateway end to end: payer consent, incoming payment on
 * the merchant wallet, quote, outgoing payment, completion.
 *
 * This tests the Open Payments leg only. It runs no COMPAS policy, so it is
 * not a COMPAS payment. The operator authorizes it twice: by consenting at the
 * payer's wallet and by confirming at the prompt before the outgoing payment.
 * The application path always goes through createOutgoingPaymentIfAllowed.
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { formatMoneyAmount, type MoneyAmount } from "../src/domain/money.ts";
import { createOpenPaymentsGateway } from "../src/integrations/open-payments/create-open-payments-gateway.ts";
import { OpenPaymentsGatewayError } from "../src/integrations/open-payments/errors.ts";
import type {
  IncomingPaymentRef,
  OutgoingPaymentRef,
} from "../src/ports/open-payments-gateway";

const { values: args } = parseArgs({
  options: {
    budget: { type: "string", default: "4000" },
    amount: { type: "string", default: "1000" },
    interval: { type: "string" },
    "keep-grant": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

const CONSENT_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 30;

function step(title: string): void {
  console.log(`\n== ${title}`);
}

function money(amount: MoneyAmount | undefined): string {
  return amount ? formatMoneyAmount(amount) : "(none)";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. See backend/.env.example.`);
  }
  return value;
}

/** Listens once on the finish URI and resolves with the redirect's query. */
function listenForFinishRedirect(
  port: number,
  path: string,
): { params: Promise<URLSearchParams>; close: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const server = createServer();
  const close = () => {
    clearTimeout(timer);
    server.close();
  };

  const params = new Promise<URLSearchParams>((resolve, reject) => {
    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== path) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("COMPAS smoke test: consent result received. Return to the terminal.");
      close();
      resolve(url.searchParams);
    });
    server.on("error", reject);
    timer = setTimeout(() => {
      close();
      reject(new Error("Timed out waiting for the payer's consent redirect."));
    }, CONSENT_TIMEOUT_MS);
    server.listen(port);
  });

  return { params, close };
}

async function confirm(question: string): Promise<boolean> {
  if (args.yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

function isFinal(outgoing: OutgoingPaymentRef, incoming: IncomingPaymentRef): boolean {
  return outgoing.state !== "PENDING" || incoming.completed;
}

async function main(): Promise<void> {
  const payerWallet = requireEnv("DEMO_PAYER_WALLET_ADDRESS");
  const merchantWallet = requireEnv("DEMO_MERCHANT_WALLET_ADDRESS");
  const smokePort = Number(process.env.OP_SMOKE_PORT?.trim() || 4123);
  const finishPath = "/smoke-finish";

  const setup = await createOpenPaymentsGateway({
    finishUri: `http://localhost:${smokePort}${finishPath}`,
  });
  if (!setup.configured) {
    throw new Error(
      `Open Payments client is not configured. Missing: ${setup.missing.join(", ")}`,
    );
  }
  const gateway = setup.gateway;
  const grantKey = `smoke-${randomUUID()}`;

  step("1. Resolve wallet addresses");
  const payer = await gateway.resolveWallet(payerWallet);
  const merchant = await gateway.resolveWallet(merchantWallet);
  console.log(`payer    ${payer.walletAddressUrl} (${payer.assetCode}, scale ${payer.assetScale})`);
  console.log(`merchant ${merchant.walletAddressUrl} (${merchant.assetCode}, scale ${merchant.assetScale})`);

  const budget: MoneyAmount = {
    value: args.budget,
    assetCode: payer.assetCode,
    assetScale: payer.assetScale,
  };
  const purchase: MoneyAmount = {
    value: args.amount,
    assetCode: merchant.assetCode,
    assetScale: merchant.assetScale,
  };

  step("2. Ask the payer for an outgoing-payment grant (no receiver)");
  console.log(`debit limit ${money(budget)}${args.interval ? `, interval ${args.interval}` : ""}`);
  const listener = listenForFinishRedirect(smokePort, finishPath);
  let redirectUrl: string;
  try {
    ({ redirectUrl } = await gateway.startPayerGrant({
      grantKey,
      payerWalletAddressUrl: payer.walletAddressUrl,
      debitLimit: budget,
      ...(args.interval ? { interval: args.interval } : {}),
    }));
  } catch (error) {
    listener.close();
    throw error;
  }
  console.log(`Open this URL, log in as the payer and accept:\n\n  ${redirectUrl}\n`);
  console.log(`Waiting for the redirect to http://localhost:${smokePort}${finishPath} ...`);

  const finish = await listener.params;
  if (finish.get("result") === "grant_rejected") {
    throw new Error("The payer rejected the grant.");
  }
  const interactRef = finish.get("interact_ref");
  const hash = finish.get("hash");
  if (!interactRef || !hash) {
    throw new Error(`Unexpected finish redirect: ${finish.toString()}`);
  }

  step("3. Finish the grant (hash check + grant.continue)");
  await gateway.finishPayerGrant({ grantKey, interactRef, hash });
  console.log("grant ACTIVE");

  try {
    step("4. Create an incoming payment on the merchant wallet");
    const incoming = await gateway.createIncomingPayment({
      merchantWalletAddressUrl: merchant.walletAddressUrl,
      incomingAmount: purchase,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      metadata: { externalReference: `smoke-${Date.now()}` },
    });
    console.log(`incoming payment ${incoming.url}`);
    console.log(`incoming amount  ${money(incoming.incomingAmount)}`);

    step("5. Quote the payer wallet into the incoming payment");
    const quote = await gateway.createQuote({
      payerWalletAddressUrl: payer.walletAddressUrl,
      incomingPaymentUrl: incoming.url,
    });
    console.log(`quote          ${quote.id}`);
    console.log(`debit amount   ${money(quote.debitAmount)}  (leaves the payer, fees included)`);
    console.log(`receive amount ${money(quote.receiveAmount)}  (reaches the merchant)`);
    console.log(`expires at     ${quote.expiresAt ?? "(not set)"}`);

    if (!(await confirm("Create the outgoing payment?"))) {
      console.log("Stopped before the outgoing payment. No money moved.");
      return;
    }

    step("6. Create the outgoing payment from the quote");
    let outgoing = await gateway.createOutgoingPayment({
      grantKey,
      quoteId: quote.id,
      metadata: {
        compasMandateId: grantKey,
        compasDecisionId: `smoke-decision-${randomUUID()}`,
      },
    });
    console.log(`outgoing payment ${outgoing.url}`);

    step("7. Wait for completion");
    let receiver = await gateway.readIncomingPayment(incoming.url);
    for (let attempt = 0; attempt < POLL_ATTEMPTS && !isFinal(outgoing, receiver); attempt++) {
      await sleep(POLL_INTERVAL_MS);
      outgoing = await gateway.readOutgoingPayment({
        grantKey,
        outgoingPaymentUrl: outgoing.url,
      });
      receiver = await gateway.readIncomingPayment(incoming.url);
    }
    console.log(`sender view   state=${outgoing.state} sent=${money(outgoing.sentAmount)} debit=${money(outgoing.debitAmount)}`);
    console.log(`receiver view completed=${receiver.completed} received=${money(receiver.receivedAmount)} of ${money(receiver.incomingAmount)}`);

    step("8. Grant spent amounts");
    try {
      const spent = await gateway.readGrantSpentAmounts(grantKey);
      console.log(`spent debit ${money(spent.spentDebitAmount)}, spent receive ${money(spent.spentReceiveAmount)}`);
    } catch (error) {
      console.log(`not available on this server: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (outgoing.state === "FAILED") {
      throw new Error("The outgoing payment failed.");
    }
    if (outgoing.state !== "COMPLETED" && !receiver.completed) {
      throw new Error("The payment did not complete within the polling window.");
    }
    console.log("\nSmoke test passed: request, authorization, execution, completion.");
  } finally {
    if (!args["keep-grant"]) {
      step("Cleanup: cancel the payer grant");
      await gateway.cancelPayerGrant(grantKey);
      console.log("grant cancelled");
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof OpenPaymentsGatewayError) {
    console.error(`\n[${error.code}] ${error.message}`);
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
