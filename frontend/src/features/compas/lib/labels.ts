import type {
  ActivityKind,
  CompasCategory,
  ConfidenceMinimum,
  Corroboration,
  Enforcement,
  MandateStatus,
  MandateView,
  PaymentFailureCode,
  PolicyReasonCode,
  PurchaseView,
  TrustLevel,
} from "../api/contracts";

/**
 * Plain Spanish for everything the backend says in codes. The codes stay the
 * backend's. Nothing here decides a payment.
 */

export const STATUS_LABEL: Record<MandateStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  EXHAUSTED: "Agotado",
  EXPIRED: "Vencido",
  REVOKED: "Revocado",
};

/** A tone for the badge. The label always carries the meaning too. */
export function statusTone(status: MandateStatus): "ok" | "wait" | "off" | "draft" {
  if (status === "ACTIVE") return "ok";
  if (status === "DRAFT") return "draft";
  return "off";
}

/**
 * Whether the payer ever confirmed this permission. A draft authorizes
 * nothing yet, so its amount is "por autorizar", never "autorizado". A
 * delegate only ever sees confirmed ones.
 */
export function isAuthorized(mandate: Pick<MandateView, "status" | "viewerRole" | "authorization">): boolean {
  if (mandate.status === "ACTIVE" || mandate.status === "EXHAUSTED") return true;
  if (mandate.status === "DRAFT") return false;
  return mandate.viewerRole === "DELEGATE" || mandate.authorization?.consent === "GRANTED";
}

/** What the capacity figure means in this state. */
export function capacityLabel(mandate: Pick<MandateView, "status" | "viewerRole" | "authorization">): string {
  switch (mandate.status) {
    case "ACTIVE":
      return "Disponible para pagar";
    case "DRAFT":
      return "Monto por autorizar";
    case "EXHAUSTED":
      return "Capacidad agotada";
    case "EXPIRED":
      return isAuthorized(mandate) ? "Venció sin usar" : "Venció sin autorizarse";
    case "REVOKED":
      return isAuthorized(mandate) ? "Revocado sin usar" : "Descartado sin autorizarse";
  }
}

/** The status as the payer reads it. */
export function payerStatusLabel(mandate: Pick<MandateView, "status">): string {
  return STATUS_LABEL[mandate.status];
}

export const CATEGORY_LABEL: Record<CompasCategory, string> = {
  MEDICATION: "Medicamentos",
  FOOD: "Alimentación",
  PERSONAL_CARE: "Cuidado personal",
  ALCOHOL: "Bebidas alcohólicas",
  TOBACCO: "Tabaco",
};

export const CATEGORY_DESCRIPTION: Record<CompasCategory, string> = {
  MEDICATION: "Con o sin fórmula, en droguerías.",
  FOOD: "Mercado en tiendas y supermercados.",
  PERSONAL_CARE: "Aseo e higiene personal.",
  ALCOHOL: "Bebidas alcohólicas.",
  TOBACCO: "Cigarrillos y tabaco.",
};

/** "Medicamentos", "Medicamentos y alimentos", "Medicamentos, alimentos y tabaco". */
export function categoryList(categories: readonly CompasCategory[]): string {
  const labels = categories.map((category, index) =>
    index === 0 ? CATEGORY_LABEL[category] : CATEGORY_LABEL[category].toLowerCase(),
  );
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

/** The budget's name in lists: what it is for and for whom. */
export function purposeTitle(mandate: Pick<MandateView, "purposePolicy" | "beneficiary">): string {
  return `${categoryList(mandate.purposePolicy.eligibleCategories)} para ${mandate.beneficiary.displayName}`;
}

export const ENFORCEMENT_LABEL: Record<Enforcement, string> = {
  ENFORCED: "Solo compras permitidas",
  MONITORED: "Permitir y avisarme",
};

export const ENFORCEMENT_DESCRIPTION: Record<Enforcement, string> = {
  ENFORCED: "Si una compra no cumple tus reglas, no se paga.",
  MONITORED: "Se paga aunque no cumpla el propósito, y queda marcada para que la revises.",
};

export const MONITORED_WARNING =
  "Una compra fuera del propósito se pagará igual, hasta el monto del presupuesto. La vigencia, la persona y el monto máximo siempre aplican.";

export const CONFIDENCE_LABEL: Record<ConfidenceMinimum, string> = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Básica",
};

