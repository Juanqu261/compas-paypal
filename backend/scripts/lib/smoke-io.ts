/**
 * Terminal and redirect helpers shared by the smoke scripts.
 * They only print, prompt and listen. They make no PayPal call.
 */
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { formatMoneyAmount, type MoneyAmount } from "../../src/domain/money.ts";

export const APPROVAL_TIMEOUT_MS = 10 * 60_000;
export const SMOKE_RETURN_PATH = "/smoke-return";
export const SMOKE_CANCEL_PATH = "/smoke-cancel";

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

export function smokePort(): number {
  return Number(process.env.PAYPAL_SMOKE_PORT?.trim() || 4123);
}

export type PayerReturn = { approved: boolean; orderId: string | null };

/**
 * Listens on the smoke return and cancel URLs and resolves with the first
 * redirect PayPal sends the payer's browser to, for any order.
 */
export function listenForPayPalReturn(port: number): { next: () => Promise<PayerReturn>; close: () => void } {
  const waiting: ((value: PayerReturn) => void)[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    if (url.pathname !== SMOKE_RETURN_PATH && url.pathname !== SMOKE_CANCEL_PATH) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("COMPAS smoke test: PayPal sent you back. Return to the terminal.");
    waiting.shift()?.({ approved: url.pathname === SMOKE_RETURN_PATH, orderId: url.searchParams.get("token") });
  });
  server.listen(port);

  return {
    next: () =>
      new Promise<PayerReturn>((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiting.indexOf(done);
          if (index >= 0) waiting.splice(index, 1);
          reject(new Error("Timed out waiting for PayPal to send the payer back."));
        }, APPROVAL_TIMEOUT_MS);
        const done = (value: PayerReturn) => {
          clearTimeout(timer);
          resolve(value);
        };
        waiting.push(done);
      }),
    close: () => server.close(),
  };
}

export async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}
