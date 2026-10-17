import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DelegatePurchaseService } from "../application/delegate-purchases.ts";
import { MandateService } from "../application/mandates.ts";
import { InMemoryAuditRepository } from "../integrations/audit/in-memory-audit-repository.ts";
import { createDemoPartyDirectory } from "../integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../integrations/mandates/in-memory-mandate-repository.ts";
import { createMerchantHistoryService } from "../integrations/merchant-history/create-merchant-history-service.ts";
import { createMerchantCategoryService } from "../integrations/merchant-registry/create-merchant-category-service.ts";
import { createDemoMerchantDirectory } from "../integrations/merchants/demo-merchant-directory.ts";
import { createOpenPaymentsGateway } from "../integrations/open-payments/create-open-payments-gateway.ts";
import { InMemoryGrantStore } from "../integrations/open-payments/in-memory-grant-store.ts";
import { connectDatabase } from "../integrations/postgres/database.ts";
import { PostgresAuditRepository } from "../integrations/postgres/postgres-audit-repository.ts";
import { PostgresGrantStore } from "../integrations/postgres/postgres-grant-store.ts";
import { PostgresMandateRepository } from "../integrations/postgres/postgres-mandate-repository.ts";
import { PostgresSpendingLog } from "../integrations/postgres/postgres-spending-log.ts";
import { InMemorySpendingLog } from "../integrations/spending/in-memory-spending-log.ts";
import {
  DEMO_SESSIONS_PATH,
  DemoIdentityProvider,
  handleStartDemoSession,
  MAX_SESSION_BODY_BYTES,
  readDemoIdentityMode,
  readDemoPayerGrantsMode,
  readDemoPurchasesMode,
} from "./demo-identity.ts";
import {
  handleMandateRequest,
  isMandateApiPath,
  MANDATES_PATH,
  MAX_MANDATE_BODY_BYTES,
  type RuntimeFacts,
} from "./mandates.ts";
import {
  BodyTooLargeError,
  CLAIM_SIGNATURE_HEADER,
  handleGetMerchantCategories,
  handleIngestCategoryClaim,
  type JsonResponse,
  MAX_CLAIM_BODY_BYTES,
  MERCHANT_CATEGORIES_PATH,
  MERCHANT_CATEGORY_CLAIMS_PATH,
  readRequestBody,
} from "./merchant-categories.ts";
import {
  handleOpenPaymentsFinish,
  OPEN_PAYMENTS_FINISH_PATH,
} from "./open-payments-finish.ts";
import {
  DEMO_MERCHANTS_PATH,
  handleListDemoMerchants,
  handlePurchaseRequest,
  isPurchaseApiPath,
  MAX_PURCHASE_BODY_BYTES,
} from "./purchases.ts";

const port = Number(process.env.PORT?.trim() || 4000);
const returnUrl =
  process.env.OPEN_PAYMENTS_RETURN_URL?.trim() || "http://localhost:3000/demo";
// Fail at startup, not inside a request, if the return URL is malformed.
new URL(returnUrl);

// With DATABASE_URL, grants and the trust log live in Supabase Postgres (data/migrations/).
const database = connectDatabase();
console.log(database ? "Storage: Postgres (DATABASE_URL)." : "Storage: in memory. A restart loses every log.");

// One grant store: the gateway writes it, and MandateService reads each grant's
// state from the same instance to confirm consent. There is no second copy.
const grants = database ? new PostgresGrantStore(database) : new InMemoryGrantStore();
const openPayments = await createOpenPaymentsGateway({ grants });
if (!openPayments.configured) {
  console.warn(
    `Open Payments is not configured (missing ${openPayments.missing.join(", ")}). Gateway calls will throw.`,
  );
}

const merchantCategories = await createMerchantCategoryService({
  logWarning: (message) => console.warn(message),
  ...(database ? { database } : {}),
});
if (merchantCategories.demoSubmissions > 0) {
  console.log(
    `Merchant categories: seeded ${merchantCategories.demoSubmissions} simulated Nequi Negocios submissions (demo/test data).`,
  );
}

// Not read by a route yet: the purchase and confirmation routes will. Started
// here so the demo tienda's history is seeded with the rest of the demo data.
const merchantHistory = await createMerchantHistoryService(database ? { database } : {});
if (merchantHistory.demoObservations > 0) {
  console.log(
    `Merchant history: seeded ${merchantHistory.demoObservations} observations for the demo tienda (demo/test data).`,
  );
}

