# Research and prior art

COMPAS did not invent restricted-purpose or programmable payments. It explores a non-custodial authorization layer over existing wallet accounts, using Open Payments. Purpose-Bound Money binds the money. COMPAS binds the permission to spend it.

Bibliographic fields that were not checked against the source are marked TODO. URLs below were retrieved or returned by a source that was opened while writing this note.

## 1. MAS Project Orchid and Purpose Bound Money

The Monetary Authority of Singapore published the Project Orchid whitepaper on 31 October 2022. It introduces Purpose Bound Money as a way to direct digital money toward specified conditions, including validity, retailer, and denomination, while aiming to work across forms of money and ledger designs.

The later Purpose Bound Money technical whitepaper describes a protocol that directs money toward a purpose without requiring the money itself to be programmed, and it stresses interoperability across wallets and rails.

COMPAS is not implementing a PBM token or wrapper. It does not wrap a CBDC, a tokenized deposit, or a stablecoin. It attaches a purpose policy to the permission to create a payment from an existing account.

- Monetary Authority of Singapore. "Project Orchid Whitepaper." 31 October 2022. <https://www.mas.gov.sg/publications/monographs-or-information-paper/2022/project-orchid-whitepaper>
- PDF consulted: <https://www.mas.gov.sg/-/media/mas-media-library/development/fintech/project-orchid/mas-project-orchid-report.pdf>
- PDF consulted: <https://www.mas.gov.sg/-/media/mas-media-library/development/fintech/pbm/pbm-technical-whitepaper.pdf>
- Publication page cited by the IMF paper below: <https://www.mas.gov.sg/publications/monographs-or-information-paper/2023/purpose-bound-money-whitepaper>

## 2. IMF work on digital asset platforms

Budau and Tourpe treat Purpose Bound Money as an architectural concept for programmable digital assets. In their ASAP model, PBM behavior cuts across the service and asset layers and is discussed as a way to reuse components across vouchers and grants. They also note that a design tied to one token platform limits interoperability.

COMPAS keeps purpose policy in the authorization layer and leaves the asset where the wallet already keeps it.

- Victor Budau and Herve Tourpe. "ASAP: A Conceptual Model for Digital Asset Platforms." IMF Working Paper 2024/019. 2 February 2024. DOI: <https://doi.org/10.5089/9798400266157.001>
- Record consulted: <https://www.elibrary.imf.org/view/journals/001/2024/019/article-A001-en.xml>

## 3. ERC-7291

ERC-7291 specifies a smart-contract interface for purpose-bound money: an ERC-20-compatible underlying token, an ERC-1155-compatible wrapper, and conditions checked before the underlying value is released. It is relevant prior art for how a purpose can be enforced in code. COMPAS deliberately does not require a blockchain or a smart contract.

- ERC-7291, "Purpose bound money." Created 2023-06-24. Authors: Orchid-Dev (@proj-orchid-straitsx), Victor Liew (@alcedo), Wong Tse Jian (@wongtsejian), Jacob Shan (@Jacobshan429), Chin Sin Ong (@chinsinong), Praveen Kumar (@veenkumarr). <https://eips.ethereum.org/EIPS/eip-7291>

## 4. Cash versus restricted transfers

Transfer design changes economic outcomes. Cunha, De Giorgi, and Jayachandran study a Mexican program that randomly assigned cash, in-kind food, or no transfer. In-kind delivery changed local prices relative to cash. The paper also summarizes related evidence that cash and in-kind transfers can raise total expenditure by similar amounts while changing what people buy.

That literature is why a purpose restriction is not a cosmetic label. It is also why the restriction is a loss of recipient autonomy, not a free improvement. COMPAS makes the restriction explicit at payment time instead of shipping a closed voucher token.

- Jesse M. Cunha, Giacomo De Giorgi, and Seema Jayachandran. "The Price Effects of Cash Versus In-Kind Transfers." *Review of Economic Studies* 86 (2019): 240–281. DOI: <https://doi.org/10.1093/restud/rdy018>

## 5. Digital consumption coupons in China

Xing, Zou, Yin, Wang, and Li study small-value, expiring digital coupons distributed on a mobile payment platform. Coupons raised near-term spending, and the authors find that the program distorted consumption toward more expensive options and disproportionately favored larger firms. Merchant inclusion is part of the policy design, not an afterthought. A COMPAS category rule that only large, well-coded merchants can satisfy would repeat that skew.

- Jianwei Xing, Eric Zou, Zhentao Yin, Yong Wang, and Zhenhua Li. "'Quick Response' Economic Stimulus: The Effect of Small-Value Digital Coupons on Spending." NBER Working Paper 27596. July 2020, revised May 2022. <https://www.nber.org/papers/w27596>
- A journal version is listed as DOI <https://doi.org/10.1257/mac.20210148>. Volume and issue were not re-checked for this note: TODO.

## 6. CGAP and modern G2P architecture

CGAP's writing on modern government-to-person payments argues for shared, interoperable infrastructure and for recipient choice of provider and access point. A program-specific closed loop is treated as a worse experience and a weaker inclusion outcome.

COMPAS should remain a policy layer that existing wallets can embed. It should not become another wallet that beneficiaries must adopt. The government example in the product vision is an extension of the mandate, not a separate rail.

- CGAP. "Building Blocks of a Modern G2P Architecture." October 2022. <https://www.cgap.org/research/publication/building-blocks-of-modern-g2p-architecture>
- Authors: TODO

## 7. Small-merchant acceptance

CGAP's merchant-payments work describes digital acceptance at small retailers as a persistent gap. Cash remains practical for many merchants, and a payment product that does not fit how they sell will not be used. A purpose-restricted flow that assumes every pharmacy has a richly verified category code will miss the merchants Gladys can actually walk to.

- CGAP. "Digitizing merchant payments: Why and How." <https://www.cgap.org/research/digitizing-merchant-payments-why-and-how>
- Authors and date: TODO

## Risks and trade-offs

COMPAS is a payment-control primitive. It is not a universal solution to fraud or corruption.

- **Paternalism.** A purpose limit overrides the recipient's choice. The payer has to intend that, and the delegate has to see it.
- **Miscoded merchants.** A pharmacy coded as general retail, or a liquor store coded as a pharmacy, breaks the policy. Trust level is there so a self-declaration is not treated as proof.
- **Collusion.** A delegate and a merchant can disguise an ineligible purchase as an eligible one. The audit trail records the claim they made. It does not detect a lie by itself.
- **False invoices.** An eligible category on a fictitious bill can pass a category rule. Invoice verification is out of scope.
- **AI errors.** A wrong or low-confidence category must become `REVIEW` or `DENY`, not a payment.
- **Small-merchant exclusion.** Strict evidence rules favor merchants that already have clean category data.
- **Privacy.** Purpose, items, and health context are sensitive. Open Payments metadata stays opaque.
- **Refunds.** A refund has to restore authorization capacity as well as value. That behavior is not specified yet: TODO.
- **Split transactions.** Splitting one purchase into many small eligible tickets can evade a naive budget or basket rule.
- **Purpose-policy abuse.** A policy can be written so broadly that it restricts nothing, or so narrowly that it cannot be used. The product does not judge whether a payer's purpose is fair.

COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail.
