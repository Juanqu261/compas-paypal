"use client";

import { useState } from "react";
import type { DemoCharge } from "@/features/demo/DemoSession";
import { formatMoneyAmount } from "@/lib/format-money";
import { CompasApiError, compasApi, errorCode, newIdempotencyKey } from "../api/client";
import type { MandateView, PurchaseBody, PurchasePreview, PurchaseView } from "../api/contracts";
import {
  CATEGORY_LABEL,
  categoryList,
  errorText,
  purchaseStatusLabel,
  reasonText,
  TRUST_LEVEL_LABEL,
} from "../lib/labels";
import { Button, Facts, Notice } from "../ui/primitives";

type ChargeResult = NonNullable<DemoCharge["result"]>;

/** A failure that may have left a payment behind. Only the same idempotency key may ask again. */
function outcomeUnknown(code: string, status: number): boolean {
  return code === "PAYMENT_OUTCOME_UNKNOWN" || status === 0 || (status >= 500 && code === "BACKEND_UNAVAILABLE");
}

function PreviewResult({ preview }: { preview: PurchasePreview }) {
  const check = preview.purposeCheck;
  const reasons = [...preview.mandateRules.reasonCodes, ...(check?.reasonCodes ?? [])];
  return (
    <div className="space-y-3">
      {preview.next === "QUOTE" ? (
        <Notice title="Pasa las comprobaciones previas">
          El presupuesto, el comercio y los productos cumplen las reglas que COMPAS puede revisar antes de pagar.
          Esto todavía no es una aprobación: falta la cotización de Open Payments y comprobar que alcance el
          presupuesto.
        </Notice>
      ) : (
        <Notice tone="danger" title={preview.next === "STOP_DENY" ? "COMPAS rechazaría esta compra" : "COMPAS retendría esta compra"}>
          Se detendría aquí, antes de pedir cualquier pago a la billetera.
        </Notice>
      )}
      {reasons.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-(--cx-ink)">
          {reasons.map((code) => (
            <li key={code}>{reasonText(code)}</li>
          ))}
        </ul>
      ) : null}
      <Facts
        rows={[
          {
            label: "Categorías del comercio",
            value:
              preview.merchantCategories.length > 0
                ? preview.merchantCategories.map((item) => `${CATEGORY_LABEL[item.category]} (${TRUST_LEVEL_LABEL[item.trustLevel].toLowerCase()})`).join(", ")
                : "Ninguna verificada",
          },
          ...(check?.merchantConfidence ? [{ label: "Confianza del comercio", value: check.merchantConfidence }] : []),
          ...(check ? [{ label: "Modo", value: check.enforced ? "Estricto" : "Supervisado: no bloquea" }] : []),
        ]}
      />
    </div>
  );
}

function PurchaseResult({ purchase }: { purchase: PurchaseView }) {
  const tone = purchase.outcome === "ALLOW" ? "info" : "danger";
  return (
    <div className="space-y-3">
      <Notice tone={tone} title={purchaseStatusLabel(purchase)}>
        {purchase.outcome === "ALLOW"
          ? "Que COMPAS permita la compra no significa que el pago esté completo. El estado viene de la billetera."
          : "El dinero sigue en la billetera de quien te autorizó."}
      </Notice>
      {purchase.reasonCodes.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-(--cx-ink)">
          {purchase.reasonCodes.map((code) => (
            <li key={code}>{reasonText(code)}</li>
          ))}
        </ul>
      ) : null}
      <Facts
        rows={[
          { label: "Cobro del comercio", value: formatMoneyAmount(purchase.requestedAmount) },
          ...(purchase.debitAmount ? [{ label: "Cotizado a la billetera", value: formatMoneyAmount(purchase.debitAmount) }] : []),
        ]}
      />
    </div>
  );
}

/**
 * Andrea's side of a charge: the backend checks it, then pays it only if the
 * operator enabled demo purchases. The browser decides nothing. The charge
 * itself is simulated and arrives from the merchant's phone in this browser.
 */
