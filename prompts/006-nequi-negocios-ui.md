# COMPAS — Nequi Negocios Embedded Surface UI Recreation
# Scope: frontend-only visual implementation + merchant collection flows from references

You are working inside the existing COMPAS monorepo.

Model being used:
Claude Opus 5.5

The human is using approximately MEDIUM reasoning effort.

This task is specifically to recreate the Nequi Negocios merchant experience shown in the FOUR screenshots attached to this prompt.

This is a scoped FRONTEND UI task.

Do NOT start coding immediately.

============================================================
0. REQUIRED CONTEXT — READ BEFORE ANY EDIT
============================================================

Before modifying ANY file, inspect the current repository and read the project instructions in this exact order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `README.md`

Then:

4. `.AGENTS/README.md`
5. `.AGENTS/product.md`
6. `.AGENTS/architecture.md`
7. `.AGENTS/development.md`
8. `.AGENTS/open-payments.md`
9. `.AGENTS/hackathon.md`

Then read the relevant shared skills:

10. `.skills/compas-context/SKILL.md`
11. `.skills/compas-context/REFERENCE.md` only where relevant
12. `.skills/hackathon-ai-rules/SKILL.md`
13. `.skills/hackathon-ai-rules/REFERENCE.md` when needed for compliance

Then inspect the current frontend implementation before editing:

14. `frontend/README.md`
15. `frontend/src/features/nequi-business/NequiBusinessExperience.tsx`
16. `frontend/src/app/nequi-negocios/page.tsx`
17. `frontend/src/features/demo/DemoStage.tsx`
18. `frontend/src/features/demo/DemoSession.tsx`
19. `frontend/src/components/phone/PhoneFrame.tsx`
20. `frontend/src/app/globals.css`
21. `frontend/src/app/layout.tsx`
22. relevant shared frontend components
23. current ARQ implementation under `frontend/src/features/arq/`

The ARQ implementation is useful only as an architectural example:
- one real feature component
- reused by standalone route and `/demo`
- local UI state
- edge-to-edge phone rendering

Do NOT copy ARQ visual styling into Nequi Negocios.

Also inspect:

24. `docs/01-demo-story.md`
25. `docs/03-architecture.md`
26. `docs/05-policy-engine.md`
27. `docs/08-hackathon-compliance.md`

Do not rely on assumptions from previous chats when repository documentation already answers something.

Precedence:

1. `AGENTS.md`
2. `docs/`
3. `.AGENTS/`
4. skills
5. this task prompt

If a meaningful conflict exists, report it rather than silently choosing a different product architecture.

============================================================
1. AI DISCLOSURE / PROMPT LOG
============================================================

This is a meaningful AI-assisted coding task and must follow the hackathon AI rules.

BEFORE implementing the UI:

1. Inspect `/prompts`.

2. Determine the next available numbered prompt file.

Preferred name if available:

`prompts/005-nequi-negocios-ui.md`

If `005-*` already exists, increment the number.

NEVER overwrite an existing prompt log.

3. Save THIS ENTIRE PROMPT verbatim in that file.

Do not summarize it.
Do not rewrite it.
Do not remove sections.

4. Inspect `AI_USAGE.md`.

Append or update the appropriate disclosure for this task according to:

`.skills/hackathon-ai-rules/SKILL.md`

The disclosure should say Claude Code / Claude Opus 5.5 assisted with:

- Nequi Negocios UI recreation
- merchant frontend component implementation
- responsive mobile layout
- visual adaptation from team-provided screenshots
- local demo interactions
- no real Nequi/Nequi Negocios integration
- no payment execution
- no Open Payments implementation in this task

Do not rewrite or lose prior disclosures.

Do not claim human review that has not actually happened.

============================================================
2. TASK OBJECTIVE
============================================================

Replace the current placeholder:

`NequiBusinessExperience`

with a high-fidelity DOM recreation of the Nequi Negocios experience visible in the attached screenshots.

