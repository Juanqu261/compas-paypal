/**
 * An AI agent acting for a delegate (ADR 0011). The agent is a sub-delegate:
 * it holds a grant from one human delegate, bound to the errands that
 * delegate picked, and it can propose carts against those errands only. It is
 * never given the delegate's session, a PayPal tool or a way to confirm anything.
 */

/** An MCP client that registered itself (RFC 7591). Public: it holds no secret, so PKCE is mandatory. */
export type AgentClient = {
  id: string;
  /** Shown on the consent screen. The client chose it, so it is untrusted text. */
  name: string;
  redirectUris: readonly string[];
  createdAt: string;
};

/** What the delegate allowed one agent to do. Revoking it stops every token under it. */
export type AgentGrant = {
  id: string;
  clientId: string;
  /** The human whose agent this is. Purchases run as this delegate. */
  delegateId: string;
  /** The only errands the agent may propose carts against. Fixed at consent. */
  errandIds: readonly string[];
  /** The MCP resource the tokens are for (RFC 8707). */
  resource: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

/** An authorization request waiting for the delegate to choose errands (or refuse). */
export type AgentAuthorizationRequest = {
  id: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource: string;
  expiresAt: string;
};

/** Authorization codes and tokens are secrets: only their SHA-256 is stored. */
export const AGENT_TOKEN_KINDS = ["CODE", "ACCESS", "REFRESH"] as const;
export type AgentTokenKind = (typeof AGENT_TOKEN_KINDS)[number];

export type AgentTokenRecord = {
  hash: string;
  kind: AgentTokenKind;
  grantId: string;
  clientId: string;
  expiresAt: string;
  /** CODE and REFRESH are single use. */
  usedAt?: string;
  /** CODE only: what the token request must repeat. */
  redirectUri?: string;
  codeChallenge?: string;
};

/** Who is behind a valid access token. */
export type AgentPrincipal = {
  grant: AgentGrant;
  clientId: string;
  clientName: string;
};

/**
 * What COMPAS recorded about one tool call, on the server, whoever the agent
 * is. It names the errand and the shop, the decision and the reason codes. It
 * never holds items, SKUs, amounts or the agent's own words: those are health
 * data or the agent's, not COMPAS's record.
 */
export type AgentEvent = {
  id: string;
  at: string;
  grantId: string;
  tool: string;
  errandId?: string;
  merchantId?: string;
  /** The decision, for check_purchase (what would happen) and propose_purchase. */
  outcome?: "ALLOW" | "REVIEW" | "DENY";
  reasonCodes: readonly string[];
  /** A tool failure that is not a decision, e.g. UNKNOWN_MERCHANT. */
  error?: string;
};

export const MAX_EVENTS_PER_GRANT = 200;
export const AGENT_SCOPE = "errands";
export const MAX_GRANT_ERRANDS = 10;
