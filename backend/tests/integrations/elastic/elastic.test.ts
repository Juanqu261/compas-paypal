import assert from "node:assert/strict";
import test from "node:test";
import { readElasticConfig } from "../../../src/integrations/elastic/config.ts";
import { createElastic } from "../../../src/integrations/elastic/create-elastic.ts";
import { cumDocument, cumIndexDefinition, ElasticCumSearch } from "../../../src/integrations/elastic/cum-index.ts";
import { ElasticInferenceAnalystModel, parseToolCall } from "../../../src/integrations/elastic/inference-analyst-model.ts";
import { ElasticError, ElasticRestClient, readServerSentEvents } from "../../../src/integrations/elastic/rest-client.ts";
import { AnalystModelError } from "../../../src/ports/analyst-model.ts";
import type { FetchLike } from "../../../src/lib/fetch-like.ts";

const CONFIG = { url: "https://compas-test.es.example.cloud", apiKey: "test-api-key" };

/** A stream that delivers `chunks` as separate reads, so events and lines split across them. */
function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const events: string[] = [];
  for await (const data of readServerSentEvents(stream)) events.push(data);
  return events;
}

test("server-sent events are joined across reads, with CRLF and comments", async () => {
  assert.deepEqual(await collect(streamOf(["event: message\ndata: {\"a\"", ":1}\n\n: keepalive\n", "data: two\r\n\r\ndata: [DONE]\n\n"])), [
    '{"a":1}',
    "two",
    "[DONE]",
  ]);
});

function chunk(name: string | undefined, args: string) {
  return `data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [{ index: 0, ...(name ? { id: "call-1" } : {}), function: { ...(name ? { name } : {}), arguments: args } }] } }],
  })}\n\n`;
}

