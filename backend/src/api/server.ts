import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { InMemoryAgentRepository } from "../integrations/agents/in-memory-agent-repository.ts";
import {
  createDemoWorkspace,
  type DemoWorkspace,
  type DemoWorkspaceShared,
} from "../integrations/demo-workspaces/create-demo-workspace.ts";
import { readPresenterAccounts } from "../integrations/demo-workspaces/demo-accounts.ts";
import { DemoWorkspaces } from "../integrations/demo-workspaces/demo-workspaces.ts";
import { createDemoPartyDirectory } from "../integrations/mandates/demo-party-directory.ts";
import { createMerchantCategoryService } from "../integrations/merchant-registry/create-merchant-category-service.ts";
import { createDemoMerchantDirectory } from "../integrations/merchants/demo-merchant-directory.ts";
import { createPayPalGateway } from "../integrations/paypal/create-paypal-gateway.ts";
import { connectDatabase } from "../integrations/postgres/database.ts";
import { PostgresAnalystRunStore } from "../integrations/postgres/postgres-analyst-run-store.ts";
import {
  DEMO_SESSIONS_PATH,
  DemoIdentityProvider,
  handleStartDemoSession,
  MAX_SESSION_BODY_BYTES,
  readDemoIdentityMode,
  readDemoPurchasesMode,
} from "./demo-identity.ts";
import { DEMO_ACCOUNTS_PATH, handleDemoAccounts, MAX_ACCOUNTS_BODY_BYTES } from "./demo-accounts.ts";
import {
  bearerSecretHash,
  clientAddress,
  DEMO_WORKSPACES_PATH,
  handleStartDemoWorkspace,
  oauthSecretHash,
  UNKNOWN_WORKSPACE,
  WORKSPACE_HEADER,
} from "./demo-workspaces.ts";
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
import { handleDemoAgentRequest, isDemoAgentPath } from "./demo-agent.ts";
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
import {
  DEMO_MERCHANTS_PATH,
  handleListDemoMerchants,
  handlePurchaseRequest,
  isPurchaseApiPath,
  MAX_PURCHASE_BODY_BYTES,
} from "./purchases.ts";
import { handleMerchantPayments, merchantPaymentsId } from "./merchant-payments.ts";
import type { Actor } from "../application/mandates.ts";
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

// With DATABASE_URL, the merchant trust log lives in Supabase Postgres
// (data/migrations/). A visitor's demo never does: budgets, spending, errands
// and agent grants live in that visitor's workspace, in memory.
const database = connectDatabase();
log.info(
  database
    ? "Storage: trust log in Postgres (DATABASE_URL). Visitors' demos are in memory."
    : "Storage: in memory. A restart loses every log and every visitor's demo.",
);

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

// A demo session creates PayPal orders only if the operator opted in.
const purchasesMode = readDemoPurchasesMode();
const merchantDirectory = createDemoMerchantDirectory();

// The AI analyst, merchant catalogs with CUM mapping, and the Cámara binding
// through Log in with PayPal. Elastic, the analyst's model and Log in with
// PayPal throw when not configured. Their stores are in memory, shared by
// every visitor: they describe merchants, not visitors.
const demoSeed = process.env.MERCHANT_CATEGORY_DEMO_SEED?.trim().toLowerCase() !== "false";
const analyst = await createAnalystLayer({
  merchants: merchantDirectory,
  registry: merchantCategories.registry,
  ingest: merchantCategories.ingest,
  demo: demoSeed,
  logWarning,
  ...(database ? { runs: new PostgresAnalystRunStore(database) } : {}),
});
if (analyst.elastic.missing.length > 0) {
  log.warn(`Elastic is not fully configured (missing ${analyst.elastic.missing.join(", ")}). Analyst and errand-draft calls will throw.`);
}
log.info(`Analyst model: ${analyst.modelVendor === "claude" ? "Claude (Claude API)" : "Elastic Inference API"}.`);
if (analyst.demoCatalogItems > 0) {
  log.info(`Merchant catalogs: seeded ${analyst.demoCatalogItems} demo SKUs (demo/test data). CUM mappings come from analyst runs.`);
}
// The last real run per merchant, shown to everyone until the next live run may start.
const restoredRuns = await analyst.restoreRuns();
if (restoredRuns > 0) log.info(`Analyst: restored the last real run of ${restoredRuns} merchant(s); their CUM pointers were verified again.`);
const analystJobsMode = readAnalystJobsMode();
const operatorToken = process.env.COMPAS_OPERATOR_TOKEN?.trim();

