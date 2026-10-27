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
        { label: "Titular", value: props.payer },
        { label: "Quién paga", value: props.delegate },
        { label: "Para quién", value: props.beneficiary },
        { label: "Propósito", value: `${categoryList(props.categories)} para ${props.beneficiary}` },
        { label: "Presupuesto máximo", value: formatMoneyAmount(props.budget) },
        { label: "Vigencia", value: `${formatDate(props.validFrom)} al ${formatDate(props.expiresAt)}` },
        { label: "Modo de control", value: ENFORCEMENT_LABEL[props.enforcement] },
        { label: "Confianza mínima", value: CONFIDENCE_LABEL[props.confidence] },
        ...(props.cap ? [{ label: "Límite por compra (confianza menor)", value: formatMoneyAmount(props.cap) }] : []),
      ]}
    />
  );
}
