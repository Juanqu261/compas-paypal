# Open Payments

Open Payments moves value between wallet addresses. COMPAS decides whether a delegate may cause a payment for a purpose.

Purpose restrictions belong to COMPAS. Grants, access actions, and limits belong to Open Payments. `MEDICATION` is not an Open Payments scope.

Keep the Interledger SDK behind `OpenPaymentsGateway` in `backend/src/ports/open-payments-gateway.ts`. The current adapter throws. Do not replace that throw with a fabricated wallet, grant, quote, or payment.

An outgoing-payment grant can be obtained before the final recipient is known. That is how Pedro can authorize a budget before Andrea chooses a pharmacy. The recipient is the merchant, not the delegate.

Call `createOutgoingPayment` only after policy returns `ALLOW`. `DENY` and `REVIEW` must not call it.

Do not hardcode an exchange rate and present it as a live quote. Cross-currency cost comes from a quote or from a fixture labeled `demo/test data`.

Do not put health data or other sensitive personal data in Open Payments metadata. Opaque references only: `compasMandateId`, `compasDecisionId`, `externalReference`.

Client configuration uses `CLIENT_WALLET_ADDRESS`, `KEY_ID`, and `PRIVATE_KEY_PATH` in `backend/.env.example`.