This merchant surface represents:

Merchant:
Droguería Central

Role:
MERCHANT

Provider surface:
Nequi Negocios simulation

It is one of the three COMPAS demo surfaces:

Phone 1:
ARQ
Pedro
PAYER

Phone 2:
Nequi
Andrea
DELEGATE

Phone 3:
Nequi Negocios
Droguería Central
MERCHANT

The new implementation must work both:

`/nequi-negocios`

and:

`/demo`

using the SAME `NequiBusinessExperience` implementation.

Do NOT build two versions.

Do NOT use iframes.

============================================================
3. CRITICAL PRODUCT BOUNDARY
============================================================

COMPAS is NOT a payment method.

This is extremely important.

On the Nequi Negocios home, the screenshots show collection methods such as:

- Tarjeta
- Link pago
- QR·Bre-B

COMPAS must NOT be added as a fourth collection card next to those methods.

That would incorrectly imply:

"Pay with COMPAS"

which is not the product.

COMPAS is:

an embedded authorization and policy layer.

The actual payment can still use compatible payment infrastructure.

A future merchant-side COMPAS feature will be related to:

- merchant enrollment
- merchant purpose/category claims
- merchant eligibility
- provider verification
- transaction classification
- COMPAS activity/status

That merchant configuration flow is OUT OF SCOPE for this task.

Do NOT add a COMPAS merchant settings screen yet.

Do NOT add a fake COMPAS payment method.

For now, recreate Nequi Negocios accurately.

============================================================
4. VISUAL SOURCES OF TRUTH
============================================================

The FOUR screenshots attached to this prompt are the primary visual source of truth.

Study them before coding.

Do NOT build a generic merchant dashboard.

Do NOT infer the appearance primarily from Nequi consumer UI.

This is Nequi Negocios and has its own visual system.

The screenshots represent four states/screens:

SCREEN 1
Merchant home / collection methods

SCREEN 2
Sales summary

SCREEN 3
NFC-unavailable collection fallback bottom sheet

SCREEN 4
Link de pagos information screen

Recreate these states.

============================================================
5. SCREEN 1 — HOME
============================================================

Recreate the first screenshot carefully.

Main visual structure:

A. SYSTEM STATUS AREA

Approximately:

`4:00 PM`

plus simple status/network/battery indicators.

Do not waste excessive time recreating every Android status glyph exactly.

The wallet UI is more important.

B. LIGHT BLUE HEADER/HERO

The upper background is a pale/light blue.

Approximate visual direction:

light blue:
around `#B7D2F4`

Exact values should be chosen by comparing against the screenshot.

C. USER HEADER

Left:

merchant/store icon inside a soft-blue square.

Text:

`Hola,`
`Daniel Ossa`

Right:

question/help icon.

Use:

Daniel Ossa

exactly as shown in the screenshot for this visual demo.

This is demo display data only.

D. MAIN HEADING

Large text:

`¿Cómo quieres cobrar?`

Dark plum/navy tone.

E. COLLECTION CARDS

Three cards horizontally:

1.
`Tarjeta`

subtitle:
`Débito o crédito`

CTA:
`Cobrar →`

2.
`Link pago`

subtitle:
`Para ventas digitales`

CTA:
`Cobrar →`

3.
`QR·Bre-B`

subtitle:
`Escanean y pagan`

CTA:
`Cobrar →`

Cards should visually resemble the screenshot:

- pale blue-gray backgrounds
- subtle border/shadow
- rounded corners
- blue icon tile
- dark-plum text
- blue CTA
- slight decorative provider marks if recreated with neutral geometric shapes

Do not download proprietary image assets.

Use DOM/CSS/inline SVG.

F. SALES SECTION

Heading:

`Ventas del día`

Card:

`$0,00`

subtitle approximately:

`Ventas del 16/Oct/2026`

Eye icon
refresh icon

bottom information strip:

`Saldo actualizado a las 4:00 pm`

