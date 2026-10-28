import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AgentAuthService } from "../application/agent-auth.ts";
import { AgentShoppingService } from "../application/agent-shopping.ts";
import { DelegatePurchaseService } from "../application/delegate-purchases.ts";
import { MandateService } from "../application/mandates.ts";
import { PayPalOrderSettlement } from "../application/settle-paypal-order.ts";
import { InMemoryAgentRepository } from "../integrations/agents/in-memory-agent-repository.ts";
import { InMemoryAuditRepository } from "../integrations/audit/in-memory-audit-repository.ts";
import { createDemoPartyDirectory, DEMO_PARTY_IDS } from "../integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../integrations/mandates/in-memory-mandate-repository.ts";
import { createMerchantHistoryService } from "../integrations/merchant-history/create-merchant-history-service.ts";
import { createMerchantCategoryService } from "../integrations/merchant-registry/create-merchant-category-service.ts";
import { createDemoMerchantDirectory } from "../integrations/merchants/demo-merchant-directory.ts";
import { paypalAcceptsAsset } from "../integrations/paypal/amounts.ts";
import { createPayPalGateway } from "../integrations/paypal/create-paypal-gateway.ts";
import { connectDatabase } from "../integrations/postgres/database.ts";
import { PostgresAuditRepository } from "../integrations/postgres/postgres-audit-repository.ts";
import { PostgresMandateRepository } from "../integrations/postgres/postgres-mandate-repository.ts";
import { PostgresSpendingLog } from "../integrations/postgres/postgres-spending-log.ts";
import { InMemorySpendingLog } from "../integrations/spending/in-memory-spending-log.ts";
import {
  DEMO_SESSIONS_PATH,
  DemoIdentityProvider,
  handleStartDemoSession,
  MAX_SESSION_BODY_BYTES,
  readDemoIdentityMode,
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
import { handleMcpRequest, MAX_MCP_BODY_BYTES, MCP_PATH } from "./mcp.ts";
import {
  type ApiResponse,
  handleAgentConsentRequest,
  handleOAuthRequest,
  isAgentConsentPath,
  isOAuthPath,
  MAX_CONSENT_BODY_BYTES,
  MAX_OAUTH_BODY_BYTES,
} from "./oauth.ts";
import { handlePayPalReturn, isPayPalReturnPath } from "./paypal-return.ts";
import { handleErrandRequest, isErrandApiPath, MAX_ERRAND_BODY_BYTES } from "./errands.ts";
import {
  handleMerchantOnboardingRequest,
  isMerchantOnboardingPath,
  MAX_ONBOARDING_BODY_BYTES,
  readAnalystJobsMode,
} from "./merchant-onboarding.ts";
import { createAnalystLayer } from "../integrations/analyst/create-analyst-layer.ts";
import { InMemoryErrandRepository } from "../integrations/errands/in-memory-errand-repository.ts";
import {
  DEMO_MERCHANTS_PATH,
  handleListDemoMerchants,
  handlePurchaseRequest,
  isPurchaseApiPath,
  MAX_PURCHASE_BODY_BYTES,
} from "./purchases.ts";
import { handleMerchantPayments, merchantPaymentsId } from "./merchant-payments.ts";
import { elapsed, logger } from "../lib/log.ts";

const log = logger("server");
const httpLog = logger("http");
const app = logger("app");
// The services' injected warning callback.
const logWarning = (message: string) => app.warn(message);

const port = Number(process.env.PORT?.trim() || 4000);
const returnUrl =
  process.env.PAYPAL_FRONTEND_RETURN_URL?.trim() || "http://localhost:3000/demo";
// Fail at startup, not inside a request, if the return URL is malformed.
new URL(returnUrl);
// Where a merchant's browser lands after Log in with PayPal.
const merchantReturnUrl =
  process.env.PAYPAL_IDENTITY_FRONTEND_RETURN_URL?.trim() || "http://localhost:3000/paypal-business";
new URL(merchantReturnUrl);
// Where MCP clients reach this server, and the screen where a delegate answers an agent's request.
const publicUrl = (process.env.COMPAS_PUBLIC_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, "");
const agentConsentUrl = process.env.COMPAS_AGENT_CONSENT_URL?.trim() || "http://localhost:3000/agents/authorize";
new URL(publicUrl);
new URL(agentConsentUrl);
const mcpAllowedOrigins = new Set([
  new URL(publicUrl).origin,
  ...(process.env.COMPAS_MCP_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []),
]);

// With DATABASE_URL, mandates, spending and the trust log live in Supabase Postgres (data/migrations/).
const database = connectDatabase();
log.info(database ? "Storage: Postgres (DATABASE_URL)." : "Storage: in memory. A restart loses every log.");

// PayPal sandbox only. Without the app credentials every PayPal call throws.
const paypal = createPayPalGateway();
if (!paypal.configured) {
  log.warn(`PayPal is not configured (missing ${paypal.missing.join(", ")}). PayPal calls will throw.`);
}

const merchantCategories = await createMerchantCategoryService({
  logWarning,
  ...(database ? { database } : {}),
});
if (merchantCategories.demoSubmissions > 0) {
  log.info(
    `Merchant categories: seeded ${merchantCategories.demoSubmissions} simulated wallet KYB submissions (demo/test data).`,
  );
}

// The purchase and confirmation flows read it. Started here so the demo
// tienda's history is seeded with the rest of the demo data.
const merchantHistory = await createMerchantHistoryService(database ? { database } : {});
if (merchantHistory.demoObservations > 0) {
  log.info(
    `Merchant history: seeded ${merchantHistory.demoObservations} observations for the demo tienda (demo/test data).`,
  );
}

// Mandates. With DATABASE_URL every part lives in Postgres: compas.mandates
// (with the atomic capacity reservation), compas.spending_records and
// compas.audit_events. Without it, everything is in memory and a restart loses it.
const parties = createDemoPartyDirectory();
const mandateRepository = database ? new PostgresMandateRepository(database) : new InMemoryMandateRepository();
const spending = database ? new PostgresSpendingLog(database) : new InMemorySpendingLog();
const mandateAudit = database ? new PostgresAuditRepository(database) : new InMemoryAuditRepository();

// Errands, in memory. Shared by the purchase flow, which reserves an errand's
// units, and the settlement, which gives them back when nothing is paid.
const errandRepository = new InMemoryErrandRepository();

// The only path to a capture: it reads the order from PayPal and the mandate
// from the repository again, and captures only what still matches.
const settlement = new PayPalOrderSettlement({
  payments: paypal.gateway,
  spending,
  mandates: mandateRepository,
  parties,
  history: merchantHistory,
  errands: errandRepository,
  logWarning,
});

const mandates = new MandateService({
  mandates: mandateRepository,
  parties,
  audit: mandateAudit,
  spending,
  acceptsAsset: paypalAcceptsAsset,
  ...(paypal.configured ? { settlement } : {}),
  logWarning,
});
// Purchases. The delegate's flow runs purchaseUnderMandate on the same
// mandates and spending log as above, so the payer sees each attempt.
// A demo session creates PayPal orders only if the operator opted in.
const purchasesMode = readDemoPurchasesMode();
const merchantDirectory = createDemoMerchantDirectory();

// The AI analyst, merchant catalogs with CUM mapping, the Cámara binding
// through Log in with PayPal, and errands. Elastic, the analyst's model and
// Log in with PayPal throw when not configured. Their stores are in memory.
const demoSeed = process.env.MERCHANT_CATEGORY_DEMO_SEED?.trim().toLowerCase() !== "false";
const analyst = await createAnalystLayer({
  merchants: merchantDirectory,
  registry: merchantCategories.registry,
  ingest: merchantCategories.ingest,
  mandates,
  demo: demoSeed,
  errands: errandRepository,
  logWarning,
});
if (analyst.elastic.missing.length > 0) {
  log.warn(`Elastic is not fully configured (missing ${analyst.elastic.missing.join(", ")}). Analyst and errand-draft calls will throw.`);
}
log.info(`Analyst model: ${analyst.modelVendor === "claude" ? "Claude (Claude API)" : "Elastic Inference API"}.`);
if (analyst.demoCatalogItems > 0) {
  log.info(`Merchant catalogs: seeded ${analyst.demoCatalogItems} demo SKUs (demo/test data). CUM mappings come from analyst runs.`);
}
const analystJobsMode = readAnalystJobsMode();
const operatorToken = process.env.COMPAS_OPERATOR_TOKEN?.trim();

const purchases = new DelegatePurchaseService({
  mandates,
  merchants: merchantDirectory,
  registry: merchantCategories.registry,
  history: merchantHistory,
  payments: paypal.gateway,
  spending,
  capacity: mandateRepository,
  catalog: { catalogs: analyst.catalogs, mappings: analyst.mappings },
  errands: errandRepository,
  execution: !paypal.configured
    ? { allowed: false, code: "PAYPAL_NOT_CONFIGURED", reason: "PayPal is not configured in this environment." }
    : purchasesMode.enabled
      ? { allowed: true }
      : { allowed: false, code: "PURCHASES_DISABLED_FOR_DEMO", reason: purchasesMode.reason },
  logWarning,
});

// AI agents over MCP (ADR 0011). An agent holds a grant bound to the errands
// its delegate picked, and reaches PayPal only through `purchases` above.
// Grants and tokens are in memory: a restart asks every agent to authorize again.
const agentAuth = new AgentAuthService({
  repo: new InMemoryAgentRepository(),
  errands: errandRepository,
  mandates,
  resource: `${publicUrl}${MCP_PATH}`,
});
const agentShopping = new AgentShoppingService({
  errands: errandRepository,
  mandates,
  merchants: merchantDirectory,
  registry: merchantCategories.registry,
  history: merchantHistory,
  catalogs: analyst.catalogs,
  mappings: analyst.mappings,
  cum: analyst.cumRegistry,
  purchases,
});

const payerPinned = Boolean((await parties.getById(DEMO_PARTY_IDS.pedro))?.paypalPayerId);
const runtimeFacts: RuntimeFacts = {
  identity: "DEMO",
  persistence: database ? "POSTGRES" : "IN_MEMORY_DEMO",
  paypal: paypal.configured ? "sandbox" : "not_configured",
  payerApproval: payerPinned ? "PINNED" : "ANY_ACCOUNT",
  purchases: !paypal.configured ? "not_configured" : purchasesMode.enabled ? "enabled" : "disabled_for_demo",
};
if (paypal.configured && !purchasesMode.enabled) {
  log.warn(`Purchases are off for demo sessions: ${purchasesMode.reason}`);
}
if (paypal.configured && !payerPinned) {
  log.warn(
    "DEMO_PAYER_PAYPAL_ID is not set: COMPAS captures an order whichever PayPal account approved it.",
  );
}

const demoIdentityMode = readDemoIdentityMode();
const demoIdentity = demoIdentityMode.enabled ? new DemoIdentityProvider({ parties }) : undefined;
if (demoIdentityMode.enabled) {
  log.warn(
    "Demo identities are enabled (demo/test data): any caller can act as Pedro, Andrea or Gladys. Not for real funds.",
  );
} else {
  log.warn(`Demo identities are disabled (${demoIdentityMode.reason}). Mandate routes answer 503.`);
}

function sendJson(response: ServerResponse, { status, body }: JsonResponse): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/**
 * OAuth and MCP answers: extra headers, a redirect, or no body at all (a
 * 202). An MCP batch answers with an array.
 */
function sendApi(
  response: ServerResponse,
  { status, body, headers, location }: Omit<ApiResponse, "body"> & { body?: ApiResponse["body"] | readonly unknown[] },
): void {
  response.writeHead(status, {
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...headers,
    ...(location ? { location } : {}),
  });
  response.end(body !== undefined ? JSON.stringify(body) : undefined);
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

  if (isErrandApiPath(url.pathname)) {
    let errandBody: unknown;
    if (request.method === "POST") {
      const parsed = await readJsonBody(request, MAX_ERRAND_BODY_BYTES);
      if (!parsed.ok) return parsed.response;
      errandBody = parsed.body;
    }
    return handleErrandRequest({ method: request.method ?? "GET", url, body: errandBody }, actor, {
      service: analyst.errandService,
    });
  }

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

/** The delegate's answers to an agent's request, and the agent grants. Needs a COMPAS session. */
async function routeAgentConsent(request: IncomingMessage, url: URL): Promise<ApiResponse> {
  if (!demoIdentity) {
    return { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED", message: "No identity provider is enabled." } };
  }
  const actor = demoIdentity.authenticate(request.headers.authorization);
  if (!actor) return { status: 401, body: { error: "UNAUTHENTICATED", message: "A session token is required." } };
  let body: unknown;
  if (request.method === "POST") {
    const parsed = await readJsonBody(request, MAX_CONSENT_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    body = parsed.body;
  }
  return handleAgentConsentRequest({ method: request.method ?? "GET", url, body }, actor, { auth: agentAuth });
}

/**
 * Health check, the PayPal return and cancel redirects, the merchant
 * category service, demo sessions, the mandate routes, the purchase routes,
 * and the agent routes: OAuth, the consent answers and the MCP endpoint.
 */
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  // The path only: query strings carry PayPal tokens and OAuth codes.
  const start = performance.now();
  response.on("finish", () => {
    const status = response.statusCode;
    const fields = { status, ms: elapsed(start) };
    const line = `${request.method} ${url.pathname}`;
    if (status >= 500) httpLog.error(line, fields);
    else if (status >= 400) httpLog.warn(line, fields);
    // The frontend polls its reads every few seconds: those show with LOG_LEVEL=debug.
    else if (request.method === "GET" && status < 300) httpLog.debug(line, fields);
    else httpLog.info(line, fields);
  });

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        paypal: runtimeFacts.paypal,
        storage: database ? "postgres" : "memory",
        identity: demoIdentity ? "demo" : "disabled",
        persistence: runtimeFacts.persistence,
        payerApproval: runtimeFacts.payerApproval,
        purchases: runtimeFacts.purchases,
        elastic: analyst.elastic.missing.length === 0 ? "configured" : "not_configured",
        analystModel: analyst.modelVendor,
        cumRegistry: analyst.cumRegistry.provenance,
        merchantLogin: analyst.identityConfigured ? "paypal_sandbox" : "not_configured",
        analystJobs: analystJobsMode.enabled ? "enabled" : "disabled",
      }),
    );
    return;
  }

  if (request.method === "GET" && isPayPalReturnPath(url.pathname)) {
    const { location, result } = await handlePayPalReturn(url, {
      settlement,
      returnUrl,
      logError: (message) => httpLog.error(message),
    });
    log.info(`PayPal ${url.pathname.endsWith("cancel") ? "cancel" : "return"}: ${result}`);
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
      httpLog.error(
        `Merchant category request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      sendJson(response, { status: 500, body: { error: "internal_error" } });
      return;
    }
  }

  const paymentsMerchantId = request.method === "GET" ? merchantPaymentsId(url.pathname) : undefined;
  if (paymentsMerchantId) {
    try {
      sendJson(
        response,
        await handleMerchantPayments(paymentsMerchantId, {
          enabled: Boolean(demoIdentity),
          paypalConfigured: paypal.configured,
          merchants: merchantDirectory,
          spending,
          payments: paypal.gateway,
        }),
      );
    } catch (error) {
      httpLog.error(`Merchant payments request failed: ${error instanceof Error ? error.name : "error"}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
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
      httpLog.error(`Demo merchant request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
  }

  if (isMerchantOnboardingPath(url.pathname)) {
    try {
      let body: unknown;
      if (request.method === "POST") {
        const parsed = await readJsonBody(request, MAX_ONBOARDING_BODY_BYTES);
        if (!parsed.ok) {
          sendJson(response, parsed.response);
          return;
        }
        body = parsed.body;
      }
      const result = await handleMerchantOnboardingRequest(
        {
          method: request.method ?? "GET",
          url,
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
          body,
        },
        {
          identity: analyst.identity,
          identityConfigured: analyst.identityConfigured,
          demoSessions: Boolean(demoIdentity),
          merchants: merchantDirectory,
          findings: analyst.findings,
          bindCertificate: analyst.bindCertificate,
          respond: analyst.respond,
          withdraw: analyst.withdraw,
          jobs: { mode: analystJobsMode, queue: analyst.jobs },
          ...(operatorToken ? { operatorToken } : {}),
          ...(analyst.camara.certificateText ? { demoCertificateText: (id: string) => analyst.camara.certificateText!(id) } : {}),
          frontendReturnUrl: merchantReturnUrl,
        },
      );
      if ("location" in result) {
        response.writeHead(302, { location: result.location });
        response.end();
      } else if ("text" in result) {
        response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        response.end(result.text);
      } else {
        sendJson(response, result);
      }
    } catch (error) {
      httpLog.error(`Merchant onboarding request failed: ${error instanceof Error ? error.name : "error"}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
  }

  if (isOAuthPath(url.pathname) || url.pathname === MCP_PATH || isAgentConsentPath(url.pathname)) {
    try {
      if (isOAuthPath(url.pathname)) {
        let rawBody: Uint8Array | undefined;
        if (request.method === "POST") {
          try {
            rawBody = await readRequestBody(request, MAX_OAUTH_BODY_BYTES);
          } catch (error) {
            if (error instanceof BodyTooLargeError) {
              sendApi(response, { status: 413, body: { error: "BODY_TOO_LARGE" } });
              return;
            }
            throw error;
          }
        }
        sendApi(
          response,
          await handleOAuthRequest(
            { method: request.method ?? "GET", url, ...(rawBody ? { rawBody } : {}) },
            { auth: agentAuth, issuer: publicUrl, consentUrl: agentConsentUrl },
          ),
        );
      } else if (url.pathname === MCP_PATH) {
        let body: unknown;
        if (request.method === "POST") {
          const parsed = await readJsonBody(request, MAX_MCP_BODY_BYTES);
          if (!parsed.ok) {
            sendApi(response, parsed.response);
            return;
          }
          body = parsed.body;
        }
        const protocolVersion = request.headers["mcp-protocol-version"];
        sendApi(
          response,
          await handleMcpRequest(
            {
              method: request.method ?? "GET",
              ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
              ...(request.headers.origin ? { origin: request.headers.origin } : {}),
              ...(typeof protocolVersion === "string" ? { protocolVersion } : {}),
              body,
            },
            {
              auth: agentAuth,
              shopping: agentShopping,
              resourceMetadataUrl: `${publicUrl}/.well-known/oauth-protected-resource/mcp`,
              allowedOrigins: mcpAllowedOrigins,
            },
          ),
        );
      } else {
        sendApi(response, await routeAgentConsent(request, url));
      }
    } catch (error) {
      httpLog.error(`Agent request failed: ${error instanceof Error ? error.name : "error"}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
  }

  if (
    url.pathname === DEMO_SESSIONS_PATH ||
    isMandateApiPath(url.pathname) ||
    isPurchaseApiPath(url.pathname) ||
    isErrandApiPath(url.pathname)
  ) {
    try {
      sendJson(response, await routeMandates(request, url));
    } catch (error) {
      httpLog.error(`Mandate request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(response, { status: 500, body: { error: "internal_error" } });
    }
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  log.info(`COMPAS backend listening on ${port}`);
});
