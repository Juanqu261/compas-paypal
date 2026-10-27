import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeAnalystModel, DEFAULT_CLAUDE_MODEL, outputSchema } from "../../../src/integrations/anthropic/claude-analyst-model.ts";
import { createAnalystModel } from "../../../src/integrations/analyst/create-analyst-layer.ts";
import { createElastic } from "../../../src/integrations/elastic/create-elastic.ts";
import type { FetchLike } from "../../../src/lib/fetch-like.ts";

const TOOL = {
  name: "draft_errand",
  description: "Turn the request into medicines.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["items", "note"],
    properties: {
      items: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["searchText", "quantity"],
          properties: {
            searchText: { type: "string", minLength: 1 },
            quantity: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
      note: { type: ["string", "null"], description: "Optional." },
    },
  },
};

function message(content: unknown[], stopReason = "end_turn") {
  return Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_CLAUDE_MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}

function recording(response: () => Response) {
  const sent: { url: string; headers: Headers; body: Record<string, any> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    sent.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return response();
  };
  return { sent, model: new ClaudeAnalystModel({ apiKey: "sk-ant-test", fetch, maxRetries: 0 }) };
}

test("the tool's schema becomes a structured output, and the answer is its arguments", async () => {
  const { sent, model } = recording(() =>
    message([
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: '{"items":[{"searchText":"losartán 50 mg tabletas","quantity":1}],"note":null}' },
    ]),
  );
  const result = await model.callTool({ system: "You help.", user: "<data>la losartán</data>", tool: TOOL });
  assert.deepEqual(result, { items: [{ searchText: "losartán 50 mg tabletas", quantity: 1 }], note: null });

  const [request] = sent;
  assert.match(request.url, /\/v1\/messages/);
  assert.match(request.headers.get("x-api-key") ?? request.headers.get("authorization") ?? "", /sk-ant-test/);
  assert.equal(request.body.model, "claude-haiku-5-5");
  assert.equal(request.body.tools, undefined, "a structured output, not a forced tool call");
  assert.equal(request.body.output_config.effort, "medium");
  assert.equal(request.body.output_config.format.type, "json_schema");
  assert.match(request.body.system, /You help\.\nCalling draft_errand means answering with one JSON object/);
});

test("bounds structured outputs don't accept are dropped, and type unions become anyOf", () => {
  const schema = outputSchema(TOOL.parameters) as Record<string, any>;
  const items = schema.properties.items;
  assert.equal(items.maxItems, undefined);
  assert.deepEqual(items.items.properties.quantity, { type: "integer" });
  assert.deepEqual(items.items.properties.searchText, { type: "string" });
  assert.deepEqual(schema.properties.note, { description: "Optional.", anyOf: [{ type: "string" }, { type: "null" }] });
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["items", "note"]);
  assert.equal(TOOL.parameters.properties.items.maxItems, 5, "the caller's schema is not changed");
});

test("a refusal, a cut-off answer or one that isn't a JSON object fails closed", async () => {
  const cases: [() => Response, RegExp][] = [
    [() => message([{ type: "text", text: "" }], "refusal"), /declined/],
    [() => message([{ type: "text", text: '{"items":[' }], "max_tokens"), /cut off/],
    [() => message([{ type: "text", text: "Sure! Here it is." }]), /not JSON/],
    [() => message([{ type: "text", text: "[1,2]" }]), /not a JSON object/],
  ];
  for (const [response, expected] of cases) {
    const { model } = recording(response);
    await assert.rejects(model.callTool({ system: "", user: "", tool: TOOL }), (error: unknown) => {
      assert.equal((error as Error).name, "AnalystModelError");
      assert.match((error as Error).message, expected);
      return true;
    });
  }
});

test("an API error never carries the key", async () => {
  const { model } = recording(() =>
    Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 }),
  );
  await assert.rejects(model.callTool({ system: "", user: "", tool: TOOL }), (error: unknown) => {
    assert.ok(!String((error as Error).message).includes("sk-ant-test"));
    return true;
  });
});

test("with ANTHROPIC_API_KEY the analyst uses Claude, without it Elastic's model", () => {
  const elastic = createElastic({ env: {} });
  assert.equal(createAnalystModel({}, elastic).vendor, "elastic");
  const claude = createAnalystModel({ ANTHROPIC_API_KEY: "sk-ant-test" }, elastic);
  assert.equal(claude.vendor, "claude");
  assert.ok(claude.model instanceof ClaudeAnalystModel);
});