Use the pale cyan tone shown in the screenshot.

G. BOTTOM NAVIGATION

Three tabs:

`Inicio`
`Ventas`
`Conoce más`

`Inicio` selected.

Use a floating white navigation surface with rounded corners and light shadow similar to the screenshot.

============================================================
6. SCREEN 2 — SALES SUMMARY
============================================================

Implement the sales-summary state shown in screenshot 2.

This is reached from either:

- the `Ventas` bottom-nav item
OR
- the sales summary/card area

Use whichever interaction is more natural while supporting both if simple.

The screen should contain:

A. BACK ARROW

Top-left.

B. TITLE

`Resumen de ventas`

C. DATE

Calendar icon:

`16 de octubre`

D. SUMMARY CARD

Two colored boxes:

LEFT:

`Disponible en tu Nequi`

`$0,00`

green/mint background.

RIGHT:

`En proceso a tu Nequi`

`$0,00`

warm beige background.

Below:

`Ver detalle`

with downward chevron.

E. PAYMENT METHOD SECTION

Heading:

`Ventas por método de pago`

First card:

QR icon

`QR`

`$0,00`

bottom status:

`Ya disponible en tu Nequi`

green.

Second card:

`Tarjeta y link de pago`

`$0,00`

status badge:

`Pendiente`

and explanatory text:

`La plata de tus ventas por estos métodos de pago se verá reflejada en tu Nequi, máximo en 2 días hábiles.`

Use the screenshot wording as closely as practical.

F. REPORT BUTTON

Large outlined button:

`Consultar reporte`

with search icon.

This is visual/demo only.

Do not build report generation.

============================================================
7. SCREEN 3 — NFC UNAVAILABLE BOTTOM SHEET
============================================================

Clicking:

`Tarjeta`
or its `Cobrar` CTA

should reproduce the interaction visible in screenshot 3.

This is important because the screenshot demonstrates merchant collection behavior.

The background should become:

- darkened / blurred / visually subdued

A bottom sheet slides upward.

The exact background illustration does NOT need to copy the photographic asset.

Do NOT download the Nequi/Wompi promotional photo.

Instead use either:

- a dark blurred gradient background
- simple abstract card/contactless shapes
- or the underlying home blurred/dimmed

The SHEET matters, not the photo.

Bottom sheet:

- large white surface
- strongly rounded top corners
- small drag handle
- close `X`

Heading:

`Elige otra opción de cobro`

Body:

`Este dispositivo no tiene NFC compatible para poder realizar tu cobro por contacto.`

Then:

`Puedes cobrar usando:`

Option 1:

paper-plane/send icon

`Enviar link de pago`

secondary text similar to:

`checkout.nequi.wompi.co/l/...`

This URL is VISUAL DEMO TEXT ONLY.

Do not create a real checkout link.

Option 2:

QR icon

`Muéstrale este QR a tu cliente`

subtitle:

`Dile que lo escanee desde su celular.`

Then show a QR-like visual.

IMPORTANT:

Do not generate a real payment QR.

Do not encode a URL that could be interpreted as a live transaction.

Use one of:

- deterministic decorative QR-like SVG
- clearly non-functional mock QR visual
- local demo QR component with no payment payload

Do not call a QR/payment API.

============================================================
8. SCREEN 4 — LINK DE PAGOS
============================================================

Clicking:

`Link pago`

or its `Cobrar` CTA

must open the screen shown in screenshot 4.

This is an in-app view inside the simulated Nequi Negocios experience.

Do NOT navigate to an external Wompi site.

Screen structure:

A. TOP HERO / ILLUSTRATION

The screenshot uses a real photographic image.

Do NOT copy or download it.

Instead create a visually appropriate abstract hero using:

- CSS gradients
- simple mobile-device/card illustration
- blurred shapes

The exact photographic asset is not necessary.

What matters is composition:

- image/illustration occupies top section
- rounded lower corners
- back arrow overlay
- status bar above/over it

