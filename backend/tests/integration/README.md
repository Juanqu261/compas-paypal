# PayPal gateway tests

Critical requirement:

A denied COMPAS transaction must never invoke `PayPalGateway.createOrder()`.

The same rule applies to `REVIEW`. Only `ALLOW` may reach the gateway, and an order moves no money by itself: only `PayPalOrderSettlement` captures, after the payer approved at PayPal and the mandate was checked again.

`backend/tests/policy/payment-gate.test.ts` locks that gate with a test double. The double is not a PayPal response.

`denied-payment-never-reaches-paypal.test.ts` drives `createPayPalOrderIfAllowed` with the real `PayPalRestGateway` over a fetch-level double of the PayPal REST API (`tests/integrations/paypal/fake-paypal-api.ts`). `DENY` and `REVIEW` make no request at all; `ALLOW` creates one order and no capture. Do not stub a successful payment in the running backend to make a test pass. `UnimplementedPayPalGateway` keeps throwing when the PayPal credentials are missing.
