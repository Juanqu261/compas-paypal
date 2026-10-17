import type {
  ActivityKind,
  CompasCategory,
  ConfidenceMinimum,
  Corroboration,
  Enforcement,
  MandateStatus,
  MandateView,
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
  PENDING_AUTHORIZATION: "Esperando autorización",
  ACTIVE: "Activo",
  EXHAUSTED: "Agotado",
  EXPIRED: "Vencido",
  REVOKED: "Revocado",
};

/** A tone for the badge. The label always carries the meaning too. */
export function statusTone(status: MandateStatus): "ok" | "wait" | "off" | "draft" {
  if (status === "ACTIVE") return "ok";
  if (status === "PENDING_AUTHORIZATION") return "wait";
  if (status === "DRAFT") return "draft";
  return "off";
}

/**
 * Whether the payer ever granted this permission at their wallet. A draft or
 * a budget waiting for consent authorizes nothing yet, so its amount is
 * "por autorizar", never "autorizado". A delegate only ever sees consented ones.
 */
export function isAuthorized(mandate: Pick<MandateView, "status" | "viewerRole" | "authorization">): boolean {
  if (mandate.status === "ACTIVE" || mandate.status === "EXHAUSTED") return true;
  if (mandate.status === "DRAFT" || mandate.status === "PENDING_AUTHORIZATION") return false;
  return mandate.viewerRole === "DELEGATE" || mandate.authorization?.consent === "GRANTED";
}

/** What the capacity figure means in this state. */
export function capacityLabel(mandate: Pick<MandateView, "status" | "viewerRole" | "authorization">): string {
  switch (mandate.status) {
    case "ACTIVE":
      return "Capacidad autorizada disponible";
    case "DRAFT":
    case "PENDING_AUTHORIZATION":
      return "Monto por autorizar";
    case "EXHAUSTED":
      return "Capacidad agotada";
    case "EXPIRED":
      return isAuthorized(mandate) ? "Venció sin usar" : "Venció sin autorizarse";
    case "REVOKED":
      return isAuthorized(mandate) ? "Revocado sin usar" : "Descartado sin autorizarse";
  }
}

/** The status as the payer reads it, including a cancellation still pending at the wallet. */
export function payerStatusLabel(mandate: Pick<MandateView, "status" | "authorization">): string {
  if (mandate.status === "REVOKED" && mandate.authorization?.grantCancellation === "PENDING") {
    return "Revocado, falta confirmar en tu billetera";
  }
  return STATUS_LABEL[mandate.status];
}

export const CATEGORY_LABEL: Record<CompasCategory, string> = {
  MEDICATION: "Medicamentos",
  FOOD: "Alimentos",
  PERSONAL_CARE: "Cuidado personal",
  ALCOHOL: "Bebidas alcohólicas",
  TOBACCO: "Tabaco",
};

export const CATEGORY_DESCRIPTION: Record<CompasCategory, string> = {
  MEDICATION: "Droguerías y farmacias, con medicamentos de fórmula o de venta libre.",
  FOOD: "Mercado y alimentos en tiendas, supermercados y plazas.",
  PERSONAL_CARE: "Productos de aseo e higiene personal.",
  ALCOHOL: "Licoreras y bebidas alcohólicas.",
  TOBACCO: "Cigarrillos y productos de tabaco.",
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
  ENFORCED: "Estricto",
  MONITORED: "Supervisado",
};

export const ENFORCEMENT_DESCRIPTION: Record<Enforcement, string> = {
  ENFORCED:
    "Solo se podrán pagar compras que cumplan las condiciones que establezcas. Si falta información suficiente, el pago no continuará automáticamente.",
  MONITORED:
    "Permitirás también compras que no cumplan completamente el propósito. COMPAS registrará las excepciones para que puedas revisarlas después.",
};

export const MONITORED_WARNING =
  "Con el modo supervisado, una compra que no cumpla el propósito igual se pagará, hasta el límite del presupuesto. Esto no significa que el comercio sea seguro. La vigencia, la persona autorizada y el monto máximo siguen aplicando siempre.";

export const CONFIDENCE_LABEL: Record<ConfidenceMinimum, string> = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Básica",
};

