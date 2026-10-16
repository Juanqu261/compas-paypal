# Open Payments gateway tests

Critical requirement:

A denied COMPAS transaction must never invoke `OpenPaymentsGateway.createOutgoingPayment()`.

The same rule applies to `REVIEW`. Only `ALLOW` may reach the gateway.

`backend/tests/policy/outgoing-payment-gate.test.ts` locks that gate with a test double. The double is not an Open Payments response.

`denied-payment-never-reaches-open-payments.test.ts` drives `createOutgoingPaymentIfAllowed` with the real `InterledgerOpenPaymentsGateway` over an SDK test double. With an active payer grant, `DENY` and `REVIEW` still make no `outgoingPayment.create` call. When the orchestrator exists, extend it to drive a denied purchase intent end to end. Do not stub a successful payment in the running backend to make a test pass. `UnimplementedOpenPaymentsGateway` keeps throwing when the client env is missing.
