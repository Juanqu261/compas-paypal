import type { AgentEvent, AgentRun, AgentRunStep, AgentScenario, ErrandView, PolicyOutcome } from "../compas/api/contracts.ts";
import { DEMO_MERCHANTS } from "../compas/demo-identities.ts";

/**
 * How /demo tells what the scripted agent did. Views only: the backend decided
 * every outcome, and the server's own log is what this screen trusts.
 */

export const SCENARIO_INFO: Record<AgentScenario, { title: string; detail: string }> = {
  arc: { title: "The full story", detail: "A fake pharmacy, a sneaky extra product, then the right order" },
  lookalike: { title: "A fake pharmacy", detail: "A hidden message sends the agent to a lookalike shop" },
  "extra-product": { title: "A sneaky extra product", detail: "A hidden message tells the agent to add a second medicine" },
  "extra-boxes": { title: "A sneaky extra box", detail: "A hidden message tells the agent to buy two boxes" },
  "other-errand": { title: "Someone else’s errand", detail: "The agent asks about an errand it was never given" },
};

/** Why Compas stopped something, as a short phrase after "Stopped:" or "Refused:". */
const REASON_PLAIN: Record<string, string> = {
  MANDATE_INACTIVE: "the budget isn’t active",
  MANDATE_EXPIRED: "the budget has expired",
  BUDGET_EXCEEDED: "it’s more than the budget allows",
  PURPOSE_MISMATCH: "that isn’t what this budget buys",
  MERCHANT_NOT_ELIGIBLE: "this shop isn’t registered for this",
  CLASSIFICATION_UNCERTAIN: "a product isn’t verified",
  MERCHANT_EVIDENCE_INSUFFICIENT: "this pharmacy isn’t verified",
  MERCHANT_EVIDENCE_CONFLICT: "this pharmacy is under review",
  MERCHANT_HISTORY_CONTRADICTS: "this pharmacy’s history contradicts it",
  MERCHANT_CONFIDENCE_LIMIT_EXCEEDED: "it’s over the limit for a pharmacy like this",
  DELEGATE_NOT_AUTHORIZED: "that isn’t an errand the agent was given",
  PAYER_MONITORED_EXCEPTION: "allowed under monitoring",
  ERRAND_MISMATCH: "that isn’t what Andrea confirmed",
};

/** A short label for the reason codes the server records. */
const REASON_SHORT: Record<string, string> = {
  MANDATE_INACTIVE: "Budget not active",
  MANDATE_EXPIRED: "Budget expired",
  BUDGET_EXCEEDED: "Over the budget",
  PURPOSE_MISMATCH: "Not what this budget buys",
  MERCHANT_NOT_ELIGIBLE: "Shop not registered for this",
  CLASSIFICATION_UNCERTAIN: "Product not verified",
  MERCHANT_EVIDENCE_INSUFFICIENT: "Pharmacy not verified",
  MERCHANT_EVIDENCE_CONFLICT: "Pharmacy under review",
  MERCHANT_HISTORY_CONTRADICTS: "Pharmacy’s history contradicts it",
  MERCHANT_CONFIDENCE_LIMIT_EXCEEDED: "Over the limit for this pharmacy",
  DELEGATE_NOT_AUTHORIZED: "Not this agent’s errand",
  PAYER_MONITORED_EXCEPTION: "Allowed under monitoring",
  ERRAND_MISMATCH: "Not what Andrea confirmed",
};

export function reasonShort(code: string): string {
  return REASON_SHORT[code] ?? "Held";
}

function reasonPlain(codes: readonly string[]): string {
  return REASON_PLAIN[codes[0] ?? ""] ?? "Compas held it";
}

const TOOL_LABEL: Record<string, string> = {
  search_eligible_merchants: "Looked for pharmacies",
  check_purchase: "Dry run of an order",
  propose_purchase: "Proposed an order",
  get_mandate_status: "Asked what is left",
};

export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? tool;
}

/** What a failure that isn't a decision means, in words. */
const ERROR_PLAIN: Record<string, string> = {
  PAYPAL_NOT_CONFIGURED: "PayPal orders are off on this server.",
  PURCHASES_DISABLED_FOR_DEMO: "Demo purchases are off on this server.",
  SANDBOX_ACCOUNTS_REQUIRED: "Choose the PayPal sandbox accounts in Act 2 first.",
  DEMO_LIMIT_REACHED: "This demo reached its limit. Reset it to start over.",
  PAYEE_ACCOUNT_INVALID: "PayPal doesn’t know the business account this demo pays.",
  UNKNOWN_MERCHANT: "That isn’t a pharmacy Compas pays.",
  UNKNOWN_SKU: "That pharmacy doesn’t sell that product.",
  PAYMENT_NOT_STARTED: "The order didn’t start. Nothing was paid.",
};

