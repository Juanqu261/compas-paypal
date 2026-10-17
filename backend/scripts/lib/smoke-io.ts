/**
 * Terminal and consent helpers shared by the smoke scripts.
 * They only print, prompt and listen. They make no Open Payments call.
 */
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { formatMoneyAmount, type MoneyAmount } from "../../src/domain/money.ts";
import type {
  IncomingPaymentRef,
  OutgoingPaymentRef,
} from "../../src/ports/open-payments-gateway.ts";

export const CONSENT_TIMEOUT_MS = 5 * 60_000;
export const POLL_INTERVAL_MS = 2_000;
export const POLL_ATTEMPTS = 30;

export function step(title: string): void {
  console.log(`\n== ${title}`);
}

export function money(amount: MoneyAmount | undefined): string {
  return amount ? formatMoneyAmount(amount) : "(none)";
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. See backend/.env.example.`);
  }
  return value;
}

/** Listens once on the finish URI and resolves with the redirect's query. */
export function listenForFinishRedirect(
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

export async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

export function isFinal(outgoing: OutgoingPaymentRef, incoming: IncomingPaymentRef): boolean {
  return outgoing.state !== "PENDING" || incoming.completed;
}