B. TITLE

`Link de pagos`

Large dark-plum text.

C. BENEFIT ROW 1

share/network icon

`Vende por redes`

secondary:

`Crea tu link, envíalo y cobra en línea`

D. DIVIDER

E. BENEFIT ROW 2

money/instant icon

`Cobros instantáneos`

secondary:

`Recibe tu dinero al momento`

F. WOMPI ATTRIBUTION

Text similar to:

`Un servicio de Wompi`

Use text only / simple neutral wordmark styling.

Do NOT download the Wompi logo.

Do not claim actual Wompi integration.

G. BOTTOM ACTIONS

Link:

`Conoce las tarifas`

and a blue square/rounded button with right arrow.

The button does not need actual pricing behavior.

============================================================
9. QR·BRE-B CARD BEHAVIOR
============================================================

The screenshots do not include a dedicated QR·Bre-B direct-entry screen.

Therefore:

Do NOT invent a complex payment flow.

For this task, clicking the `QR·Bre-B` collection card may open a minimal QR collection overlay that REUSES the QR block already used in the NFC fallback sheet.

Recommended interaction:

Home
→ tap `QR·Bre-B`
→ bottom sheet
→ title:
   `Cobra con QR·Bre-B`
→ subtitle:
   `Muéstrale este QR a tu cliente`
→ decorative/non-functional QR
→ close

This interaction is an inferred demo behavior, not sourced from a provided screenshot.

Keep it minimal.

Do not add backend behavior.

Do not implement Bre-B APIs.

============================================================
10. UI STATE MODEL
============================================================

Keep all Nequi Negocios navigation state LOCAL to the frontend feature.

For example conceptually:

type NequiBusinessView =
  | "home"
  | "sales"
  | "link-payments";

and overlay state:

type CollectionOverlay =
  | null
  | "nfc-fallback"
  | "qr";

Use whatever clean React structure is appropriate.

Do not store this state in the backend.

Do not modify COMPAS domain state.

Do not put merchant UI navigation into DemoSessionProvider unless genuinely shared across phones.

============================================================
11. COMPONENT STRUCTURE
============================================================

Refactor:

`frontend/src/features/nequi-business/NequiBusinessExperience.tsx`

into a sensible component structure.

Suggested structure:

frontend/src/features/nequi-business/
├── NequiBusinessExperience.tsx
├── NequiBusinessHome.tsx
├── NequiBusinessSalesSummary.tsx
├── NequiBusinessLinkPayments.tsx
├── NequiBusinessNfcFallbackSheet.tsx
├── NequiBusinessQrSheet.tsx
├── NequiBusinessTopBar.tsx
├── NequiBusinessBottomNav.tsx
├── NequiBusinessIcons.tsx
└── nequi-business-demo-content.ts

You do NOT have to use exactly these names.

Use components for meaningful sections, not every individual line.

Do not create unnecessary abstraction.

============================================================
12. DEMO CONTENT
============================================================

Visual-only content can live in:

`nequi-business-demo-content.ts`

Label it clearly in code as:

`demo/test data`

Examples:

merchant name:
Daniel Ossa

daily sales:
$0,00

date:
16 Oct 2026

available:
$0,00

pending:
$0,00

This decorative merchant UI content does NOT belong in:

`data/fixtures/demo/medication-pharmacy.json`

Those shared fixtures represent the COMPAS business scenario.

Do not pollute them with purely decorative wallet UI data.

============================================================
13. IMPORTANT SHARED DEMO BEHAVIOR
============================================================

`NequiBusinessExperience` must remain usable both:

standalone:

`/nequi-negocios`

and embedded:

`/demo`

Do not duplicate implementation.

Inside `/demo`, Phone 3 should now look like a real phone UI rather than the current generic `ExperienceCard`.

Use the existing generic:

`PhoneFrame`

edge-to-edge capability if appropriate.

If ARQ already uses:

