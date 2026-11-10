import Anthropic from "@anthropic-ai/sdk";
import type { FetchLike } from "../../lib/fetch-like.ts";
import { elapsed, errorLabel, logger } from "../../lib/log.ts";
import {
  type ShoppingAgentContent,
  type ShoppingAgentMessage,
  type ShoppingAgentModel,
  ShoppingAgentModelError,
  type ShoppingAgentText,
  type ShoppingAgentToolUse,
  type ShoppingAgentTurnInput,
  type ShoppingAgentTurnResult,
} from "../../ports/shopping-agent-model.ts";
import { DEFAULT_CLAUDE_MODEL } from "./claude-analyst-model.ts";

const log = logger("claude-shop");

/**
 * Claude Messages API with tool use for Act 3's live MCP client. The model
 * only proposes tool names and arguments; Compas executes them over /mcp.
 */
export class ClaudeShoppingAgent implements ShoppingAgentModel {
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

  async turn(input: ShoppingAgentTurnInput): Promise<ShoppingAgentTurnResult> {
    const start = performance.now();
    const response = await this.#client.messages
      .create({
        model: this.#model,
        max_tokens: input.maxTokens,
        system: input.system,
        tools: input.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: input.messages.map(toAnthropicMessage),
      })
      .catch((error: unknown) => {
        log.error("shopping turn failed", { model: this.#model, error: errorLabel(error), ms: elapsed(start) });
        throw error;
      });

    log.info("shopping turn", {
      model: this.#model,
      stop: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ms: elapsed(start),
    });

    const content: (ShoppingAgentText | ShoppingAgentToolUse)[] = [];
    for (const block of response.content) {
      if (block.type === "text") content.push({ type: "text", text: block.text });
      else if (block.type === "tool_use") {
        content.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: isRecord(block.input) ? block.input : {},
        });
      }
    }

    return {
      stopReason: mapStop(response.stop_reason),
      content,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}

function mapStop(reason: string | null): ShoppingAgentTurnResult["stopReason"] {
  if (reason === "end_turn") return "end_turn";
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "max_tokens";
  if (reason === "refusal") return "refusal";
  return "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAnthropicMessage(message: ShoppingAgentMessage): Anthropic.MessageParam {
  if (message.role === "user") {
    if (typeof message.content === "string") return { role: "user", content: message.content };
    return { role: "user", content: message.content.map(toAnthropicBlock) };
  }
  return {
    role: "assistant",
    content: message.content.map((block) =>
      block.type === "text"
        ? { type: "text" as const, text: block.text }
        : { type: "tool_use" as const, id: block.id, name: block.name, input: block.input },
    ),
  };
}

function toAnthropicBlock(block: ShoppingAgentContent): Anthropic.ContentBlockParam {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "tool_use") return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  return {
    type: "tool_result",
    tool_use_id: block.tool_use_id,
    content: block.content,
    ...(block.is_error ? { is_error: true } : {}),
  };
}

/** Builds a Claude shopping agent when ANTHROPIC_API_KEY is set; otherwise undefined. */
export function createShoppingAgentModel(env: {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_ANALYST_MODEL?: string;
  ANTHROPIC_SHOPPING_MODEL?: string;
}, fetch?: FetchLike): ShoppingAgentModel | undefined {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return undefined;
  const model = env.ANTHROPIC_SHOPPING_MODEL?.trim() || env.ANTHROPIC_ANALYST_MODEL?.trim();
  try {
    return new ClaudeShoppingAgent({ apiKey, ...(model ? { model } : {}), ...(fetch ? { fetch } : {}) });
  } catch (error) {
    throw new ShoppingAgentModelError("Could not create the Claude shopping agent.", { cause: error });
  }
}