export function DelegateCheckout({
  partyId,
  mandate,
  charge,
  onResult,
  onPurchased,
}: {
  partyId: string;
  mandate: MandateView;
  charge: DemoCharge | null;
  onResult: (chargeId: string, result: ChargeResult) => void;
  onPurchased: () => void;
}) {
  // One key per charge, kept so that asking again about an unclear attempt can't pay twice.
  const [attempt, setAttempt] = useState<{ chargeId: string; key: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "pay" | null>(null);
  const [local, setLocal] = useState<{ chargeId: string; result: ChargeResult; uncertain?: boolean } | null>(null);

  if (!charge) {
    return (
      <Notice title="No tienes cobros pendientes">
        Cuando un comercio con COMPAS te cobre, el cobro aparecerá aquí para que lo revises antes de pagar. En la
        demostración de tres teléfonos lo genera Nequi Negocios.
      </Notice>
    );
  }

  const current = charge;
  const shown = local?.chargeId === current.id ? local : null;
  const body: PurchaseBody = {
    mandateId: mandate.id,
    merchantId: charge.merchantId,
    amount: charge.amount,
    lineItems: charge.lineItems,
  };
  const categories = [...new Set(charge.lineItems.flatMap((line) => (line.category ? [line.category] : [])))];

  function settle(result: ChargeResult, uncertain = false) {
    setLocal({ chargeId: current.id, result, uncertain });
    onResult(current.id, result);
  }

  async function review() {
    setBusy("preview");
    try {
      settle({ kind: "PREVIEW", preview: await compasApi.previewPurchase(partyId, body) });
    } catch (error) {
      settle({ kind: "ERROR", code: errorCode(error) });
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    const key = attempt?.chargeId === current.id ? attempt.key : newIdempotencyKey();
    setAttempt({ chargeId: current.id, key });
    setBusy("pay");
    try {
      const { purchase } = await compasApi.purchase(partyId, { ...body, idempotencyKey: key });
      settle({ kind: "PURCHASE", purchase });
      onPurchased();
    } catch (error) {
      const status = error instanceof CompasApiError ? error.status : 0;
      settle({ kind: "ERROR", code: errorCode(error) }, outcomeUnknown(errorCode(error), status));
      onPurchased();
    } finally {
      setBusy(null);
    }
  }

  const paid = shown?.result.kind === "PURCHASE";
  const preview = shown?.result.kind === "PREVIEW" ? shown.result.preview : undefined;
  const paymentsOff = preview && preview.execution !== "ENABLED";
  // Asking again with the same key is safe: the backend replays the first attempt.
  const canAskAgain =
    shown?.result.kind === "ERROR" && (shown.uncertain === true || shown.result.code === "PAYMENT_NOT_STARTED");
  const canPay = preview !== undefined && preview.execution === "ENABLED" && preview.next === "QUOTE";

  return (
    <div className="space-y-4">
      <div className="rounded-(--cx-radius) border border-(--cx-line) p-3.5">
        <p className="text-[12px] font-semibold tracking-wide text-(--cx-muted) uppercase">Cobro simulado de demostración</p>
        <p className="mt-1 text-[15px] font-semibold text-(--cx-ink)">{charge.merchantDisplayName}</p>
        <p className="text-[20px] font-semibold text-(--cx-ink) tabular-nums">{formatMoneyAmount(charge.amount)}</p>
        <p className="text-[13px] text-(--cx-muted)">
          {categories.length > 0 ? `Productos de ${categoryList(categories).toLowerCase()}` : "Productos sin categoría"}
        </p>
      </div>

      {shown?.result.kind === "PREVIEW" ? <PreviewResult preview={shown.result.preview} /> : null}
      {shown?.result.kind === "PURCHASE" ? <PurchaseResult purchase={shown.result.purchase} /> : null}
      {shown?.result.kind === "ERROR" ? (
        <Notice tone={shown.uncertain ? "warn" : "danger"} title={shown.uncertain ? "No sabemos si se pagó" : "No se pudo completar"}>
          {shown.uncertain && shown.result.code !== "PAYMENT_OUTCOME_UNKNOWN"
            ? "Se perdió la conexión mientras COMPAS procesaba el pago. Consulta de nuevo: no se pagará dos veces."
            : errorText(shown.result.code)}
        </Notice>
      ) : null}
      {paymentsOff ? (
        <Notice tone="warn" title="El pago no está habilitado aquí">
          {errorText(preview.execution)}
        </Notice>
      ) : null}

      {!paid ? (
        <div className="space-y-2">
          <Button variant="secondary" onClick={review} disabled={busy !== null}>
            {busy === "preview" ? "Revisando…" : "Revisar con COMPAS"}
          </Button>
          <Button onClick={pay} disabled={busy !== null || !(canPay || canAskAgain)}>
            {busy === "pay"
              ? "Procesando…"
              : canAskAgain
                ? "Consultar de nuevo"
                : `Pagar ${formatMoneyAmount(charge.amount)}`}
          </Button>
          <p className="text-[12px] leading-snug text-(--cx-muted)">
            Primero revisa el cobro. COMPAS decide en el servidor y solo paga si la compra cumple las reglas de{" "}
            {mandate.payer.displayName}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
