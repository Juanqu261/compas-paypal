# ADR 0008: PayPal is the payment rail, and the payer approves every order

## Status

Accepted on 2026-10-26. It replaces the Open Payments rail of ADR 0001 to ADR 0007, and it closes the open cap decision in `AGENTS.md`.

## Context

This fork builds COMPAS for PayPal. The PayPal sandbox replaces Open Payments entirely: the rail, the test wallets and the smoke tests. The concept is in `Compas for PayPal idea definition.md`, outside the repository.

On Open Payments, Pedro consented once at his wallet to an outgoing-payment grant with `limits.debitAmount`. The wallet itself capped every debit at the budget, and COMPAS spent the grant only after `ALLOW`. PayPal has no equivalent of that cap. A saved PayPal payment method (Vault) lets a merchant charge the payer without the payer present, up to no limit PayPal enforces for COMPAS.

The idea doc settles the cap as a hybrid: charge the vaulted PayPal without Pedro only when every check is green, and send him a PayPal approval for anything else. Its stated fallback is approval for every order if the sandbox refuses Vault.

Checked against the sandbox REST API on 2026-10-26:

- `POST /v3/vault/setup-tokens` with a PayPal payment source answers `403 NOT_AUTHORIZED`. The app's token carries no `vault/payment-tokens` scope.
- An order created by the app can name another merchant as `payee.merchant_id`. PayPal checks that id when the order is created (`PAYEE_ACCOUNT_INVALID`); it does not check `payee.email_address`.
- The same `PayPal-Request-Id` returns the same order. A capture before the payer approved answers `422 ORDER_NOT_APPROVED`.
- Legacy billing-agreement tokens can be created, but charging one needs reference transactions and a buyer approval, and was not verified.

## Decision

- **PayPal is the only rail.** `PayPalGateway` (`backend/src/ports/paypal-gateway.ts`) replaces `OpenPaymentsGateway`. The REST adapter in `backend/src/integrations/paypal/` is the only code that talks to PayPal, over `fetch`. It runs on the sandbox only: `PAYPAL_ENVIRONMENT` accepts nothing else.
- **Per-order approval, the idea doc's fallback.** On `ALLOW`, COMPAS creates one PayPal order for exactly that cart, payable to the merchant (`payee.merchant_id`). Pedro approves it at PayPal, logged in to his own account, so PayPal shows him the amount and the merchant. COMPAS captures it only afterwards. No vault, no billing agreement and no standing permission to charge Pedro exist anywhere.
- **Authorizing a budget asks nothing of PayPal.** Pedro confirms the mandate in COMPAS and it becomes `ACTIVE`. `PENDING_AUTHORIZATION` is gone: nothing waits for a provider.
- **The cap is COMPAS's.** The budget and `maxDebitBelowHigh` are checked against the order amount before PayPal is called, and an `ALLOW` reserves that amount atomically. PayPal does not cap anything for COMPAS. Pedro's approval of every order is what bounds a COMPAS bug.
- **Capture re-checks.** `PayPalOrderSettlement` (`backend/src/application/settle-paypal-order.ts`) is the only caller of `captureOrder`. It captures only an order PayPal reports `APPROVED`, whose payee, amount and `custom_id` match the record, under a mandate that is still `ACTIVE` and in its window, and, when `DEMO_PAYER_PAYPAL_ID` is set, approved by that account. Anything else closes the purchase unpaid and gives the capacity back.
- **`DENY` and `REVIEW` never create an order.** The idea doc's line "any REVIEW sends Pedro a PayPal approval" is not built: it would contradict this invariant and demo beat 4. The payer exception approval stays on the "Next" list.
- **A merchant is a PayPal merchant id** (`^[2-9A-HJ-NP-Z]{13}$`) in the trust log, the observation log and the spending log, where it was a wallet address URL.
- **Opaque references only.** The order carries `reference_id` = mandate id, `custom_id` = decision id and `invoice_id` = intent id. Lines are named "Item 1", "Item 2". PayPal never receives a product name.

## Consequences

- Every purchase needs Pedro at PayPal before the pharmacy is paid. The demo shows that step in the simulated PayPal app ("Aprobar en PayPal"); the approval opens in a new tab so the shared demo state survives.
- An unapproved order holds its reservation until Pedro cancels it, PayPal expires it, or the next activity read reconciles it.
- When PayPal enables Vault for the app, a payer-absent charge for all-green purchases can be added beside the approval path. All-green would also need the errand check of the idea doc, which is not built.
- `PROVIDER_VERIFIED` evidence still comes from a simulated wallet KYB source (`wallet-kyb-sim/*`). PayPal signs no category attestations, so on a real PayPal deployment that tier is empty and `HIGH` needs the Cámara binding the idea doc describes. That binding is not built.
- PayPal converts the payer's funding currency itself. COMPAS orders in the budget's currency and does not convert: a budget in a currency PayPal doesn't take, such as COP, is refused.
- Refunds and disputes are not handled. There are no webhooks yet.
