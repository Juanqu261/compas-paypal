import { formatMoneyAmount } from "@/lib/format-money";
import type { CompasCategory, ConfidenceMinimum, Enforcement, Money } from "../api/contracts";
import { formatDate } from "../lib/dates";
import { categoryList, CONFIDENCE_LABEL, ENFORCEMENT_LABEL } from "../lib/labels";
import { Facts } from "./primitives";

/** Everything the payer is about to authorize, before they confirm it. */
export function AuthorizationSummary(props: {
  payer: string;
  delegate: string;
  beneficiary: string;
  categories: readonly CompasCategory[];
  budget: Money;
  validFrom: string;
  expiresAt: string;
  enforcement: Enforcement;
  confidence: ConfidenceMinimum;
  cap?: Money;
}) {
  return (
    <Facts
      rows={[
        { label: "Payer", value: props.payer },
        { label: "Who can spend", value: props.delegate },
        { label: "Who it's for", value: props.beneficiary },
        { label: "Purpose", value: `${categoryList(props.categories)} for ${props.beneficiary}` },
        { label: "Maximum budget", value: formatMoneyAmount(props.budget) },
        { label: "Valid", value: `${formatDate(props.validFrom)} to ${formatDate(props.expiresAt)}` },
        { label: "Enforcement mode", value: ENFORCEMENT_LABEL[props.enforcement] },
        { label: "Minimum confidence", value: CONFIDENCE_LABEL[props.confidence] },
        ...(props.cap ? [{ label: "Per-purchase limit (lower confidence)", value: formatMoneyAmount(props.cap) }] : []),
      ]}
    />
  );
}
