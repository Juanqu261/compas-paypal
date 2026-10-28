import Anthropic from "@anthropic-ai/sdk";
import type { FetchLike } from "../../lib/fetch-like.ts";
import { type AnalystModel, AnalystModelError, type AnalystTool } from "../../ports/analyst-model.ts";
import { elapsed, errorLabel, logger } from "../../lib/log.ts";

const log = logger("claude");

export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 16_000;

/** JSON Schema keywords structured outputs don't accept. The caller's parser enforces them instead. */
const UNSUPPORTED_KEYWORDS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems",
]);

/**
 * The analyst's model through the Claude API, Claude Haiku 5.5 by default
 */
export class ClaudeAnalystModel implements AnalystModel {
  readonly #client: Anthropic;
  readonly #model: string;

  constructor(deps: { apiKey: string; model?: string; fetch?: FetchLike; maxRetries?: number }) {
    this.#client = new Anthropic({
      apiKey: deps.apiKey,
      ...(deps.fetch ? { fetch: (url, init) => deps.fetch!(String(url), init ?? {}) } : {}),
      ...(deps.maxRetries !== undefined ? { maxRetries: deps.maxRetries } : {}),
    });
    this.#model = deps.model ?? DEFAULT_CLAUDE_MODEL;
  }

  async callTool(input: { system: string; user: string; tool: AnalystTool }): Promise<unknown> {
    const start = performance.now();
    const response = await this.#client.messages.create({
      model: this.#model,
      max_tokens: MAX_TOKENS,
      system: [
        input.system,
        `Calling ${input.tool.name} means answering with one JSON object: its arguments. ${input.tool.description}`,
      ].join("\n"),
      messages: [{ role: "user", content: input.user }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: outputSchema(input.tool.parameters) } },
    }).catch((error: unknown) => {
      log.error(`${input.tool.name} failed`, { model: this.#model, error: errorLabel(error), ms: elapsed(start) });
      throw error;
    });
    log.info(input.tool.name, {
      model: this.#model,
      stop: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ms: elapsed(start),
    });

    if (response.stop_reason === "refusal") throw new AnalystModelError("Claude declined to answer.");
    if (response.stop_reason === "max_tokens") throw new AnalystModelError("Claude's answer was cut off at the token limit.");
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new AnalystModelError("Claude's answer is not JSON.", { cause: error });
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new AnalystModelError("Claude's answer is not a JSON object.");
    }
    return parsed;
  }
}

/** The tool's schema in the form structured outputs accept: no numeric or length bounds, unions as anyOf. */
export function outputSchema(schema: unknown): Record<string, unknown> {
  return clean(schema) as Record<string, unknown>;
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "properties" && typeof value === "object" && value !== null) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, property]) => [name, clean(property)]));
    } else {
      out[key] = clean(value);
    }
  }
  if (Array.isArray(out.type)) {
    const { type, ...rest } = out;
    return { ...rest, anyOf: (type as unknown[]).map((member) => ({ type: member })) };
  }
  return out;
}
