import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4000);

/**
 * Health check only.
 * Mandate, policy, and payment routes are documented in README.md
 * and are not implemented here.
 */
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`COMPAS backend listening on ${port}`);
});
