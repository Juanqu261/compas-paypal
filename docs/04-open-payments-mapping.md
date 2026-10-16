# Open Payments mapping

Open Payments and COMPAS are different layers.

Open Payments moves value between wallet addresses. It speaks grants, access actions, and limits. COMPAS decides whether a delegate may cause a payment for a purpose. `MEDICATION` is not an Open Payments scope.

The gateway in `backend/src/ports/open-payments-gateway.ts` is the only place the Interledger SDK should appear later. Nothing in this repository calls it. The frontend does not hold the client key.

## Who enforces what

| Concern | Owner |
| --- | --- |
| Wallet address, auth server, resource server | Open Payments |
| Grant, access actions, continuation | Open Payments |
| Monetary and interval limits on a grant | Open Payments |
| Incoming payment, quote, outgoing payment, completion | Open Payments |
| Mandate, payer, delegate, beneficiary | COMPAS |
| Purpose and eligible category | COMPAS |
| Merchant evidence and trust level | COMPAS |
| Line-item purpose policy | COMPAS |
| AI category suggestion | COMPAS classifier, then the policy engine |
| Decision reason and audit trail | COMPAS |

Open Payments can already say "at most this much, over this interval." COMPAS adds "only for this purpose, by this delegate, for this beneficiary."

## Concept map

| COMPAS | Open Payments |
| --- | --- |
| Payer wallet | Wallet address that will be debited |
| Merchant wallet | Wallet address that receives an incoming payment |
| Delegate | Not a wallet role. The delegate is outside Open Payments. |
| Beneficiary | Not a payee. Gladys may have no wallet address. |
| Budget and remaining capacity | May later be reflected by an outgoing-payment grant `debitAmount` limit. The COMPAS figure is still authorization capacity, not custody. |
| Validity window | May later align with a grant interval. Purpose expiry remains a COMPAS rule. |
| Purpose policy | No Open Payments equivalent. Do not encode it as a scope. |
| Policy decision id | Opaque `compasDecisionId` metadata, if metadata is sent at all |
| Mandate id | Opaque `compasMandateId` metadata |

## Resources

**Wallet address.** A URL that publishes account discovery data, including the authorization server and resource server. COMPAS will resolve payer and merchant addresses through the gateway. It does not invent them in the domain model.

**Grant.** GNAP-style permission for actions on a resource. An outgoing-payment grant is taken on the payer's wallet. Its limits can cap the debit amount and the interval. The final receiver does not have to be known when that grant is requested. Pedro can authorize a spending budget before Andrea chooses an eligible pharmacy. The receiver appears later, when an incoming payment and a quote exist. This scaffold does not implement grant requests or GNAP continuation.

**Incoming payment.** Created on the receiver's resource server. The receiver is the merchant, not Andrea.

**Quote.** Prices a payment from the payer's asset into the incoming payment. For a USD payer wallet and a COP merchant wallet, the quote is where exchange and cost information belong. Use a value returned by the Open Payments test environment, or a fixture explicitly marked `demo/test data`. Do not hardcode a rate and present it as live.

**Outgoing payment.** Executes the quoted payment from the payer's wallet. COMPAS may call `createOutgoingPayment` only after policy evaluation returns `ALLOW`.

Open Payments currently uses ILP as its directly integrated payment method. This prototype does not integrate Nequi, ARQ, Daviplata, Bre-B, or ACH. Those names in the UI are simulated embedding surfaces.

## Client configuration

The future authenticated client follows the official Node snippets for `createAuthenticatedClient`:

- `walletAddressUrl` from `CLIENT_WALLET_ADDRESS`
- `keyId` from `KEY_ID`
- `privateKey` from `PRIVATE_KEY_PATH` (a path or key contents)

Those names are in `backend/.env.example`. No credentials are filled in. The private key file must stay out of git and must not be exposed to the frontend.

## Metadata

Open Payments accepts metadata on a payment. COMPAS may later send only:

- `compasMandateId`
- `compasDecisionId`
- `externalReference`

Do not send a diagnosis, a drug name, a national ID, or other health or identity detail in that metadata. The audit trail can hold richer operational history inside COMPAS, still without unnecessary sensitive data.
