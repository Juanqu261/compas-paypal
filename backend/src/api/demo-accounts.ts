import {
  type DemoAccounts,
  parseVisitorAccounts,
  type PresenterAccounts,
  presenterKeyMatches,
  type WorkspaceAccounts,
} from "../integrations/demo-workspaces/demo-accounts.ts";
import type { JsonResponse } from "./merchant-categories.ts";

export const DEMO_ACCOUNTS_PATH = "/demo/accounts";
export const MAX_ACCOUNTS_BODY_BYTES = 1024;

function view(accounts: DemoAccounts | undefined, presenter: PresenterAccounts): Record<string, unknown> {
  return {
    accounts:
      accounts?.source === "VISITOR"
        ? accounts
        : accounts?.source === "PRESENTER"
          ? { source: "PRESENTER", payerPinned: presenter.payerPinned }
          : null,
    presenter: presenter.access,
    // Said on every answer, so the screen can say it too.
    stored: "IN_THIS_DEMO_ONLY",
  };
}

/**
 * GET /demo/accounts and POST /demo/accounts: the PayPal sandbox accounts a
 * visitor's demo pays with. The body is
 * `{ "source": "VISITOR", "payerPayPalId": "…", "payeeMerchantId": "…" }` or
 * `{ "source": "PRESENTER", "presenterKey": "…" }`. Account IDs only: a
 * password is never asked for, and nothing here is written anywhere but the
 * workspace's memory.
 */
export function handleDemoAccounts(
  request: { method: string; body?: unknown },
  deps: { accounts: WorkspaceAccounts; presenter: PresenterAccounts },
): JsonResponse {
  if (request.method === "GET") return { status: 200, body: view(deps.accounts.get(), deps.presenter) };
  if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };

  const body = (typeof request.body === "object" && request.body !== null ? request.body : {}) as Record<string, unknown>;
  if (body.source === "PRESENTER") {
    if (deps.presenter.access === "UNAVAILABLE") {
      return { status: 409, body: { error: "PRESENTER_UNAVAILABLE", message: "This server has no presenter accounts." } };
    }
    if (!presenterKeyMatches(deps.presenter, body.presenterKey)) {
      return { status: 403, body: { error: "PRESENTER_KEY_REQUIRED", message: "The presenter's accounts need the presenter link." } };
    }
    deps.accounts.set({ source: "PRESENTER" });
    return { status: 200, body: view(deps.accounts.get(), deps.presenter) };
  }
  if (body.source !== "VISITOR") {
    return {
      status: 400,
      body: { error: "INVALID_ACCOUNTS", message: "source is VISITOR or PRESENTER", fieldErrors: [{ field: "source", code: "INVALID_SOURCE", message: "VISITOR or PRESENTER" }] },
    };
  }
  const parsed = parseVisitorAccounts(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: "INVALID_ACCOUNTS", message: "Check the account IDs.", fieldErrors: parsed.errors } };
  }
  deps.accounts.set(parsed.accounts);
  return { status: 200, body: view(deps.accounts.get(), deps.presenter) };
}
