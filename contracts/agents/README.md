# Agent contracts

Any MCP client can shop for a delegate through Compas, bound to the errands the delegate picked ([ADR 0011](../../docs/adr/0011-agents-mcp.md)). The code is in `backend/src/api/oauth.ts` and `backend/src/api/mcp.ts`. The agent has no PayPal tool.

## For the MCP client

| Route | What |
| --- | --- |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728 metadata: the resource and its authorization server |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata. PKCE `S256`, public clients (`none`) |
| `POST /oauth/register` | RFC 7591. `{ client_name, redirect_uris[] }`. https, or http on localhost |
| `GET /oauth/authorize` | `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state`, `resource`. Redirects to the consent screen |
| `POST /oauth/token` | Form-encoded. `authorization_code` (with `code_verifier`) or `refresh_token` (rotating) |
| `POST /oauth/revoke` | RFC 7009. Revoking a token ends its grant |
| `POST /mcp` | JSON-RPC. `Authorization: Bearer cmp_at_…`. `401` carries `WWW-Authenticate: Bearer resource_metadata=…` |

`resource` must be the `/mcp` URL (`COMPAS_PUBLIC_URL` + `/mcp`). A replayed code or a reused refresh token revokes the grant.

### Tools

Every tool takes an `errandId` the delegate gave this agent. Any other errand, unknown or someone else's, answers `DENY` `DELEGATE_NOT_AUTHORIZED` with `recorded: false`.

| Tool | Input | Returns |
| --- | --- | --- |
| `search_eligible_merchants` | `{ errandId }` | `merchants[]`: `merchantId`, `displayName`, `confidence`, `offers[]` (`skuId`, `forErrandItem`, `product`, `unitPrice`). Only shops that already meet the mandate's minimum confidence |
| `check_purchase` | `{ errandId, merchantId, items: [{ skuId, quantity? }] }` | `wouldHappen` (`ALLOW`, `REVIEW`, `DENY`), `reasonCodes`, `explanation`. Orders nothing |
| `propose_purchase` | the same, plus optional `idempotencyKey` | `outcome`, `reasonCodes`, `explanation`, `payment` (`ORDER_CREATED` waiting for the payer, or `NOT_CREATED`), `replayed`, `nextStep` |
| `get_mandate_status` | `{ errandId }` | the errand's allowed and held units and amount, and the budget's remaining capacity |

The agent sends no amount and no category. Compas reads the price from the shop's catalog and the category from the SKU's verified CUM. Tool failures that are not decisions (`INVALID_INPUT`, `UNKNOWN_MERCHANT`, `UNKNOWN_SKU`, `NO_PRICE`, `PAYMENT_NOT_STARTED`, `PAYPAL_NOT_CONFIGURED`) come back with `isError: true` and an `error` code.

## For the consent screen (a demo session token)

The browser lands on `COMPAS_AGENT_CONSENT_URL?request=areq-…`. The frontend, with the delegate's session, calls:

| Route | What |
| --- | --- |
| `GET /agents/requests/:id` | `{ requestId, client: { name, redirectHost }, errands[], expiresAt }`: the delegate's own open errands. `client.name` is chosen by the client: render it as text |
| `POST /agents/requests/:id/approve` | `{ errandIds: ["errand-…"] }` (1 to 10). Returns `{ redirectTo }`: send the browser there |
| `POST /agents/requests/:id/deny` | Returns `{ redirectTo }` with `error=access_denied` |
| `GET /agents/grants` | The agents acting for the actor, or on a mandate they pay for: `id`, `client.name`, `errandIds`, `status`, `viewerRole` |
| `POST /agents/grants/:id/revoke` | The delegate, or a payer of one of the grant's mandates |

Errors: `404 unknown_request` (expired, answered or unknown), `400 invalid_errands` (one is not an open errand of the actor's; the answer is the same for unknown, someone else's and cancelled), `404 unknown_grant`.
