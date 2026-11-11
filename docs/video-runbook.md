# Video runbook — COMPAS PayPal hackathon (≤ 3 minutes)

Use the **public** hosts. Do not put the presenter key in the video, Devpost, README, or captions.

- Web: `https://compas-paypal-web.onrender.com/demo`
- API health: `https://compas-paypal-api.onrender.com/health` → expect `status=ok`, `paypal=sandbox`, `liveAgent=presenter_only`

## Before recording (15–20 min, off camera)

1. Open the API URL once (wakes Free). Wait until `/health` returns `status=ok`.
2. Open `/demo` in a **fresh private window**. Confirm you are not on a cold-start “demo ended” banner mid-take.
3. **Act 1 (once per wake):** Central Pharmacy → **Run the analyst**. Wait until a real run finishes (or the shared cached run appears). Without this, Act 3 blocks: *“The analyst has not matched this pharmacy's losartán…”*
4. Optional Act 2 warm-up off camera: create Pedro’s budget if you want the phones already green; Act 3’s **Watch an agent** can also create mandate + errand itself.
5. For **Live Claude** only: open `/demo?presenter=<key>` (private bookmark; never show the URL bar). Confirm Live radio is enabled (not “Presenter-only”).
6. Have Scripted selected as fallback if Claude is slow.

## On-camera sequence (~2:30)

### Act 1 — Analyst (~40s)

1. Tab **1 Before anyone buys**.
2. Leave **Central Pharmacy** selected → **Run the analyst** (or show the cached real run + time).
3. Say: Claude proposes CUMs; INVIMA verifies; AI never authorizes payment.

### Act 2 — Purchase (~50s)

1. Tab **2 The purchase**.
2. On Pedro’s phone: create / authorize the medication budget (or show it already ACTIVE).
3. On pharmacy → charge; Andrea pays under COMPAS.
4. On ALLOW, open PayPal sandbox approval for Pedro (or cut to a prior sandbox approval clip if you already captured earlier — do **not** invent a new capture during the take unless authorized).
5. Say: COMPAS decides purpose; Pedro approves at PayPal; money goes to the merchant, not Andrea.

### Act 3 — Agents (~60s)

1. Tab **3 When an AI shops**.
2. Show both modes: **Scripted demonstration** (public) and **Live Claude agent** (presenter-only on the public deploy).
3. **Scripted (default for judges):** leave Scripted checked → **Watch an agent do the errand**.
   - Consent card for Andrea → approve the errand-scoped grant.
   - Story + technical view: real MCP calls (`search_eligible_merchants`, `check_purchase`, `propose_purchase`, …).
   - Compas decision visible; if an order appears, label it **pending Pedro** — never “COMPLETED” until capture.
4. **Live Claude (optional short cut):** with presenter link already open, select Live → same button.
   - Expect Claude’s tool choices (dynamic) + same Compas leash.
   - Do not approve/capture a new Sandbox order on camera unless planned.

## Live Claude — what must appear

- Authorized errand (Losartán) after Act 1 + confirm.
- Andrea consent (OAuth/PKCE).
- MCP calls chosen by Claude.
- Compas ALLOW / DENY / REVIEW (deterministic).
- PayPal state: at most **order awaiting payer** — not completed unless you already captured off-camera earlier.
- Stop reason when the agent ends.

## Cold start / slowness

- **Before record:** wake API + Act 1 as above.
- If `/demo` says the previous demo ended: **Reset my demo**, re-run Act 1, then Act 3.
- If Claude hangs > ~45s on Live: cut to Scripted (“same MCP leash, written reasoning”) or poll the run panel once more; do not invent steps.
- If Live is disabled: you are not on the presenter link — Scripted still works.

## Do not

- Show or speak the presenter key.
- Treat `propose_purchase` + pending approval as a completed payment.
- Reuse logs from another session as if they were this take.
- Claim the agent pays autonomously.
