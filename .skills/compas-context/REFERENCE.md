# COMPAS reference: Open Payments facts, flows, categories, research

## Open Payments facts (verified against open-payments-specifications/openapi and SDK 7.4.0)
- Outgoing-payment grant `limits`: `receiver` (one incoming-payment URL), `interval` (ISO 8601 repeating, e.g. `R/2026-10-16T00:00:00Z/P1M`), and **either** `debitAmount` **or** `receiveAmount`. Amounts are per-interval maxima across many payments. There is no merchant list, category or MCC.
- An incoming payment with `incomingAmount` accepts several payments. Once the total is reached the ASE "MUST reject any further payments and set `completed` to `true`". This is what makes split tender possible later.
- Incoming-payment and quote grants are non-interactive. Outgoing-payment grants need interactive consent at the payer's wallet, then `grant.continue` with `interact_ref`.
- SDK calls in the official peer-to-peer example: `createAuthenticatedClient`, `walletAddress.get`, `grant.request`, `grant.continue`, `incomingPayment.create`, `quote.create`, `outgoingPayment.create`, `isFinalizedGrant`. Keep them behind `OpenPaymentsGateway`.

## Flows mapped to the gateway
| Step | COMPAS | `OpenPaymentsGateway` |
|---|---|---|
| Payer consent | Mandate `PENDING_AUTHORIZATION` → `ACTIVE` | `requestGrant` (outgoing-payment, `debitAmount` + `interval`, no receiver) → redirect → `continueGrant` |
| Merchant charge | Purchase intent with line items | `createIncomingPayment` on the merchant wallet (metadata: opaque ids only) |
| Decision | Policy, in the order `POLICY_EVALUATION_ORDER` | none |
| Pay (only on `ALLOW`) | Decrease `remainingAuthorizedAmount`; audit event | `createQuote` → `createOutgoingPayment` → `readPaymentStatus` |
| Exception (next) | `REVIEW` → payer approves | `requestGrant` with `limits.receiver` = incoming-payment URL, `debitAmount` = quote debit |
| Split tender (roadmap) | Bonus mandate first, then the remittance mandate | One quote + outgoing payment per mandate, all into the same incoming payment |

## Categories → CIIU Rev. 4 A.C.
These codes come from memory and are not verified. Check them against the annex of DIAN Res. 114/2020.

| Purpose | Eligible CIIU | Typical denial |
|---|---|---|
| `MEDICATION` | 4773 (retail pharmaceutical/medicinal products) | 4724 (beverages and tobacco: licorera) |
| `FOOD` (bonus roadmap) | 4711 (non-specialized, mainly food), 4721–4723, 4729 | 4724 |

## Research the design rests on
- **Merchant registry.** RUES, run by the Cámaras de Comercio, records one main CIIU code plus up to three secondary ones, which must match the RUT. SIC supervises but doesn't hold the registry. A CIIU code is not proof of what a shop sells: Supersociedades Oficio 220-178431 (2024) lets merchants carry out unregistered lawful activities. A 2008 Bogotá study found Cámara pharmacy lists that included shops not selling medicine. No open bulk RUES or droguería dataset was found; lookups go one NIT at a time.
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
