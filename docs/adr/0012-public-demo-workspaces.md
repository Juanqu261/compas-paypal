# ADR 0012: A public demo: one workspace per visitor, their own sandbox accounts, a shared analyst run

## Status

Accepted on 2026-10-29. Changes how [ADR 0008](0008-paypal-rail-per-order-approval.md) (the PayPal rail) names the order's payee in a visitor's demo, and how [ADR 0009](0009-ai-analyst-evidence.md) (the analyst) is run on the public deploy. Leaves every invariant in `AGENTS.md` in place.

## Context

The demo goes on a public URL (Render). Until now it assumed one presenter: one Pedro, one Andrea, one pharmacy account, budgets in Supabase, and an analyst anyone could rerun. On a public URL that means:

- Every visitor is the same Pedro. One visitor can revoke or spend the budget another is demonstrating.
- Every visitor pays with the presenter's sandbox accounts, so the presenter's passwords would have to be published.
- Every Act 1 click is a paid Claude call and Elastic queries, and a script can repeat it.
- What visitors create lands in the team's database.

## Decision

- **One demo workspace per visitor** (`backend/src/integrations/demo-workspaces/`).
  - A workspace holds that visitor's Pedro, Andrea and Gladys, and their budgets, spending, audit log, errands, agent grants and merchant history. All of it is in memory. None of it reaches Postgres or another workspace.
  - Shared by all: merchants and their evidence (the trust log), catalogs, the CUM source, the analyst and PayPal.
  - The browser holds the workspace token in `localStorage`, so the demo survives the trip to PayPal.
  - A workspace ends after 2 hours idle, at the cap of 300 live workspaces (least recently used first), on "Reset my demo", or on restart. PayPal's return for one of its orders then reports `ended`, and nothing is captured. The screen says so.
- **Calls with no session find their workspace by what they carry.**
  - PayPal's return carries the order id, so a workspace announces each order it creates.
  - An agent carries its token, so a workspace announces each token it issues (by hash).
  - Agent clients and pending authorization requests are shared: an MCP client registers before any visitor answers it.
- **The visitor's own PayPal sandbox accounts are the main path.**
  - Two account IDs: a personal account plays Pedro, and only its approvals are captured. A business account receives every demo order.
  - IDs, not emails: the sandbox accepts an order to an email that has no account.
  - Never a password: the visitor logs in at PayPal themselves. The IDs stay in the workspace's memory.
  - No PayPal order exists until the visitor picks accounts (`SANDBOX_ACCOUNTS_REQUIRED`).
- **The payee may differ from the merchant.** In a visitor's demo, their business account stands in for the demo shop. The shop's evidence is still read for its own PayPal id; only the order's payee changes (`payeeMerchantId` on the directory merchant, the intent and the spending record). The settlement checks the order pays the recorded payee. The screen says the business account "stands in for Droguería Central" and that the evidence is the demo pharmacy's.
- **The presenter's accounts are a second option.** `DEMO_MERCHANT_PAYPAL_ID` and `DEMO_PAYER_PAYPAL_ID` behave exactly as before. They are open to every visitor when `COMPAS_PRESENTER_KEY` is unset (local), and otherwise only to a browser that opened `/demo?presenter=<key>`.
- **One real analyst run per pharmacy, shown to everyone.**
  - A run that called the model is shown to every visitor, with its time. No new live run of that pharmacy starts for `COMPAS_ANALYST_RERUN_HOURS` (6 by default). A failed try waits 15 minutes.
  - The latest real run and its findings are kept in `compas.analyst_runs`. On startup its CUM pointers go through the deterministic verifier again (ADR 0009): a stored mapping is never trusted as stored.
- **Per-demo caps, no per-address limits.**
  - One demo may create 10 PayPal orders, 20 budgets and 20 errands (`COMPAS_LIMIT_*`). Those caps protect the server's memory and the app's shared PayPal credentials.
  - `POST /errands/drafts`, the one remaining model call no screen uses, is off on the public deploy (`COMPAS_ERRAND_DRAFTS=disabled`).

## Alternatives set aside

- **Keeping budgets in Postgres, per visitor.** It would survive restarts, but the database would fill with throwaway test data. A demo lasts minutes.
- **Publishing the presenter's sandbox passwords.** The money is fake, but anyone could change the password or lock the account and break the demo for everyone.
- **Copying the demo pharmacy's evidence onto the visitor's business account.** That would attest an arbitrary account in the shared trust log.
- **A mock analyst, or mock PayPal, when a service is down.** `AGENTS.md` forbids fabricating either. A real run shown with its time is real evidence. A failed try is said, not hidden.
- **Per-address request limits.** Behind Render's edge and the Next rewrite, the visitor's address has to be passed through and trusted, which is one more secret to set and check. With the cooldown and the per-demo caps, nothing left is paid per request. A venue's visitors share one address anyway.

## Consequences

- A restart empties every visitor's demo. A visitor at PayPal at that moment comes back to "your demo ended", with nothing charged.
- The demo merchant history a visitor confirms stays in their workspace and never moves the shared trust matrix.
- A script can start 300 demos and push out real visitors' demos. That costs nothing, but spoils the demo until the script stops.
- After a restart, a flag withdrawn since the last real run shows as open until the next run. Purchases are unaffected: policy reads the trust log.
- `compas.analyst_runs` (`data/migrations/20261029120000_analyst_runs.sql`) must be applied before a restart can keep the cooldown.
