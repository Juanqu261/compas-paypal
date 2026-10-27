/**
 * A language model behind the analyst and the errand drafter. One call is one
 * forced tool call: the model must answer by filling the tool's arguments,
 * and nothing else it writes is read. The arguments come back parsed as JSON
 * but unchecked. Every caller validates them before anything is stored.
 *
 * The model never sees a PayPal port, a mandate, a payer or a policy
 * outcome, and nothing it returns is a decision.
 */
export type AnalystTool = {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
};

export interface AnalystModel {
  callTool(input: { system: string; user: string; tool: AnalystTool }): Promise<unknown>;
}

/** The model answered, but not with one well-formed call of the forced tool. */
export class AnalystModelError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AnalystModelError";
  }
}