// Mandates. With DATABASE_URL every part lives in Postgres: compas.mandates
// (with the atomic capacity reservation), compas.payer_grants (the same store
// the gateway writes), compas.spending_records and compas.audit_events.
// Without it, everything is in memory and a restart loses it.
const parties = createDemoPartyDirectory();
const mandateRepository = database ? new PostgresMandateRepository(database) : new InMemoryMandateRepository();
const spending = database ? new PostgresSpendingLog(database) : new InMemorySpendingLog();
const mandateAudit = database ? new PostgresAuditRepository(database) : new InMemoryAuditRepository();

// Demo sessions may not ask a real wallet for a grant unless the operator
// opted in, on the Interledger test network only.
const payerGrantsMode = readDemoPayerGrantsMode();
const mandates = new MandateService({
  mandates: mandateRepository,
  parties,
  payments: openPayments.gateway,
  grants,
  audit: mandateAudit,
  spending,
  payerGrants:
    !openPayments.configured || payerGrantsMode.enabled
      ? { allowed: true }
      : { allowed: false, reason: payerGrantsMode.reason },
  logWarning: (message) => console.warn(message),
});
// Purchases. The delegate's flow runs purchaseUnderMandate on the same
// mandates, grants and spending log as above, so the payer sees each attempt.
// A demo session spends a grant only if the operator opted in, on the test network.
const purchasesMode = readDemoPurchasesMode();
const merchantDirectory = createDemoMerchantDirectory();
const purchases = new DelegatePurchaseService({
  mandates,
  merchants: merchantDirectory,
  registry: merchantCategories.registry,
  history: merchantHistory,
  parties,
  grants,
  payments: openPayments.gateway,
  spending,
  capacity: mandateRepository,
  execution: !openPayments.configured
    ? { allowed: false, code: "OPEN_PAYMENTS_NOT_CONFIGURED", reason: "Open Payments is not configured in this environment." }
    : purchasesMode.enabled
      ? { allowed: true }
      : { allowed: false, code: "PURCHASES_DISABLED_FOR_DEMO", reason: purchasesMode.reason },
  logWarning: (message) => console.warn(message),
});

const runtimeFacts: RuntimeFacts = {
  identity: "DEMO",
  persistence: database ? "POSTGRES" : "IN_MEMORY_DEMO",
  openPayments: openPayments.configured ? "configured" : "not_configured",
  payerGrants: !openPayments.configured ? "not_configured" : payerGrantsMode.enabled ? "enabled" : "disabled_for_demo",
  purchases: !openPayments.configured ? "not_configured" : purchasesMode.enabled ? "enabled" : "disabled_for_demo",
};
if (openPayments.configured && !payerGrantsMode.enabled) {
  console.warn(`Payer grants are off for demo sessions: ${payerGrantsMode.reason}`);
}
if (openPayments.configured && !purchasesMode.enabled) {
  console.warn(`Purchases are off for demo sessions: ${purchasesMode.reason}`);
}

const demoIdentityMode = readDemoIdentityMode();
const demoIdentity = demoIdentityMode.enabled ? new DemoIdentityProvider({ parties }) : undefined;
if (demoIdentityMode.enabled) {
  console.warn(
    "Demo identities are enabled (demo/test data): any caller can act as Pedro, Andrea or Gladys. Not for real funds.",
  );
} else {
  console.warn(`Demo identities are disabled (${demoIdentityMode.reason}). Mandate routes answer 503.`);
}

function sendJson(response: ServerResponse, { status, body }: JsonResponse): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function routeMerchantCategories(
  request: IncomingMessage,
  url: URL,
): Promise<JsonResponse | undefined> {
  if (request.method === "POST" && url.pathname === MERCHANT_CATEGORY_CLAIMS_PATH) {
    let body: Uint8Array;
    try {
      body = await readRequestBody(request, MAX_CLAIM_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return { status: 413, body: { error: "BODY_TOO_LARGE" } };
      throw error;
    }
    const signature = request.headers[CLAIM_SIGNATURE_HEADER];
    return handleIngestCategoryClaim(
      body,
      typeof signature === "string" ? signature : undefined,
      merchantCategories,
    );
  }
  if (request.method === "GET" && url.pathname === MERCHANT_CATEGORIES_PATH) {
    return handleGetMerchantCategories(url, merchantCategories);
  }
  return undefined;
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<{ ok: true; body: unknown } | { ok: false; response: JsonResponse }> {
  let raw: Uint8Array;
  try {
    raw = await readRequestBody(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return { ok: false, response: { status: 413, body: { error: "BODY_TOO_LARGE" } } };
    }
    throw error;
  }
  if (raw.length === 0) return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) };
  } catch {
    return { ok: false, response: { status: 400, body: { error: "INVALID_BODY", message: "body is not UTF-8 JSON" } } };
  }
}

