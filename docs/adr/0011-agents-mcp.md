# ADR 0011: Any AI agent shops through the Compas MCP server, bound to an errand

## Status

Accepted on 2026-10-28. Builds on [ADR 0010](0010-errands.md) (errands) and [ADR 0008](0008-paypal-rail-per-order-approval.md) (the PayPal rail). From the idea doc `Compas for PayPal idea definition.md`, section 2, decisions 6, 7 and 11.

## Context

PayPal and Google are building agent-driven checkout (AP2, Agent Toolkit). What an agent that pays lacks is a leash the account holder controls: who may spend, for whom, and for what, with a refusal before an order exists. Compas already has the pieces: the mandate, the trust matrix, the analyst's verified CUM mappings and errands. An agent needs a way in that gives it none of the power.

## Decision

- **Compas ships an MCP server, not a shopping agent.** `POST /mcp` (Streamable HTTP, stateless, JSON responses) with four tools: `search_eligible_merchants`, `check_purchase`, `propose_purchase`, `get_mandate_status`. Any MCP client can use it. A tool set with no PayPal tool is the point: the agent cannot pay, approve, confirm or read a payer's account.
- **The agent is a sub-delegate.** An `AgentGrant` ties one registered MCP client to one human delegate and a fixed list of errand ids that delegate picked at consent. Purchases run as that delegate, through the same `DelegatePurchaseService` as a delegate's own, so the mandate rules, the trust matrix, the errand check, the budget and the per-order PayPal approval all apply unchanged.
- **Errand-scoped OAuth 2.1, the MCP authorization flow.**
  - Discovery by protected-resource metadata (RFC 9728) and authorization-server metadata (RFC 8414); `401` carries `WWW-Authenticate: Bearer resource_metadata=…`.
  - Dynamic client registration (RFC 7591), public clients only. Redirect URIs are https, or http on the loopback interface (any port, RFC 8252).
  - Authorization code with PKCE **S256 only**. Tokens are audience-bound to `/mcp` (RFC 8707 `resource`).
  - **Consent is the delegate's, in Compas.** `GET /oauth/authorize` sends the browser to the frontend consent screen; the delegate, logged in to Compas, picks errands (1 to 10, their own, open) and approves or refuses. The grant covers exactly those. A new errand needs a new grant.
  - Access tokens last an hour. Refresh tokens rotate; reusing one, or replaying an authorization code, revokes the whole grant (OAuth 2.1). A grant never outlives its errands.
  - Tokens are opaque (`cmp_at_…`, `cmp_rt_…`), stored as SHA-256. An agent token opens `/mcp` and nothing else: it matches no REST route, and a delegate session opens no MCP tool.
  - The delegate, or a payer of one of the grant's mandates, revokes at any time (`POST /agents/grants/:id/revoke`). The payer can see which agents act on their mandates.
- **The agent names SKUs and quantities. Compas supplies the rest.** Amounts are the catalog price times quantity, read server-side. Categories are never taken from the agent: a SKU with a verified CUM is `MEDICATION`, anything else has none. An injected instruction therefore cannot inflate a price or relabel a gift card, and the REST fields for category and amount are not in the tool schemas.
- **Registry-first search.** `search_eligible_merchants` lists a shop only if it already passes the mandate's merchant step (the same function the purchase uses) and lists a priced SKU whose verified CUM the errand accepts. A shop that is unvetted, flagged or unbound is not offered, and is not named. A cart sent there anyway gets `REVIEW`.
- **Nothing a merchant wrote reaches the agent.** Search returns the INVIMA product name from the CUM record, the SKU id, the price and Compas's directory name. Explanations are fixed text per reason code. A test plants an instruction in a SKU name and checks every tool's output.
- **One refusal for every errand the agent may not use.** An errand that is unknown, someone else's, or outside the grant gives the same `DENY` `DELEGATE_NOT_AUTHORIZED`, unrecorded, so an agent cannot probe for other people's errands.
- **Retries collapse.** Without an `idempotencyKey`, the key derives from the grant, errand, errand window, shop and cart, so the same cart proposed twice is one attempt. An agent that loops cannot order twice.
- **The agent never confirms a purchase for the shop's history.** Confirmations stay on the payer's authenticated REST route. No tool reaches it, and an agent token matches no REST route.
- **Cap model unchanged.** Per-order approval stays (ADR 0008): an `ALLOW` creates a PayPal order the payer approves. The idea doc's hybrid, a payer-absent charge when every check is green, waits for Vault, as `AGENTS.md` says.

