import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMerchantCategoryService } from "../integrations/merchant-registry/create-merchant-category-service.ts";
import { createOpenPaymentsGateway } from "../integrations/open-payments/create-open-payments-gateway.ts";
import { connectDatabase } from "../integrations/postgres/database.ts";
import { PostgresGrantStore } from "../integrations/postgres/postgres-grant-store.ts";
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

const port = Number(process.env.PORT?.trim() || 4000);
const returnUrl =
  process.env.OPEN_PAYMENTS_RETURN_URL?.trim() || "http://localhost:3000/demo";
// Fail at startup, not inside a request, if the return URL is malformed.
new URL(returnUrl);

// With DATABASE_URL, grants and the trust log live in Supabase Postgres (data/migrations/).
const database = connectDatabase();
console.log(database ? "Storage: Postgres (DATABASE_URL)." : "Storage: in memory. A restart loses every log.");

const openPayments = await createOpenPaymentsGateway(
  database ? { grants: new PostgresGrantStore(database) } : {},
);
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

/**
 * Health check, the Open Payments consent callback and the merchant category service.
 * Mandate, policy, and payment routes are documented in README.md
 * and belong to the orchestrator.
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
      }),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === OPEN_PAYMENTS_FINISH_PATH) {
    const { location } = await handleOpenPaymentsFinish(url, {
      gateway: openPayments.gateway,
      returnUrl,
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

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`COMPAS backend listening on ${port}`);
});
