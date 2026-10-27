# COMPAS reference: PayPal facts, flows, categories, research

## PayPal facts (checked against the sandbox REST API on 2026-10-26)
- The sandbox app's client-credentials token has no `vault/payment-tokens` scope, and `POST /v3/vault/setup-tokens` with a PayPal payment source answers `403 NOT_AUTHORIZED`. No payer-absent charge is available: every order needs the payer's approval.
- `POST /v2/checkout/orders` with `payment_source.paypal.experience_context` answers `PAYER_ACTION_REQUIRED` with a `payer-action` link (`https://www.sandbox.paypal.com/checkoutnow?token=<order id>`).
- `payee.merchant_id` is checked when the order is created: an unknown id answers `422 PAYEE_ACCOUNT_INVALID`. `payee.email_address` is not checked then. `brand_name` replaces the payee's name on the checkout page, so COMPAS leaves it out.
- The same `PayPal-Request-Id` returns the same order. A capture before approval answers `422 ORDER_NOT_APPROVED`. An unknown order answers `404 RESOURCE_NOT_FOUND`.
- `reference_id`, `custom_id` and `invoice_id` come back unchanged on the order. COMPAS puts the mandate, decision and intent ids there.
- Legacy billing-agreement tokens (`/v1/billing-agreements/agreement-tokens`) can be created; charging one was not verified.
- Not verified: a full approval and capture with a sandbox personal account, payee routing to a second business account at capture, Log in with PayPal, refunds and dispute webhooks.

## Flows mapped to the gateway
| Step | COMPAS | `PayPalGateway` |
|---|---|---|
| Payer confirms the budget | Mandate `DRAFT` → `ACTIVE` | none |
| Merchant charge | Purchase intent with line items | none |
| Decision | Policy, in the order `POLICY_EVALUATION_ORDER`, budget included | none |
| Order (only on `ALLOW`) | Reserve the charge; record the order | `createOrder` (payee = merchant, opaque ids only) |
| Payer approves | Shown to the payer only | none: the payer approves at PayPal |
| Capture | Mandate and order checked again; history recorded | `getOrder` → `captureOrder` |
| Cancel or expiry | Capacity given back | `getOrder` |
| Exception (next) | `REVIEW` → payer approves a one-off order | `createOrder` for the held cart |

## Categories → CIIU Rev. 4 A.C.
These codes come from memory and are not verified. Check them against the annex of DIAN Res. 114/2020.

| Purpose | Eligible CIIU | Typical denial |
|---|---|---|
| `MEDICATION` | 4773 (retail pharmaceutical/medicinal products) | 4724 (beverages and tobacco: licorera) |
| `FOOD` (bonus roadmap) | 4711 (non-specialized, mainly food), 4721–4723, 4729 | 4724 |

## Research the design rests on
- **Merchant registry.** RUES, run by the Cámaras de Comercio, records one main CIIU code plus up to three secondary ones, which must match the RUT. SIC supervises but doesn't hold the registry. A CIIU code is not proof of what a shop sells: Supersociedades Oficio 220-178431 (2024) lets merchants carry out unregistered lawful activities. A 2008 Bogotá study found Cámara pharmacy lists that included shops not selling medicine. Confecámaras does publish monthly bulk RUES extracts on datos.gov.co (CC BY-SA 4.0): establishments with main and secondary CIIU (`nb3d-v3n7`) and their owners (`c82u-588k`). `data/seeds/merchant-registry/` holds a Medellín sample. In it, only 49% of active 4773 shops have a pharmacy name. Open pharmacy-establishment lists exist for Risaralda, Casanare, Norte de Santander and Valle, but none was found for Antioquia.
- **Wallet data.** Nequi Negocios (2025, built with Wompi) offers QR, links and card acceptance with free signup. No public API exposing a merchant's activity was found, so in the demo it's a simulated wallet node.
- **Food bonuses.**
  - Medellín Cero Hambre 2026: 81,725 bonuses for 16,345 households at "establecimientos autorizados".
  - Medellín 2025: 15,484 families at COP 336,600.
  - Bogotá Te Nutre: supermarkets raised prices and swapped products for bonus holders.
  - ICBF fed about 1,500 deceased beneficiaries.
  - Colombia Mayor money is lost if not collected within the pickup window.
- **Inclusion.** ANIF: 41.2% of Colombians aged 55+ had no internet in 2024. This is the argument for NFC cards.
- **NFC.** Static NTAG213 tags can be cloned, so a PIN and a per-purchase maximum are mandatory. Production would use NTAG 424 DNA with SUN, or EMV `cardAuthorization` (auth-server v1.4.0, Aug 2026).
- **Interledger precedent.** Spend Secure (UCT 2024) restricted remittance spending; COMPAS differs by being wallet-embedded with a shared merchant trust registry. Wider prior art is in `docs/09-research-and-prior-art.md`.

## Sources
- RUES open data (Confecámaras): https://www.datos.gov.co/d/nb3d-v3n7 and https://www.datos.gov.co/d/c82u-588k
- RUES form (CCMA): https://www.camaramedellin.com.co/Portals/0/Documentos/Crear%20Empresa/Formatos%20y%20Formularios/Instrucciones%20del%20formulario%20RUES.pdf
- Supersociedades oficio (INCP): https://incp.org.co/publicaciones/2024/08/supersociedades-se-pronuncia-sobre-actividades-adicionales-de-comerciantes-fuera-del-rues-y-rut/
- UNAD Bogotá pharmacy study: https://repository.unad.edu.co/handle/10596/1693
- DIAN Res. 114/2020: https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0114_2020.htm
- Nequi Negocios: https://www.elcolombiano.com/negocios/nequi-en-mi-negocio-pagos-transferencias-como-lo-tengo-KL24852769
- Cero Hambre 2026: https://www.medellin.gov.co/es/sala-de-prensa/noticias/con-la-alianza-medellin-cero-hambre-avanza-la-entrega-del-bono-alimentario-2026-para-16-345-hogares/
- Cero Hambre 2025: https://www.medellin.gov.co/es/sala-de-prensa/noticias/la-alcaldia-de-medellin-entrega-bonos-alimentarios-a-15-484-familias/
- Bogotá Te Nutre: https://concejodebogota.gov.co/respuesta-efectiva-a-denuncia-de-poblacion-beneficiaria-de-bonos/cbogota/2017-04-06/121639.php
- ICBF: https://www.eluniversal.com.co/colombia/icbf-le-entregaba-ayuda-alimentaria-a-1500-beneficiarios-fallecidos-AJ3874839
- Spend Secure (UCT 2024): https://interledger.org/news/hack-uct-2024-highlights-and-achievements-our-student-bootcamp-and-hackathon