export const CONFIDENCE_DESCRIPTION: Record<ConfidenceMinimum, string> = {
  HIGH: "Solo comercios cuya actividad confirmó alguien independiente, como su billetera o un registro oficial.",
  MEDIUM: "También comercios con evidencia parcial, como una coincidencia con el registro mercantil o compras anteriores confirmadas.",
  LOW: "También comercios con evidencia limitada, como su propia declaración. Conviene ponerle un límite por compra.",
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
};

export function reasonText(code: string): string {
  return (REASON_TEXT as Record<string, string>)[code] ?? "Motivo no reconocido";
}

export function activityLabel(kind: ActivityKind, monitoredException: boolean): string {
  switch (kind) {
    case "COMPLETED":
      return monitoredException ? "Pagada bajo supervisión" : "Pagada";
    case "PENDING":
      return "Pago en proceso";
    case "FAILED":
      return "Pago fallido";
    case "DENIED":
      return "Rechazada";
    case "REVIEW":
      return "Retenida para revisión";
  }
}

/** The one reason worth showing next to an attempt that did not pay normally. */
export function activityReason(kind: ActivityKind, codes: readonly string[]): string | undefined {
  if (kind === "COMPLETED" || kind === "PENDING") {
    const purposeCode = codes.find((code) => code !== "PAYER_MONITORED_EXCEPTION");
    return codes.includes("PAYER_MONITORED_EXCEPTION") && purposeCode ? reasonText(purposeCode) : undefined;
  }
  if (kind === "FAILED") return "La billetera no completó el pago. No se debitó nada por esta compra.";
  return codes.length > 0 ? reasonText(codes[0]) : undefined;
}

/** API error codes, said plainly with what to do next. */
export function errorText(code: string): string {
  switch (code) {
    case "OPEN_PAYMENTS_NOT_CONFIGURED":
    case "NOT_CONFIGURED":
      return "Este entorno no tiene Open Payments configurado, así que no se puede pedir la autorización a tu billetera.";
    case "PAYER_GRANTS_DISABLED_FOR_DEMO":
      return "En este modo de demostración no se le pide autorización a una billetera real. El presupuesto queda guardado sin activar.";
    case "PAYER_WALLET_NOT_CONFIGURED":
      return "Tu billetera de Open Payments no está configurada en este entorno.";
    case "AUTHORIZATION_FAILED":
    case "UPSTREAM":
      return "Tu billetera no respondió a la solicitud. Intenta de nuevo en unos minutos.";
    case "ASSET_MISMATCH":
      return "El presupuesto no está en la moneda de tu billetera.";
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
      return "En este modo de demostración no se pagan compras con una billetera real. COMPAS no registró ni pagó nada.";
    case "UNKNOWN_MERCHANT":
      return "Este comercio no recibe pagos con COMPAS en este entorno.";
    case "INVALID_PURCHASE":
      return "El cobro no es válido. Pide al comercio que lo genere de nuevo.";
    case "GRANT_NOT_ACTIVE":
      return "La billetera de quien paga no tiene un permiso activo para este presupuesto. No se pagó nada.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "Este intento ya se usó para otra compra. Genera el cobro de nuevo.";
    case "PAYMENT_NOT_STARTED":
      return "La compra se detuvo antes de pedir el pago. No se pagó nada. Puedes intentarlo de nuevo.";
    case "PAYMENT_OUTCOME_UNKNOWN":
      return "Pedimos el pago, pero la billetera no confirmó qué pasó. No lo repitas: revisa los movimientos del presupuesto.";
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

/** Where a purchase stands, without ever calling a decision a payment. */
export function purchaseStatusLabel(purchase: Pick<PurchaseView, "outcome" | "payment">): string {
  if (purchase.outcome === "DENY") return "Rechazada por COMPAS. No se creó ningún pago.";
  if (purchase.outcome === "REVIEW") return "Retenida para revisión. No se creó ningún pago.";
  if (purchase.payment.status === "NOT_CREATED") return "COMPAS la permitió, pero no se creó el pago.";
  if (purchase.payment.state === "COMPLETED") return "Pagada: la billetera confirmó el pago.";
  if (purchase.payment.state === "FAILED") return "El pago falló. No se debitó nada.";
  return "Pago en proceso: la billetera aún no lo confirma.";
}