`edgeToEdge`

prefer reusing that generic capability for Nequi Negocios.

Do not add Nequi-specific behavior to `PhoneFrame`.

Do not break ARQ.

Do not break Nequi consumer.

============================================================
14. SCROLLING AND DEVICE FRAME
============================================================

The Nequi Negocios screenshots represent tall mobile views.

At standalone `/nequi-negocios`:

- mobile: naturally occupy viewport
- desktop: center a phone-sized experience
- logical target width approximately 390–420 CSS px
- no horizontal overflow

Inside `/demo`:

- Phone 3 must have its own internal vertical scroll where needed
- bottom navigation remains positioned correctly
- screens such as Sales Summary may scroll vertically
- bottom-sheet overlays must remain confined to Phone 3, NOT cover the entire `/demo` page

This is critical.

A modal or bottom sheet inside Nequi Negocios must be positioned relative to the simulated phone container.

Do NOT use a global fixed overlay that covers the other phones.

============================================================
15. VISUAL LANGUAGE
============================================================

Use the screenshots as source of truth.

Approximate visual palette:

Primary dark plum:
around `#2B002B`

Light blue header:
around `#B9D4F7`

Soft card blue:
around `#EAF3FE`

CTA blue:
around `#4387D4`

White:
`#FFFFFF`

Muted gray:
around `#757075`

Mint/available:
around `#C8F3DE`

Warm pending:
around `#F6D9AE`

These are approximate starting values only.

Adjust after comparing against screenshots.

Visual characteristics:

- large dark-plum typography
- pale blue hero
- rounded rectangular cards
- subtle borders
- very light shadows
- clean white surfaces
- sparse layout
- blue action links
- merchant/product-oriented visual tone

Do NOT import ARQ's green styling.

============================================================
16. ICONS
============================================================

Use:

- inline SVG
- CSS
- existing lightweight icon primitives

for:

- store
- help
- card
- link
- QR
- money
- eye
- refresh
- calendar
- back
- search
- send
- info
- home
- sales
- grid

Avoid installing a large icon package solely for this screen.

Do not use emoji as production icons.

============================================================
17. NO PROPRIETARY ASSET COPYING
============================================================

The screenshots are references.

Do NOT:

- use the screenshots as backgrounds
- crop pieces from screenshots
- download official Nequi assets
- download Wompi promotional images
- embed proprietary photos
- scrape Nequi
- use base64 copies of screenshot content

The UI must be implemented as real DOM.

Simple text names such as:

Nequi
Nequi Negocios
Bre-B
Wompi

are acceptable in this internal hackathon simulation.

============================================================
18. ACCESSIBILITY
============================================================

Even though this is a hackathon demo:

- buttons should be real `<button>` elements
- back controls must have accessible labels
- icon-only actions need aria-labels
- bottom navigation should have meaningful labels
- modal/bottom sheet close buttons must be keyboard accessible
- Escape should close an overlay when practical
- focus should move appropriately when opening/closing overlays
- reduced motion should be respected for large transitions if practical

============================================================
19. IMPORTANT COMPAS PRODUCT CONSTRAINTS
============================================================

Do NOT implement merchant COMPAS behavior here.

Specifically do NOT implement:

- merchant category selection
- `MEDICATION` enrollment
- merchant verification
- self-declared merchant claims
- provider verification
- external verification
- AI merchant classification
- transaction line-item classification
- merchant wallet address
- mandate lookup
- payment authorization
- outgoing payment
- incoming payment
- quote
- Open Payments client
- QR COMPAS payload
- audit events
- backend APIs

Those are future tasks.

This task is host-wallet UI recreation only.

============================================================
20. BACKEND / DOMAIN — OUT OF SCOPE
============================================================

Do NOT modify:

`backend/**`

Do NOT modify:

`contracts/**`

Do NOT modify:

`data/fixtures/demo/**`

Do NOT modify:

Open Payments interfaces.