/** Demo sessions and the mandate routes. The actor always comes from the session token. */
async function routeMandates(request: IncomingMessage, url: URL): Promise<JsonResponse> {
  if (!demoIdentity) {
    return { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED", message: "No identity provider is enabled." } };
  }
  if (url.pathname === DEMO_SESSIONS_PATH) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    let body: Uint8Array;
    try {
      body = await readRequestBody(request, MAX_SESSION_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return { status: 413, body: { error: "BODY_TOO_LARGE" } };
      throw error;
    }
    return handleStartDemoSession(body, demoIdentity);
  }

  const actor = demoIdentity.authenticate(request.headers.authorization);
  if (!actor) return { status: 401, body: { error: "UNAUTHENTICATED", message: "A session token is required." } };

  if (isPurchaseApiPath(url.pathname)) {
    let purchaseBody: unknown;
    if (request.method === "POST") {
      const parsed = await readJsonBody(request, MAX_PURCHASE_BODY_BYTES);
      if (!parsed.ok) return parsed.response;
      purchaseBody = parsed.body;
    }
    return handlePurchaseRequest({ method: request.method ?? "GET", url, body: purchaseBody }, actor, { service: purchases });
  }

  let body: unknown;
  if (request.method === "POST" && url.pathname === MANDATES_PATH) {
    const parsed = await readJsonBody(request, MAX_MANDATE_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    body = parsed.body;
  }
  return handleMandateRequest(
    { method: request.method ?? "GET", url, body },
    actor,
    { service: mandates, facts: runtimeFacts },
  );
}

/**
 * Health check, the Open Payments consent callback, the merchant category
 * service, demo sessions and the mandate routes. Purchase and payment routes
 * are documented in README.md and belong to the orchestrator.
 */
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        openPayments: openPayments.configured ? "configured" : "not_configured",
        storage: database ? "postgres" : "memory",
        identity: demoIdentity ? "demo" : "disabled",
        persistence: runtimeFacts.persistence,
        payerGrants: runtimeFacts.payerGrants,
        purchases: runtimeFacts.purchases,
      }),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === OPEN_PAYMENTS_FINISH_PATH) {
    const { location } = await handleOpenPaymentsFinish(url, {
      gateway: openPayments.gateway,
      returnUrl,
      // Runs only after finishPayerGrant verified the hash and got an access token.
      onPayerGrantFinished: async (grantKey) => {
        const outcome = await mandates.completeAuthorization(grantKey);
        console.log(`Payer grant finished for ${grantKey}: ${outcome}`);
      },
      logError: (message) => console.error(message),
    });
    response.writeHead(302, { location });
    response.end();
    return;
  }

  if (url.pathname === MERCHANT_CATEGORY_CLAIMS_PATH || url.pathname === MERCHANT_CATEGORIES_PATH) {
    try {
      const result = await routeMerchantCategories(request, url);
      if (result) {
        sendJson(response, result);
        return;
      }
    } catch (error) {
      console.error(
        `Merchant category request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      sendJson(response, { status: 500, body: { error: "internal_error" } });
      return;
    }
  }

  if (request.method === "GET" && url.pathname === DEMO_MERCHANTS_PATH) {
    try {
      sendJson(
        response,
        await handleListDemoMerchants({
          merchants: merchantDirectory,
          registry: merchantCategories.registry,
          sources: merchantCategories.sources,
          sourceCount: merchantCategories.sourceCount,
        }),
      );
    } catch (error) {
      console.error(`Demo merchant request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
  }

  if (url.pathname === DEMO_SESSIONS_PATH || isMandateApiPath(url.pathname) || isPurchaseApiPath(url.pathname)) {
    try {
      sendJson(response, await routeMandates(request, url));
    } catch (error) {
      console.error(`Mandate request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`COMPAS backend listening on ${port}`);
});