## Alternatives set aside

- **The MCP SDK.** Its server pieces assume Express and its own auth provider. Four tools over JSON-RPC are one file of about 250 lines on `node:http` like the rest of the backend, and the OAuth server is ours either way. If a client needs server-sent events or sessions, revisit.
- **The agent supplies amounts and categories, like the REST API.** Simpler to wire, but each is a field an injected agent can lie in. Reading both server-side costs only that a priced catalog is required.
- **One grant for "all of the delegate's errands".** Convenient, but a leaked token would reach errands the delegate never thought of. Explicit errand ids make the consent screen the whole authority.
- **Passing the delegate's session to the agent.** Rejected: a session opens mandate, errand and confirmation routes.
- **HTTP message signatures** for agent identity (idea F4). Most MCP clients cannot sign yet; roadmap.

## Consequences

- A gift card on the agent path is `REVIEW` (`CLASSIFICATION_UNCERTAIN`, `ERRAND_MISMATCH`), not `DENY PURPOSE_MISMATCH`: with no category from the agent, an unmapped SKU is unknown, and unknown holds. Nothing is ordered either way.
- The agent gets the errand's items and quantities, which are health data (Ley 1581 de 2012). The delegate consents when authorizing the agent, and the consent screen names the client. Compas sends the agent nothing about the payer's PayPal account.
- Compas does not yet queue an analyst job for a shop it has never seen. A shop must be in the directory to be named, so an unknown shop is `UNKNOWN_MERCHANT`.
- Clients, grants and tokens are in memory: a restart asks every agent to authorize again. There is no table for them yet.
- No CORS headers: browser-based MCP clients need a proxy. Origin is checked on `/mcp` (DNS rebinding), with `COMPAS_PUBLIC_URL`'s origin and `COMPAS_MCP_ALLOWED_ORIGINS` allowed.
- No rate limiting. Registration and pending requests are capped (200 and 500), body sizes are bounded, and a tool call is as heavy as a purchase preview.
- The consent screen, the errand screens and a reference agent are not built.

## Addendum, 2026-10-28: the demo's agent and the server's log

Act 3 of `/demo` shows an agent shopping. Two decisions:

- **The agent is a script, and says so.** `DemoAgentRuns` is an MCP client that knows only URLs. It is refused with a 401, discovers the authorization server, registers, waits for the delegate on the consent screen, gets a token with PKCE and calls the tools over JSON-RPC. Its narration is written; its calls are not simulated. COMPAS cannot tell it from Claude. A live model was set aside for the demo: it costs API calls and may decline to be fooled by the planted injection, which would lose the point. The same server accepts a real client, and Act 3 shows the command.
- **The server keeps its own log of each call.** The screen's "What Compas recorded" reads it, not the script's account: tool, errand, shop, decision, reason codes, never a cart. It is also what a payer's "your agent was steered…" summary would read.

Consequences: the run's `propose_purchase` still stops at `PAYPAL_NOT_CONFIGURED` or `PURCHASES_DISABLED_FOR_DEMO` before the policy runs, as it does for a delegate. Act 3's clean cart needs `COMPAS_DEMO_PURCHASES=enabled`, and the analyst's verified mappings from Act 1. The "extra box" script orders two boxes: ten would exceed the USD 40 budget, and the budget, not the errand, would stop it.