Do NOT modify:

policy-engine semantics.

Do NOT implement:

database
Supabase
auth
AI
OCR
merchant registry
RUES integration
Bre-B integration
Nequi APIs

============================================================
21. DO NOT BREAK EXISTING ARQ UI
============================================================

ARQ has already been implemented.

Treat it as existing functionality.

Do not redesign it in this task.

Do not modify its styling.

Do not modify:

`frontend/src/features/arq/**`

unless an absolutely necessary shared abstraction requires it.

Prefer not to touch it at all.

============================================================
22. DO NOT BUILD NEQUI CONSUMER UI HERE
============================================================

Phone 2 / Nequi consumer remains outside this task.

Do not modify:

`frontend/src/features/nequi/**`

Do not build Andrea's COMPAS spending experience yet.

That will be a separate task.

============================================================
23. ROUTE
============================================================

Update:

`frontend/src/app/nequi-negocios/page.tsx`

as needed so standalone rendering behaves correctly.

Do NOT create another app.

The route should still render:

`NequiBusinessExperience`

within the appropriate existing provider/context.

============================================================
24. `/demo` INTEGRATION
============================================================

Update:

`frontend/src/features/demo/DemoStage.tsx`

only as necessary to render Phone 3 edge-to-edge.

Expected conceptual result:

<PhoneFrame title="Phone 3 · Nequi Negocios" edgeToEdge>
  <NequiBusinessExperience />
</PhoneFrame>

Do not duplicate the Nequi Business component.

Do not alter scenario semantics.

Do not remove DemoSessionProvider.

============================================================
25. DEMO SCENARIO STATE
============================================================

For this UI recreation task it is acceptable if the merchant wallet home does not yet visibly react to:

`medication-pharmacy`

versus:

`alcohol-rejection`

because actual COMPAS transaction evaluation is not implemented yet.

However:

DO NOT architect the component in a way that prevents future access to:

`useDemoSession()`

The next implementation phase will need Phone 3 to react to:

- purchase request
- COMPAS merchant evidence
- policy evaluation
- allowed/rejected status
- payment result

Keep the component extensible.

============================================================
26. NO VISIBLE TECHNICAL DISCLAIMERS INSIDE THE PHONE
============================================================

Do NOT render text such as:

`Simulated surface`
`demo/test data`
`Not affiliated with Nequi`
`Not a live payment`
`Not an Open Payments response`

inside the simulated Nequi Negocios phone.

Those facts belong in:

- README
- docs
- `/demo` surrounding presentation if necessary
- source comments

but not inside the wallet UI.

The pitch needs to demonstrate what an embedded experience would look like.

============================================================
27. BRAND / LEGAL BOUNDARY
============================================================

Repository documentation must continue to clearly say:

Nequi and Nequi Negocios are simulated embedding surfaces.

No production integration is implied.

But do not clutter the phone UI with disclaimers.

Do not claim:

- production Nequi integration
- partnership
- endorsement
- real Nequi merchant data
- real Wompi payment processing

============================================================
28. DO NOT IMPLEMENT REAL QR DATA
============================================================

Any QR shown during this task must be decorative/demo-only.

No:

- Open Payments wallet address
- checkout URL
- actual payment URL
- live Nequi payload
- Bre-B key
- personal information

should be encoded.

If you generate an SVG pattern manually, make it visibly QR-like but nonfunctional.

============================================================
29. QUALITY EXPECTATIONS
============================================================

Prefer:

- semantic TypeScript components
- existing Tailwind setup
- no additional dependency unless necessary
- scoped feature styles
- readable component boundaries
- no massive single JSX file
- no global CSS pollution
- no screenshots-as-background
- no absolute positioning for the complete page
- responsive proportions

============================================================
30. VISUAL FIDELITY PRIORITY
============================================================

Prioritize fidelity in this order:

