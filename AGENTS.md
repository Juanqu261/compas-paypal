# COMPAS agent instructions

These invariants apply to every coding agent working in this repository.

## Product

- COMPAS is a non-custodial authorization and policy layer. It moves permission, not money.
- Do not invent an acronym for COMPAS.
- Do not model delegated capacity as funds transferred to the delegate. `remainingAuthorizedAmount` is authorization capacity, not a wallet balance.
- COMPAS is not a bank, wallet, payment rail, custodian, token, or blockchain project.
- ARQ, Nequi, and Nequi Negocios in this repo are simulated embedding surfaces. Do not claim a production integration with them, Daviplata, Bre-B, or ACH.
- Reuse the Mandate primitive for a person, a business, an NGO, or a government allocation. Do not create a separate product for each.
- The MVP path is Pedro's medication mandate, Andrea's pharmacy purchase, and the alcohol rejection. Do not expand the MVP UI into enterprise or government flows.

## Open Payments and policy

- Purpose restrictions belong to COMPAS. Open Payments uses grants, actions, and limits. `MEDICATION` is not an Open Payments scope.
- Keep the Interledger SDK behind `OpenPaymentsGateway`.
- Never fake a successful Open Payments call. An unimplemented method throws. A demo fixture is labeled `demo/test data`.
- Do not hardcode an exchange rate and present it as a live quote.
- Policy evaluation returns `ALLOW` before any outgoing payment. `DENY` and `REVIEW` must not call `createOutgoingPayment`.
- AI may classify a category. AI must not authorize a transaction or call the gateway.
- Low-confidence classification fails closed.
- Do not put health data or other sensitive personal data in Open Payments metadata. Opaque ids only: `compasMandateId`, `compasDecisionId`, `externalReference`.

## Repository

- One Next.js application. No monorepo. No extra library without a concrete need.
- Do not introduce a database, authentication, blockchain, or a second app unless a task explicitly asks for it.
- Any new AI coding prompt is copied verbatim into `prompts/`.
- Update `AI_USAGE.md` when an AI tool's role changes materially.
- Do not claim that a file is human-written unless that has been explicitly verified.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