// What every visitor's demo workspace shares.
const workspaceShared: DemoWorkspaceShared = {
  paypal,
  merchants: merchantDirectory,
  registry: merchantCategories.registry,
  catalogs: analyst.catalogs,
  mappings: analyst.mappings,
  cumRegistry: analyst.cumRegistry,
  model: analyst.model,
  search: analyst.elastic.search,
  execution: !paypal.configured
    ? { allowed: false, code: "PAYPAL_NOT_CONFIGURED", reason: "PayPal is not configured in this environment." }
    : purchasesMode.enabled
      ? { allowed: true }
      : { allowed: false, code: "PURCHASES_DISABLED_FOR_DEMO", reason: purchasesMode.reason },
  // Agent clients and pending requests: an MCP client registers before any visitor answers it.
  agents: new InMemoryAgentRepository(),
  publicUrl,
  mcpUrl: `${publicUrl}${MCP_PATH}`,
  logWarning,
};

const parties = createDemoPartyDirectory();
const runtimeFacts: RuntimeFacts = {
  identity: "DEMO",
  persistence: "IN_MEMORY_DEMO",
  paypal: paypal.configured ? "sandbox" : "not_configured",
  payerApproval: "PINNED",
  purchases: !paypal.configured ? "not_configured" : purchasesMode.enabled ? "enabled" : "disabled_for_demo",
};
if (paypal.configured && !purchasesMode.enabled) {
  log.warn(`Purchases are off for demo sessions: ${purchasesMode.reason}`);
}

// The sandbox accounts a demo pays with: each visitor's own, or the
// presenter's configured ones, open to everyone unless COMPAS_PRESENTER_KEY
// is set.
const presenter = readPresenterAccounts();
if (presenter.access === "OPEN") {
  log.warn("Presenter accounts are open to every visitor. Set COMPAS_PRESENTER_KEY before deploying.");
} else if (presenter.access === "KEY") {
  log.info("Presenter accounts: only with the presenter link (COMPAS_PRESENTER_KEY).");
}
if (presenter.access !== "UNAVAILABLE" && !presenter.payerPinned) {
  log.warn(
    "DEMO_PAYER_PAYPAL_ID is not set: with the presenter's accounts, COMPAS captures an order whichever PayPal account approved it.",
  );
}

/** A visitor's own accounts always pin the payer. The presenter's do when DEMO_PAYER_PAYPAL_ID is set. */
function factsFor(workspace: DemoWorkspace): RuntimeFacts {
  const pinned = workspace.accounts.get()?.source === "VISITOR" || presenter.payerPinned;
  return { ...runtimeFacts, payerApproval: pinned ? "PINNED" : "ANY_ACCOUNT" };
}

const demoIdentityMode = readDemoIdentityMode();
const demoIdentity = demoIdentityMode.enabled ? new DemoIdentityProvider({ parties }) : undefined;
if (demoIdentityMode.enabled) {
  log.warn(
    "Demo identities are enabled (demo/test data): each visitor's demo has its own Pedro, Andrea and Gladys. Not for real funds.",
  );
} else {
  log.warn(`Demo identities are disabled (${demoIdentityMode.reason}). Mandate routes answer 503.`);
}

// One workspace per visitor. Its sessions end with it.
const workspaces = new DemoWorkspaces<DemoWorkspace>({
  create: (hooks) => createDemoWorkspace(workspaceShared, createDemoPartyDirectory(), hooks),
  onEnd: (id) => demoIdentity?.endScope(id),
});
setInterval(() => workspaces.sweep(), 5 * 60 * 1000).unref();
const trustForwardedFor = process.env.COMPAS_TRUST_FORWARDED_FOR?.trim().toLowerCase() === "true";

// Answers the agent calls that come before any workspace is known (discovery,
// registration, the authorization request) and those whose token no live
// workspace issued. No visitor ever acts in it, so it holds no one's data.
const lobby = await createDemoWorkspace(workspaceShared, parties, { onOrder: () => {}, onAgentToken: () => {} });
const agentWorkspace = (secretHash: string | undefined) => (secretHash && workspaces.byAgentSecret(secretHash)) || lobby;

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

/** The actor behind the session token, and the visitor's workspace the session acts in. */
function sessionIn(request: IncomingMessage): { actor: Actor; workspace: DemoWorkspace } | undefined {
  const session = demoIdentity?.resolve(request.headers.authorization);
  const workspace = workspaces.byId(session?.scope);
  return session && workspace ? { actor: session.actor, workspace } : undefined;
}

