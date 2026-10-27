# Integration tests

These tests check the invariants across modules.

- `denied-payment-never-reaches-paypal`: `DENY` and `REVIEW` make no PayPal request. `ALLOW` creates one order and no capture. It runs on the real REST adapter over a fetch-level fake.
- `analyst-never-reaches-paypal`: the analyst, errand and Elastic modules import no PayPal port. The test follows their imports.
- `merchant-category-demo`: the demo seed resolves through real signature checks.

Never stub a successful payment in the running backend to make a test pass.
