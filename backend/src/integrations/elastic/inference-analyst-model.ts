import { NotImplementedError } from "../../lib/not-implemented.ts";
import { type AnalystModel, AnalystModelError, type AnalystTool } from "../../ports/analyst-model.ts";
import type { ElasticRestClient } from "./rest-client.ts";

const MAX_COMPLETION_TOKENS = 4096;

type ToolCallDelta = { index?: number; function?: { name?: string; arguments?: string } };
type Chunk = {
  choices?: { delta?: { tool_calls?: ToolCallDelta[] } }[];
  error?: { type?: string; reason?: string; message?: string };
};

/**
 * The analyst's model through Elastic's Inference API: a `chat_completion`
 * endpoint (the Elastic Inference Service or a connected provider). That
 * task streams only, so the tool call arrives as argument fragments, which
 * are joined here. Whatever model sits behind the endpoint, its output is
 * checked by the caller before anything is stored.
 *
 * Without an endpoint id, the first call asks the project for its
 * `chat_completion` endpoints and uses the Elastic Inference Service's one
 * (or the only one). None found: it throws, as an unconfigured model does.
 */
export class ElasticInferenceAnalystModel implements AnalystModel {
  readonly #client: Pick<ElasticRestClient, "stream" | "request">;
  #inferenceId: Promise<string> | undefined;

  constructor(deps: { client: Pick<ElasticRestClient, "stream" | "request">; inferenceId?: string }) {
    this.#client = deps.client;
    this.#inferenceId = deps.inferenceId ? Promise.resolve(deps.inferenceId) : undefined;
  }

  #endpoint(): Promise<string> {
    this.#inferenceId ??= discoverChatCompletionEndpoint(this.#client).catch((error: unknown) => {
      this.#inferenceId = undefined;
      throw error;
    });
    return this.#inferenceId;
  }

  async callTool(input: { system: string; user: string; tool: AnalystTool }): Promise<unknown> {
    const inferenceId = await this.#endpoint();
    const body = {
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      tools: [{
        type: "function",
        function: { name: input.tool.name, description: input.tool.description, parameters: input.tool.parameters },
      }],
      tool_choice: { type: "function", function: { name: input.tool.name } },
      temperature: 0,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
    };

    const calls = new Map<number, { name: string; arguments: string }>();
    const path = `/_inference/chat_completion/${encodeURIComponent(inferenceId)}/_stream`;
    for await (const data of this.#client.stream("Analyst inference", path, body)) {
      let chunk: Chunk;
      try {
        chunk = JSON.parse(data) as Chunk;
      } catch {
        throw new AnalystModelError("The inference stream sent an event that is not JSON.");
      }
      if (chunk.error) {
        throw new AnalystModelError(
          `The inference endpoint failed: ${chunk.error.type ?? ""} ${chunk.error.reason ?? chunk.error.message ?? ""}`.trim(),
        );
      }
      for (const choice of chunk.choices ?? []) {
        for (const delta of choice.delta?.tool_calls ?? []) {
          const index = delta.index ?? 0;
          const call = calls.get(index) ?? { name: "", arguments: "" };
          call.name += delta.function?.name ?? "";
          call.arguments += delta.function?.arguments ?? "";
          calls.set(index, call);
        }
      }
    }
    return parseToolCall([...calls.values()], input.tool.name);
  }
}

type EndpointList = { endpoints?: { inference_id?: unknown; service?: unknown }[] };

/** The project's `chat_completion` endpoint: the Elastic Inference Service's first, else the only one. */
export async function discoverChatCompletionEndpoint(client: Pick<ElasticRestClient, "request">): Promise<string> {
  const body = (await client.request("List chat_completion endpoints", "GET", "/_inference/chat_completion/_all")) as EndpointList;
  const endpoints = (body.endpoints ?? []).filter(
    (endpoint): endpoint is { inference_id: string; service?: unknown } =>
      typeof endpoint.inference_id === "string" && endpoint.inference_id.length > 0,
  );
  const chosen = endpoints.find((endpoint) => endpoint.service === "elastic") ?? (endpoints.length === 1 ? endpoints[0] : undefined);
  if (!chosen) {
    throw new NotImplementedError(
      endpoints.length === 0
        ? "AnalystModel.callTool (the Elastic project has no chat_completion endpoint; set ELASTIC_ANALYST_INFERENCE_ID)"
        : "AnalystModel.callTool (several chat_completion endpoints; pick one with ELASTIC_ANALYST_INFERENCE_ID)",
    );
  }
  return chosen.inference_id;
}

/** Exactly one call, of the forced tool, with JSON object arguments. */
export function parseToolCall(calls: readonly { name: string; arguments: string }[], toolName: string): unknown {
  if (calls.length !== 1) throw new AnalystModelError(`Expected one tool call, got ${calls.length}.`);
  const [call] = calls;
  if (call.name !== toolName) throw new AnalystModelError(`The model called ${call.name || "nothing"}, not ${toolName}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments);
  } catch (error) {
    throw new AnalystModelError("The tool call's arguments are not JSON.", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AnalystModelError("The tool call's arguments are not a JSON object.");
  }
  return parsed;
}