/** Demo workspaces, demo sessions and the mandate routes. The actor always comes from the session token. */
async function routeMandates(request: IncomingMessage, url: URL): Promise<JsonResponse> {
  if (!demoIdentity) {
    return { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED", message: "No identity provider is enabled." } };
  }
  if (url.pathname === DEMO_WORKSPACES_PATH) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    return handleStartDemoWorkspace(workspaces, clientAddress(request, trustForwardedFor));
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
    return handleStartDemoSession(body, demoIdentity, (token) => workspaces.idOf(token));
  }

  const session = sessionIn(request);
  if (!session) return { status: 401, body: { error: "UNAUTHENTICATED", message: "A session token is required." } };
  const { actor, workspace } = session;

  if (isErrandApiPath(url.pathname)) {
    let errandBody: unknown;
    if (request.method === "POST") {
      const parsed = await readJsonBody(request, MAX_ERRAND_BODY_BYTES);
      if (!parsed.ok) return parsed.response;
      errandBody = parsed.body;
    }
    return handleErrandRequest({ method: request.method ?? "GET", url, body: errandBody }, actor, {
      service: workspace.errandService,
    });
  }

  if (isPurchaseApiPath(url.pathname)) {
    let purchaseBody: unknown;
    if (request.method === "POST") {
      const parsed = await readJsonBody(request, MAX_PURCHASE_BODY_BYTES);
      if (!parsed.ok) return parsed.response;
      purchaseBody = parsed.body;
    }
    return handlePurchaseRequest({ method: request.method ?? "GET", url, body: purchaseBody }, actor, { service: workspace.purchases });
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
    { service: workspace.mandates, facts: factsFor(workspace) },
  );
}

/** The delegate's answers to an agent's request, and the agent grants. Needs a COMPAS session. */
async function routeAgentConsent(request: IncomingMessage, url: URL): Promise<ApiResponse> {
  if (!demoIdentity) {
    return { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED", message: "No identity provider is enabled." } };
  }
  const session = sessionIn(request);
  if (!session) return { status: 401, body: { error: "UNAUTHENTICATED", message: "A session token is required." } };
  const { actor, workspace } = session;
  let body: unknown;
  if (request.method === "POST") {
    const parsed = await readJsonBody(request, MAX_CONSENT_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    body = parsed.body;
  }
  if (isDemoAgentPath(url.pathname)) {
    return handleDemoAgentRequest({ method: request.method ?? "GET", url, body }, actor, { runs: workspace.demoAgents });
  }
  return handleAgentConsentRequest({ method: request.method ?? "GET", url, body }, actor, { auth: workspace.agentAuth });
}

/**
 * Health check, the PayPal return and cancel redirects, the merchant
 * category service, demo workspaces and sessions, the mandate routes, the
 * purchase routes, and the agent routes: OAuth, the consent answers and the
 * MCP endpoint.
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
        demoWorkspaces: workspaces.size,
      }),
    );
    return;
  }

  if (request.method === "GET" && isPayPalReturnPath(url.pathname)) {
    const { location, result } = await handlePayPalReturn(url, {
      settlementFor: (orderId) => workspaces.byOrder(orderId)?.settlement,
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

  if (url.pathname === DEMO_ACCOUNTS_PATH) {
    // The visitor's own demo, named by its workspace token like the pharmacy's payments.
    const workspace = workspaces.byToken(request.headers[WORKSPACE_HEADER]);
    if (!demoIdentity) {
      sendJson(response, { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED", message: "Demo sessions are disabled." } });
      return;
    }
    if (!workspace) {
      sendJson(response, UNKNOWN_WORKSPACE);
      return;
    }
    let body: unknown;
    if (request.method === "POST") {
      const parsed = await readJsonBody(request, MAX_ACCOUNTS_BODY_BYTES);
      if (!parsed.ok) {
        sendJson(response, parsed.response);
        return;
      }
      body = parsed.body;
    }
    const result = handleDemoAccounts({ method: request.method ?? "GET", body }, { accounts: workspace.accounts, presenter });
    if (request.method === "POST" && result.status === 200) {
      log.info("demo accounts set", { source: workspace.accounts.get()?.source });
    }
    sendJson(response, result);
    return;
  }

  const paymentsMerchantId = request.method === "GET" ? merchantPaymentsId(url.pathname) : undefined;
  if (paymentsMerchantId) {
    // The visitor's own demo: the pharmacy has no demo person, so the workspace is named directly.
    const workspace = workspaces.byToken(request.headers[WORKSPACE_HEADER]);
    if (demoIdentity && !workspace) {
      sendJson(response, UNKNOWN_WORKSPACE);
      return;
    }
    try {
      sendJson(
        response,
        await handleMerchantPayments(paymentsMerchantId, {
          enabled: Boolean(demoIdentity),
          paypalConfigured: paypal.configured,
          merchants: (workspace ?? lobby).merchants,
          spending: (workspace ?? lobby).spending,
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

  if (isOAuthPath(url.pathname) || url.pathname === MCP_PATH || isAgentConsentPath(url.pathname) || isDemoAgentPath(url.pathname)) {
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
            {
              auth: agentWorkspace(oauthSecretHash(url.pathname, rawBody)).agentAuth,
              issuer: publicUrl,
              consentUrl: agentConsentUrl,
            },
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
        const workspace = agentWorkspace(bearerSecretHash(request.headers.authorization));
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
              auth: workspace.agentAuth,
              shopping: workspace.agentShopping,
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
    url.pathname === DEMO_WORKSPACES_PATH ||
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