export const CONFIDENCE_DESCRIPTION: Record<ConfidenceMinimum, string> = {
  HIGH: "Comercios verificados por su billetera o un registro oficial.",
  MEDIUM: "También comercios con verificación parcial.",
  LOW: "También comercios que solo declaran su actividad. Ponle un límite por compra.",
};

export const REASON_TEXT: Record<PolicyReasonCode, string> = {
  MANDATE_INACTIVE: "La autorización no estaba activa",
  MANDATE_EXPIRED: "La autorización estaba vencida",
  BUDGET_EXCEEDED: "La compra supera el presupuesto autorizado",
  PURPOSE_MISMATCH: "Los productos no corresponden al propósito",
  MERCHANT_NOT_ELIGIBLE: "El comercio no cumple las categorías permitidas",
  CLASSIFICATION_UNCERTAIN: "Falta información para comprobar la compra",
  MERCHANT_EVIDENCE_INSUFFICIENT: "El comercio no alcanza la confianza que exigiste",
  MERCHANT_EVIDENCE_CONFLICT: "Encontramos información contradictoria sobre el comercio",
  MERCHANT_HISTORY_CONTRADICTS: "Compras anteriores contradicen lo que declara el comercio",
  MERCHANT_CONFIDENCE_LIMIT_EXCEEDED: "La compra supera tu límite para comercios con menos confianza",
  DELEGATE_NOT_AUTHORIZED: "Esta autorización pertenece a otra persona",
  PAYER_MONITORED_EXCEPTION: "Compra realizada bajo supervisión",
  ERRAND_MISMATCH: "La compra no coincide con el encargo confirmado",
};

export function reasonText(code: string): string {
  return (REASON_TEXT as Record<string, string>)[code] ?? "Motivo no reconocido";
}

export function activityLabel(kind: ActivityKind, monitoredException: boolean): string {
  switch (kind) {
    case "COMPLETED":
      return monitoredException ? "Pago realizado, con aviso" : "Pago realizado";
    case "PENDING":
      return "Pago en proceso";
    case "AWAITING_APPROVAL":
      return "Por aprobar en PayPal";
    case "CANCELLED":
      return "Cancelado en PayPal";
    case "FAILED":
      return "Pago no realizado";
    case "DENIED":
      return "Compra no permitida";
    case "REVIEW":
      return "Retenida para revisión";
  }
}

/** Why COMPAS did not, or PayPal could not, capture an allowed purchase. Nothing was charged in any of them. */
export const FAILURE_TEXT: Record<PaymentFailureCode, string> = {
  MANDATE_NOT_USABLE: "El presupuesto ya no estaba activo cuando se aprobó. No se cobró nada.",
  ORDER_MISMATCH: "El pedido de PayPal no coincidía con la compra. No se cobró nada.",
  PAYER_ACCOUNT_MISMATCH: "Lo aprobó otra cuenta de PayPal. No se cobró nada.",
  CAPTURE_DECLINED: "PayPal rechazó el cobro. No se cobró nada.",
  ORDER_EXPIRED: "El pedido venció sin aprobarse. No se cobró nada.",
};

/** The one reason worth showing next to an attempt that did not pay normally. */
export function activityReason(kind: ActivityKind, codes: readonly string[], failureCode?: PaymentFailureCode): string | undefined {
  if (kind === "COMPLETED" || kind === "PENDING" || kind === "AWAITING_APPROVAL") {
    const purposeCode = codes.find((code) => code !== "PAYER_MONITORED_EXCEPTION");
    if (codes.includes("PAYER_MONITORED_EXCEPTION") && purposeCode) return reasonText(purposeCode);
    return kind === "AWAITING_APPROVAL" ? "No se cobra nada hasta que se apruebe en PayPal." : undefined;
  }
  if (kind === "CANCELLED") return "Se canceló en PayPal. No se cobró nada.";
  if (kind === "FAILED") return failureCode ? FAILURE_TEXT[failureCode] : "PayPal no completó el pago. No se cobró nada.";
  return codes.length > 0 ? reasonText(codes[0]) : undefined;
}

