import type { FetchLike } from "../../../src/integrations/paypal/rest-client.ts";

/**
 * A test double of the PayPal REST API at the fetch level: the OAuth token
 * endpoint and Orders v2, with the response shapes the sandbox returned when
 * COMPAS was built (2026-10-26). Test code only: the token is a placeholder.
 */
export const TEST_CLIENT = { clientId: "test-client-id", clientSecret: "test-client-secret" };
export const TEST_ACCESS_TOKEN = "test-access-token";
export const API_BASE_URL = "https://api-m.sandbox.paypal.com";
/** A payee PayPal refuses as PAYEE_ACCOUNT_INVALID. */
export const UNKNOWN_PAYEE = "TESTNQBQDYZZZ";

type Json = Record<string, any>;

export type RecordedRequest = { method: string; path: string; headers: Record<string, string>; body?: Json };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function unprocessable(issue: string, description: string): Response {
  return json(422, {
    name: "UNPROCESSABLE_ENTITY",
    details: [{ issue, description }],
    message: "The requested action could not be performed, semantically incorrect, or failed business validation.",
    debug_id: "test-debug-id",
  });
}

export function fakePayPalApi(options: { tokenExpiresInSeconds?: number; captureStatus?: string } = {}) {
  const requests: RecordedRequest[] = [];
  const orders = new Map<string, Json>();
  const byRequestId = new Map<string, string>();
  let tokens = 0;
  let nextStatus: number | undefined;

  const fetch: FetchLike = async (url, init) => {
    const { pathname } = new URL(url);
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" && headers["content-type"] === "application/json" ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: pathname, headers, ...(body ? { body } : {}) });

    if (nextStatus) {
      const status = nextStatus;
      nextStatus = undefined;
      return json(status, { name: "TEST_FAILURE", message: "forced by the test", debug_id: "test-debug-id" });
    }

    if (pathname === "/v1/oauth2/token") {
      const expected = `Basic ${Buffer.from(`${TEST_CLIENT.clientId}:${TEST_CLIENT.clientSecret}`).toString("base64")}`;
      if (headers.authorization !== expected) return json(401, { error: "invalid_client" });
      tokens += 1;
      return json(200, {
        access_token: `${TEST_ACCESS_TOKEN}-${tokens}`,
        token_type: "Bearer",
        expires_in: options.tokenExpiresInSeconds ?? 32400,
      });
    }
    if (!headers.authorization?.startsWith(`Bearer ${TEST_ACCESS_TOKEN}`)) {
      return json(401, { error: "invalid_token", error_description: "Token signature verification failed" });
    }

    if (method === "POST" && pathname === "/v2/checkout/orders") {
      const requestId = headers["paypal-request-id"];
      const replay = requestId ? byRequestId.get(requestId) : undefined;
      if (replay) return json(201, orders.get(replay));
      const unit = body?.purchase_units?.[0];
      if (unit?.payee?.merchant_id === UNKNOWN_PAYEE) {
        return unprocessable("PAYEE_ACCOUNT_INVALID", "Payee account specified is invalid.");
      }
      const id = `${String(orders.size + 1).padStart(2, "0")}TESTORDER00000`;
      const order = {
        id,
        intent: "CAPTURE",
        status: "PAYER_ACTION_REQUIRED",
        payment_source: { paypal: {} },
        purchase_units: [{ ...unit, payee: { merchant_id: unit?.payee?.merchant_id } }],
        create_time: "2026-10-16T15:00:00Z",
        links: [
          { href: `${API_BASE_URL}/v2/checkout/orders/${id}`, rel: "self", method: "GET" },
          { href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`, rel: "payer-action", method: "GET" },
        ],
      };
      orders.set(id, order);
      if (requestId) byRequestId.set(requestId, id);
      return json(201, order);
    }

    const match = /^\/v2\/checkout\/orders\/([A-Z0-9]+)(\/capture)?$/.exec(pathname);
    if (match) {
      const order = orders.get(match[1]);
      if (!order) {
        return json(404, {
          name: "RESOURCE_NOT_FOUND",
          details: [{ issue: "INVALID_RESOURCE_ID", description: "Specified resource ID does not exist." }],
          message: "The specified resource does not exist.",
          debug_id: "test-debug-id",
        });
      }
      if (method === "GET" && !match[2]) return json(200, order);
      if (method === "POST" && match[2]) {
        if (order.status === "COMPLETED") return unprocessable("ORDER_ALREADY_CAPTURED", "Order already captured.");
        if (order.status !== "APPROVED") return unprocessable("ORDER_NOT_APPROVED", "Payer has not yet approved the Order for payment.");
        order.status = "COMPLETED";
        order.purchase_units[0].payments = {
          captures: [{ id: `CAPTURE${match[1].slice(0, 10)}`, status: options.captureStatus ?? "COMPLETED", amount: order.purchase_units[0].amount }],
        };
        return json(201, order);
      }
    }
    return json(404, { name: "NOT_FOUND" });
  };

  return {
    fetch,
    requests,
    orders,
    /** The payer approved the order at PayPal, logged in as `payerId`. */
    approve(orderId: string, payerId: string) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`no order ${orderId}`);
      order.status = "APPROVED";
      order.payer = { payer_id: payerId, email_address: "payer@personal.example.com" };
      order.payment_source = { paypal: { account_id: payerId, email_address: "payer@personal.example.com" } };
      order.links = order.links.filter((link: Json) => link.rel === "self");
    },
    /** The next request answers with this HTTP status. */
    failNext(status: number) {
      nextStatus = status;
    },
    callsTo(method: string, path: RegExp): RecordedRequest[] {
      return requests.filter((request) => request.method === method && path.test(request.path));
    },
    tokensIssued: () => tokens,
  };
}