test("the analyst model forces one tool call and joins its argument fragments", async () => {
  const requests: { url: string; body: Record<string, any>; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    requests.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(streamOf([chunk("report", '{"items":[{"sk'), chunk(undefined, 'uId":"a"}],'), chunk(undefined, '"x":1}'), "data: [DONE]\n\n"]), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  const model = new ElasticInferenceAnalystModel({ client: new ElasticRestClient({ config: CONFIG, fetch }), inferenceId: "analyst-llm" });
  const result = await model.callTool({ system: "sys", user: "data", tool: { name: "report", description: "d", parameters: { type: "object" } } });

  assert.deepEqual(result, { items: [{ skuId: "a" }], x: 1 });
  assert.equal(requests[0].url, `${CONFIG.url}/_inference/chat_completion/analyst-llm/_stream`);
  assert.equal(requests[0].headers.authorization, "ApiKey test-api-key");
  assert.deepEqual(requests[0].body.tool_choice, { type: "function", function: { name: "report" } });
  assert.deepEqual(requests[0].body.messages.map((message: { role: string }) => message.role), ["system", "user"]);
});

test("anything but one call of the forced tool with a JSON object is an error", () => {
  assert.throws(() => parseToolCall([], "report"), AnalystModelError);
  assert.throws(() => parseToolCall([{ name: "other", arguments: "{}" }], "report"), AnalystModelError);
  assert.throws(() => parseToolCall([{ name: "report", arguments: "{not json" }], "report"), AnalystModelError);
  assert.throws(() => parseToolCall([{ name: "report", arguments: "[1]" }], "report"), AnalystModelError);
  assert.throws(
    () => parseToolCall([{ name: "report", arguments: "{}" }, { name: "report", arguments: "{}" }], "report"),
    AnalystModelError,
  );
});

test("an error event from the inference endpoint fails the call", async () => {
  const fetch: FetchLike = async () =>
    new Response(streamOf([`data: ${JSON.stringify({ error: { type: "status_exception", reason: "rate limited" } })}\n\n`]), { status: 200 });
  const model = new ElasticInferenceAnalystModel({ client: new ElasticRestClient({ config: CONFIG, fetch }), inferenceId: "x" });
  await assert.rejects(
    model.callTool({ system: "", user: "", tool: { name: "t", description: "", parameters: {} } }),
    /rate limited/,
  );
});

test("CUM search: accent-folded fuzzy match on active CUMs, candidates parsed from hits", async () => {
  let sent: Record<string, any> | undefined;
  const fetch: FetchLike = async (url, init) => {
    assert.equal(url, `${CONFIG.url}/compas-cum-v1/_search`);
    sent = JSON.parse(String(init.body));
    return Response.json({
      hits: {
        hits: [
          { _score: 7.5, _source: { cum: "20062603-28", product: "TENSOFAR", ingredients: [{ name: "LOSARTAN POTASICO", amount: "50", unit: "mg" }], form: "TABLETA" } },
          { _score: 1, _source: { cum: "broken" } },
        ],
      },
    });
  };
  const search = new ElasticCumSearch({ client: new ElasticRestClient({ config: CONFIG, fetch }), index: "compas-cum-v1", semantic: false });
  const candidates = await search.search("  Losartán   50mg ", { limit: 50 });
  assert.deepEqual(candidates.map((candidate) => [candidate.cum, candidate.score]), [["20062603-28", 7.5]]);
  assert.equal(sent!.size, 20, "the limit is capped");
  assert.equal(sent!.query.bool.must[0].multi_match.query, "Losartán 50mg");
  assert.equal(sent!.query.bool.must[0].multi_match.fuzziness, "AUTO");
  assert.deepEqual(sent!.query.bool.filter, [{ term: { active: true } }, { term: { registration_valid: true } }]);
});

test("with an embedding endpoint, search fuses lexical and semantic results by rank", async () => {
  let sent: Record<string, any> | undefined;
  const fetch: FetchLike = async (_url, init) => {
    sent = JSON.parse(String(init.body));
    return Response.json({ hits: { hits: [] } });
  };
  await new ElasticCumSearch({ client: new ElasticRestClient({ config: CONFIG, fetch }), index: "i", semantic: true }).search("losartan");
  assert.equal(sent!.retriever.rrf.retrievers.length, 2);
  assert.ok(cumIndexDefinition({ embeddingInferenceId: "e5" }).mappings.properties.semantic);
  assert.equal("semantic" in cumIndexDefinition().mappings.properties, false);
});

test("a CUM document carries per-ingredient strengths and no merchant data", () => {
  const document = cumDocument(
    {
      cum: "19964725-4",
      product: "HYZAAR",
      ingredients: [{ name: "HIDROCLOROTIAZIDA", amount: "12.5", unit: "mg" }, { name: "LOSARTAN POTASICO", amount: "100", unit: "mg" }],
      form: "TABLETA RECUBIERTA",
      presentationUnits: 5,
      active: true,
      registrationValid: true,
    },
    { semantic: false },
  );
  assert.deepEqual(document.ingredient_text, ["HIDROCLOROTIAZIDA 12.5 mg", "LOSARTAN POTASICO 100 mg"]);
  assert.deepEqual(Object.keys(document).sort(), [
    "active", "cum", "form", "ingredient_text", "ingredients", "presentation_units", "product", "registration_valid",
  ]);
});

test("a bulk request with a failed item throws, and errors never carry the API key", async () => {
  const fetch: FetchLike = async () =>
    Response.json({ errors: true, items: [{ index: { _id: "1", status: 201 } }, { index: { _id: "2", error: { type: "mapper_parsing_exception" } } }] });
  const client = new ElasticRestClient({ config: CONFIG, fetch });
  await assert.rejects(client.bulk("bulk", [{ index: {} }, {}]), (error: unknown) => {
    assert.ok(error instanceof ElasticError);
    assert.match(error.message, /mapper_parsing_exception/);
    assert.ok(!error.message.includes(CONFIG.apiKey));
    return true;
  });
  const failing: FetchLike = async () => Response.json({ error: { type: "security_exception", reason: "bad key" } }, { status: 401 });
  await assert.rejects(new ElasticRestClient({ config: CONFIG, fetch: failing }).request("op", "GET", "/"), /401 security_exception/);
});

test("unconfigured Elastic leaves placeholders that throw, never a fake", async () => {
  assert.deepEqual(readElasticConfig({}), { configured: false, missing: ["ELASTICSEARCH_URL", "ELASTICSEARCH_API_KEY"] });
  assert.throws(() => readElasticConfig({ ELASTICSEARCH_URL: "http://example.com", ELASTICSEARCH_API_KEY: "k" }), /https/);
  const setup = createElastic({ env: {} });
  await assert.rejects(setup.search.search("losartan"), /not implemented/);
  await assert.rejects(setup.model.callTool({ system: "", user: "", tool: { name: "t", description: "", parameters: {} } }), /not implemented/);
  assert.deepEqual(createElastic({ env: { ELASTICSEARCH_URL: "https://x.example", ELASTICSEARCH_API_KEY: "k" } }).missing, []);
});

test("an inference failure sent as a stream error event keeps Elastic's message", async () => {
  const fetch: FetchLike = async () =>
    new Response(streamOf(['event: error\ndata: {"error":{"code":"forbidden","message":"status [403]. Error message: [Forbidden]"}}\n\n']), {
      status: 403,
      headers: { "content-type": "text/event-stream" },
    });
  const model = new ElasticInferenceAnalystModel({ client: new ElasticRestClient({ config: CONFIG, fetch }), inferenceId: "x" });
  await assert.rejects(model.callTool({ system: "", user: "", tool: { name: "t", description: "", parameters: {} } }), (error: unknown) => {
    assert.ok(error instanceof ElasticError);
    assert.equal(error.status, 403);
    assert.match(error.message, /\(403\): .*Forbidden/);
    return true;
  });
});

test("without an endpoint id, the model uses the project's Elastic chat_completion endpoint", async () => {
  const urls: string[] = [];
  const fetch: FetchLike = async (url) => {
    urls.push(String(url));
    if (String(url).endsWith("/_all")) {
      return Response.json({ endpoints: [
        { inference_id: "my-openai", service: "openai" },
        { inference_id: ".eis-chat", service: "elastic" },
      ] });
    }
    return new Response(streamOf([chunk("t", "{}"), "data: [DONE]\n\n"]));
  };
  const model = new ElasticInferenceAnalystModel({ client: new ElasticRestClient({ config: CONFIG, fetch }) });
  const tool = { name: "t", description: "", parameters: {} };
  await model.callTool({ system: "", user: "", tool });
  await model.callTool({ system: "", user: "", tool });
  assert.deepEqual(urls.map((url) => url.replace(CONFIG.url, "")), [
    "/_inference/chat_completion/_all",
    "/_inference/chat_completion/.eis-chat/_stream",
    "/_inference/chat_completion/.eis-chat/_stream",
  ]);

  const none: FetchLike = async () => Response.json({ endpoints: [] });
  const empty = new ElasticInferenceAnalystModel({ client: new ElasticRestClient({ config: CONFIG, fetch: none }) });
  await assert.rejects(empty.callTool({ system: "", user: "", tool }), { name: "NotImplementedError" });
});