/**
 * Only a PayPal page is ever opened for the payer: https on paypal.com or one
 * of its subdomains, such as www.sandbox.paypal.com. Anything else is dropped.
 */
export function payPalApprovalUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    const host = url.hostname;
    return url.protocol === "https:" && (host === "paypal.com" || host.endsWith(".paypal.com")) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** API error codes, said plainly with what to do next. */
export function errorText(code: string): string {
  switch (code) {
    case "PAYPAL_NOT_CONFIGURED":
    case "NOT_CONFIGURED":
      return "Este entorno no tiene PayPal configurado, así que no se pueden crear pagos.";
    case "UPSTREAM":
      return "PayPal no respondió. Intenta de nuevo en unos minutos.";
    case "INVALID_STATE":
      return "Este presupuesto ya no admite esa acción.";
    case "NOT_THE_PAYER":
      return "Solo quien creó el presupuesto puede hacer esto.";
    case "NOT_FOUND":
      return "No encontramos este presupuesto.";
    case "INVALID_MANDATE":
      return "Revisa los datos del presupuesto.";
    case "UNAUTHENTICATED":
    case "IDENTITY_NOT_CONFIGURED":
      return "La sesión de demostración no está disponible en el backend.";
    case "BACKEND_UNAVAILABLE":
      return "No pudimos conectar con COMPAS. Revisa que el backend esté en ejecución.";
    case "TIMEOUT":
      return "COMPAS tardó demasiado en responder. Intenta de nuevo.";
    case "NOT_THE_DELEGATE":
      return "Solo la persona autorizada puede pagar con este presupuesto.";
    case "PURCHASES_DISABLED_FOR_DEMO":
      return "Los pagos están desactivados en esta demostración. No se cobró nada.";
    case "UNKNOWN_MERCHANT":
      return "Este comercio no recibe pagos con COMPAS en este entorno.";
    case "INVALID_PURCHASE":
      return "El cobro no es válido. Pide al comercio que lo genere de nuevo.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "Este intento ya se usó para otra compra. Genera el cobro de nuevo.";
    case "PAYMENT_NOT_STARTED":
      return "La compra se detuvo antes de crear el pago en PayPal. No se cobró nada. Genera el cobro de nuevo.";
    default:
      return "Algo salió mal. Intenta de nuevo.";
  }
}

export const TRUST_LEVEL_LABEL: Record<TrustLevel, string> = {
  SELF_DECLARED: "Declarada por el comercio",
  PROVIDER_VERIFIED: "Verificada por la billetera",
  EXTERNAL_VERIFIED: "Verificada en un registro oficial",
};

export const CORROBORATION_LABEL: Record<Corroboration, string> = {
  CONTRADICTED: "Contradicha por otra fuente",
  UNCORROBORATED: "Sin corroborar",
  REGISTRY_UNBOUND: "Coincide con un registro, sin vínculo verificado",
  PROVIDER_VERIFIED: "Corroborada por la billetera",
  EXTERNAL_VERIFIED: "Corroborada en un registro oficial",
};

export type PurchaseTone = "ok" | "wait" | "stop";

/**
 * Where a purchase stands, without ever calling a decision a payment: only a
 * payment PayPal captured is "realizado".
 */
export function purchaseStatus(purchase: Pick<PurchaseView, "outcome" | "payment">): { title: string; tone: PurchaseTone } {
  if (purchase.outcome === "DENY") return { title: "Compra no permitida", tone: "stop" };
  if (purchase.outcome === "REVIEW") return { title: "Compra retenida para revisión", tone: "wait" };
  if (purchase.payment.status === "NOT_CREATED") return { title: "No se pudo crear el pago", tone: "stop" };
  switch (purchase.payment.state) {
    case "COMPLETED":
      return { title: "Pago realizado", tone: "ok" };
    case "AWAITING_PAYER_APPROVAL":
      return { title: "Esperando aprobación en PayPal", tone: "wait" };
    case "CANCELLED":
      return { title: "Pago cancelado en PayPal", tone: "stop" };
    case "FAILED":
      return { title: "Pago no realizado", tone: "stop" };
    case "PENDING":
      return { title: "Pago en proceso", tone: "wait" };
  }
}

export function purchaseStatusLabel(purchase: Pick<PurchaseView, "outcome" | "payment">): string {
  return purchaseStatus(purchase).title;
}