1. overall Nequi Negocios composition
2. light-blue header
3. typography hierarchy
4. collection cards
5. sales card
6. bottom navigation
7. sales-summary composition
8. NFC fallback bottom sheet
9. Link de pagos composition
10. icons and smaller decorative details

Do not spend excessive time recreating Android status icons.

============================================================
31. BUILD / VALIDATION
============================================================

Before running commands, determine whether Node/npm are actually available.

From:

`frontend/`

run:

npm install

only if dependencies are missing.

Then:

npm run lint
npm run typecheck
npm run build

If Node/npm are unavailable:

DO NOT falsely report successful verification.

Report exactly which checks could not run.

If the browser/dev server is available, inspect:

`/nequi-negocios`

and:

`/demo`

at representative dimensions.

Recommended mobile checks:

390 × 844
412 × 915

Also inspect `/demo` at a desktop width.

============================================================
32. MANUAL VISUAL CHECKLIST
============================================================

Check:

HOME:
- pale-blue hero
- Daniel Ossa
- ¿Cómo quieres cobrar?
- three collection cards
- Ventas del día
- bottom nav

SALES:
- Resumen de ventas
- green available card
- beige pending card
- payment method cards
- Consultar reporte

NFC FALLBACK:
- dimmed background
- bottom sheet stays inside Phone 3
- rounded top
- drag handle
- close button
- Link pago option
- QR option
- decorative QR

LINK PAYMENTS:
- visual hero
- Link de pagos
- two benefit rows
- Wompi text
- pricing link
- arrow button

DEMO:
- ARQ remains unchanged
- Nequi placeholder remains unchanged
- Nequi Negocios now fills Phone 3 properly
- no global modal covering other phones
- no horizontal overflow

============================================================
33. EXPECTED FILE SCOPE
============================================================

EXPECTED TO MODIFY:

- `frontend/src/features/nequi-business/NequiBusinessExperience.tsx`
- new files under `frontend/src/features/nequi-business/`
- `frontend/src/app/nequi-negocios/page.tsx`
- `frontend/src/features/demo/DemoStage.tsx` only if needed for edge-to-edge Phone 3
- `prompts/<next-number>-nequi-negocios-ui.md`
- `AI_USAGE.md`

POSSIBLY:

- `frontend/src/components/phone/PhoneFrame.tsx`

ONLY if a generic enhancement is genuinely required.

Do not add Nequi-specific code to PhoneFrame.

EXPECTED NOT TO MODIFY:

- `backend/**`
- `contracts/**`
- `data/fixtures/demo/**`
- `frontend/src/features/arq/**`
- `frontend/src/features/nequi/**`
- Open Payments code
- policy code
- merchant registry code
- AI classifier code
- infrastructure
- research docs

============================================================
34. DO NOT COMMIT / DO NOT PUSH
============================================================

Do not commit.

Do not push.

Leave the changes ready for human review.

============================================================
35. FINAL RESPONSE
============================================================

When complete, report:

1. Root/project instructions actually read.
2. Skills actually loaded/read.
3. Prompt-log filename used.
4. Files created.
5. Files modified.
6. Files deliberately not touched.
7. Nequi Negocios component structure.
8. Home-screen behavior.
9. Sales-summary behavior.
10. NFC-fallback behavior.
11. Link-payments behavior.
12. QR·Bre-B inferred demo behavior.
13. `/nequi-negocios` standalone behavior.
14. `/demo` compatibility.
15. Confirmation that ARQ was not changed.
16. Confirmation that Nequi consumer was not changed.
17. Confirmation that no backend/domain/Open Payments logic was implemented.
18. Confirmation that no screenshots were embedded as images.
19. Confirmation that no real payment QR was generated.
20. `npm run lint` result.
21. `npm run typecheck` result.
22. `npm run build` result.
23. Any visual differences from the provided screenshots.
24. AI_USAGE.md status.
25. Confirmation that this exact prompt was preserved verbatim.
26. Any blocker or architectural concern before the next phase.

Do not simply answer "done".
