import { formatMoneyAmount } from "@/lib/format-money";
import type { MandateView } from "../api/contracts";
import {
  CATEGORY_LABEL,
  CONFIDENCE_DESCRIPTION,
  CONFIDENCE_LABEL,
  ENFORCEMENT_DESCRIPTION,
  ENFORCEMENT_LABEL,
} from "../lib/labels";

/** What the budget allows, in words. The same text for the payer and the delegate. */
export function RulesSummary({ policy }: { policy: MandateView["purposePolicy"] }) {
  const { minimum, maxDebitBelowHigh } = policy.merchantConfidence;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-(--cx-muted)">Allowed categories</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {policy.eligibleCategories.map((category) => (
            <li key={category} className="rounded-full bg-(--cx-card) px-2.5 py-1 text-[13px] font-medium text-(--cx-ink)">
              {CATEGORY_LABEL[category]}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[13px] text-(--cx-muted)">Enforcement mode</p>
        <p className="mt-0.5 text-[14px] font-semibold text-(--cx-ink)">{ENFORCEMENT_LABEL[policy.enforcement]}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-(--cx-muted)">{ENFORCEMENT_DESCRIPTION[policy.enforcement]}</p>
      </div>
      <div>
        <p className="text-[13px] text-(--cx-muted)">Minimum merchant confidence</p>
        <p className="mt-0.5 text-[14px] font-semibold text-(--cx-ink)">{CONFIDENCE_LABEL[minimum]}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-(--cx-muted)">{CONFIDENCE_DESCRIPTION[minimum]}</p>
        {maxDebitBelowHigh ? (
          <p className="mt-1.5 text-[13px] text-(--cx-ink) tabular-nums">
            Merchants below high confidence: up to {formatMoneyAmount(maxDebitBelowHigh)} per purchase.
          </p>
        ) : null}
      </div>
    </div>
  );
}
