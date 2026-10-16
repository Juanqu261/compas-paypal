import { createServer } from "node:http";
import { createOpenPaymentsGateway } from "../integrations/open-payments/create-open-payments-gateway.ts";
import {
  handleOpenPaymentsFinish,
  OPEN_PAYMENTS_FINISH_PATH,
} from "./open-payments-finish.ts";

const port = Number(process.env.PORT?.trim() || 4000);
const returnUrl =
  process.env.OPEN_PAYMENTS_RETURN_URL?.trim() || "http://localhost:3000/demo";
// Fail at startup, not inside a request, if the return URL is malformed.
new URL(returnUrl);

const openPayments = await createOpenPaymentsGateway();
if (!openPayments.configured) {
  console.warn(
    `Open Payments is not configured (missing ${openPayments.missing.join(", ")}). Gateway calls will throw.`,
  );
}

/**
 * Health check and the Open Payments consent callback.
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

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`COMPAS backend listening on ${port}`);
});
