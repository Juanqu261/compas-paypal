# Open Payments gateway tests

Critical requirement:

A denied COMPAS transaction must never invoke `OpenPaymentsGateway.createOutgoingPayment()`.

The same rule applies to `REVIEW`. Only `ALLOW` may reach the gateway.

`backend/tests/policy/outgoing-payment-gate.test.ts` locks that gate with a test double. The double is not an Open Payments response.

When a real gateway exists, add an integration test here that drives a denied purchase intent through the application service and asserts `createOutgoingPayment` is not called. `UnimplementedOpenPaymentsGateway` must keep throwing until that real adapter exists. Do not stub a successful payment to make this test pass.