export type RpcStep = Extract<AgentRunStep, { kind: "rpc" }>;

export type ToolReading = {
  outcome?: PolicyOutcome;
  reasonCodes: readonly string[];
  /** A tool failure that is not a decision. */
  error?: string;
  /** A PayPal order now waits for the payer. */
  orderCreated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structured(step: RpcStep): Record<string, unknown> {
  const result = isRecord(step.response) && isRecord(step.response.result) ? step.response.result : undefined;
  return isRecord(result?.structuredContent) ? result.structuredContent : {};
}

/** What a tools/call step answered, read from the JSON-RPC response. */
export function readTool(step: RpcStep): ToolReading {
  const data = structured(step);
  const decision = data.outcome ?? data.wouldHappen;
  const outcome = decision === "ALLOW" || decision === "REVIEW" || decision === "DENY" ? decision : undefined;
  const payment = isRecord(data.payment) ? data.payment : undefined;
  return {
    ...(outcome ? { outcome } : {}),
    reasonCodes: Array.isArray(data.reasonCodes) ? data.reasonCodes.filter((code): code is string => typeof code === "string") : [],
    ...(!outcome && typeof data.error === "string" ? { error: data.error } : {}),
    orderCreated: step.tool === "propose_purchase" && payment?.status === "ORDER_CREATED",
  };
}

function args(step: RpcStep): Record<string, unknown> {
  const params = isRecord(step.request) && isRecord(step.request.params) ? step.request.params : undefined;
  return isRecord(params?.arguments) ? params.arguments : {};
}

/** A tool call in one line, without the cart: the shop and how many products. */
export function toolCallSummary(step: RpcStep): string {
  const given = args(step);
  const parts: string[] = [];
  if (typeof given.merchantId === "string") parts.push(given.merchantId);
  if (Array.isArray(given.items)) parts.push(`${given.items.length} ${given.items.length === 1 ? "product" : "products"}`);
  return parts.join(" · ");
}

function shopName(id: unknown): string {
  const known = Object.values(DEMO_MERCHANTS).find((merchant) => merchant.id === id);
  return known?.displayName ?? (typeof id === "string" ? id : "a shop");
}

export type Moment = {
  n: number;
  actor: "Andrea" | "Agent" | "Compas" | "Web page";
  text: string;
  /** What a planted web page said. */
  quote?: string;
  result?: { tone: "ok" | "stopped" | "info" | "waiting"; text: string; sub?: string };
};

function toolMoment(step: RpcStep): Moment | undefined {
  const reading = readTool(step);
  const given = args(step);
  const products = Array.isArray(given.items) ? given.items.length : 0;
  const count = `${products} ${products === 1 ? "product" : "products"}`;

  let result: Moment["result"];
  if (reading.error) {
    result = { tone: "info", text: "Compas couldn’t decide", sub: ERROR_PLAIN[reading.error] ?? reading.error };
  } else if (step.tool === "search_eligible_merchants") {
    const merchants = structured(step).merchants;
    const names = Array.isArray(merchants)
      ? merchants.flatMap((merchant) => (isRecord(merchant) && typeof merchant.displayName === "string" ? [merchant.displayName] : []))
      : [];
    result =
      names.length > 0
        ? { tone: "ok", text: `Compas offers ${names.join(", ")}`, sub: "Only pharmacies it has already checked." }
        : { tone: "info", text: "Compas offers no pharmacy", sub: "None has been checked for this medicine yet. Act 1 does that." };
  } else if (reading.orderCreated) {
    result = { tone: "ok", text: "Compas creates a PayPal order", sub: "Pedro still has to approve it in PayPal." };
  } else if (reading.outcome === "ALLOW") {
    result = { tone: "ok", text: "It would pass every check" };
  } else if (reading.outcome === "REVIEW") {
    result = { tone: "stopped", text: `Stopped: ${reasonPlain(reading.reasonCodes)}`, sub: "No order was created." };
  } else if (reading.outcome === "DENY") {
    result = {
      tone: "stopped",
      text: `Refused: ${reasonPlain(reading.reasonCodes)}`,
      sub: step.tool === "get_mandate_status" ? "Compas won’t even say whether that errand exists." : "No order was created.",
    };
  }

  const text =
    step.tool === "search_eligible_merchants"
      ? "asks Compas which pharmacies it will pay for this errand"
      : step.tool === "propose_purchase"
        ? `tries to order at ${shopName(given.merchantId)} (${count})`
        : step.tool === "check_purchase"
          ? `does a dry run at ${shopName(given.merchantId)} (${count})`
          : step.tool === "get_mandate_status"
            ? "asks about an errand"
            : undefined;
  return text ? { n: step.n, actor: "Agent", text, ...(result ? { result } : {}) } : undefined;
}

/**
 * The run in plain words: who did what, and what Compas said. The handshake
 * (discovery, registration, tokens, initialize) is left to the technical view.
 */
export function storyOf(run: Pick<AgentRun, "steps" | "status" | "error">): Moment[] {
  const moments: Moment[] = [];
  let turnedAway = false;
  for (const step of run.steps) {
    switch (step.kind) {
      case "task":
        moments.push({ n: step.n, actor: "Andrea", text: "asks the agent", quote: step.text });
        break;
      case "http":
        if (!turnedAway && step.status === 401) {
          turnedAway = true;
          moments.push({
            n: step.n,
            actor: "Agent",
            text: "connects to Compas",
            result: { tone: "info", text: "Compas turns it away", sub: "It has no permission yet." },
          });
        }
        break;
      case "consent":
        moments.push(
          step.state === "WAITING"
            ? { n: step.n, actor: "Agent", text: "asks Andrea for access", result: { tone: "waiting", text: "Waiting for Andrea to answer" } }
            : step.state === "APPROVED"
              ? { n: step.n, actor: "Andrea", text: "allows it", result: { tone: "ok", text: "Access for this errand only", sub: "The agent can propose orders. It can’t pay." } }
              : { n: step.n, actor: "Andrea", text: "says no", result: { tone: "stopped", text: "The agent gets nothing" } },
        );
        break;
      case "page":
        moments.push({ n: step.n, actor: "Web page", text: "has a hidden instruction for the agent", quote: step.text });
        break;
      case "rpc": {
        const moment = step.tool ? toolMoment(step) : undefined;
        if (moment) moments.push(moment);
        break;
      }
      case "say":
        break;
    }
  }
  if (run.status === "FAILED") {
    moments.push({
      n: (run.steps.at(-1)?.n ?? 0) + 1,
      actor: "Compas",
      text: "The demo agent couldn’t finish",
      result: { tone: "info", text: run.error ?? "Error" },
    });
  }
  // A consent that was answered no longer waits.
  return moments.filter(
    (moment, index) => !(moment.result?.tone === "waiting" && moments.slice(index + 1).some((later) => later.actor === "Andrea")),
  );
}

export function isActive(run: Pick<AgentRun, "status"> | undefined): boolean {
  return run?.status === "STARTING" || run?.status === "AWAITING_CONSENT" || run?.status === "RUNNING";
}

/** Whether the run made a PayPal order that waits for the payer. */
export function orderWaiting(run: Pick<AgentRun, "steps"> | undefined): boolean {
  return Boolean(run?.steps.some((step) => step.kind === "rpc" && step.tool === "propose_purchase" && readTool(step).orderCreated));
}

/** The decision behind the order the agent's propose made, to find it in the budget's activity. */
export function orderDecisionId(run: Pick<AgentRun, "steps"> | undefined): string | undefined {
  const step = run?.steps.find((item): item is RpcStep => item.kind === "rpc" && item.tool === "propose_purchase" && readTool(item).orderCreated);
  const id = step ? structured(step).decisionId : undefined;
  return typeof id === "string" ? id : undefined;
}

export function tallies(events: readonly AgentEvent[]): { calls: number; held: number; orders: number } {
  return {
    calls: events.length,
    held: events.filter((event) => event.outcome === "REVIEW" || event.outcome === "DENY").length,
    orders: events.filter((event) => event.tool === "propose_purchase" && event.outcome === "ALLOW").length,
  };
}

/** The delegate's errand the agent can be run against: open, with units left. */
export function openErrand(errands: readonly ErrandView[]): ErrandView | undefined {
  return errands.find((errand) => errand.displayStatus === "ACTIVE");
}

/** An amount as "11.20 USD". */
export function formatMoney(amount: { value: string; assetCode: string; assetScale: number }): string {
  const scale = amount.assetScale;
  // Minor units are a digit string, so no number type can lose precision.
  const negative = amount.value.startsWith("-");
  const digits = (negative ? amount.value.slice(1) : amount.value).replace(/^0+(?=\d)/, "").padStart(scale + 1, "0");
  const whole = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return `${negative ? "-" : ""}${whole} ${amount.assetCode}`;
}
