/**
 * A multi-turn shopping model that chooses Compas MCP tools. Distinct from
 * AnalystModel (one forced JSON schema call). Implementations must not reach
 * PayPal or AgentShoppingService: callers execute tools over HTTP MCP only.
 */

export type ShoppingAgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ShoppingAgentText = { type: "text"; text: string };
export type ShoppingAgentToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ShoppingAgentToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type ShoppingAgentContent = ShoppingAgentText | ShoppingAgentToolUse | ShoppingAgentToolResult;

export type ShoppingAgentMessage =
  | { role: "user"; content: string | readonly ShoppingAgentContent[] }
  | { role: "assistant"; content: readonly (ShoppingAgentText | ShoppingAgentToolUse)[] };

export type ShoppingAgentTurnInput = {
  system: string;
  messages: readonly ShoppingAgentMessage[];
  tools: readonly ShoppingAgentTool[];
  maxTokens: number;
};

export type ShoppingAgentStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export type ShoppingAgentTurnResult = {
  stopReason: ShoppingAgentStopReason;
  content: readonly (ShoppingAgentText | ShoppingAgentToolUse)[];
  usage: { inputTokens: number; outputTokens: number };
};

export interface ShoppingAgentModel {
  turn(input: ShoppingAgentTurnInput): Promise<ShoppingAgentTurnResult>;
}

export class ShoppingAgentModelError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ShoppingAgentModelError";
  }
}
