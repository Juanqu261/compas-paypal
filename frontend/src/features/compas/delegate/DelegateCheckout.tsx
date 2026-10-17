"use client";

import { useRef, useState, type ReactNode } from "react";
import type { DemoCharge } from "@/features/demo/DemoSession";
import { formatMoneyAmount } from "@/lib/format-money";
import { CompasApiError, compasApi, errorCode, newIdempotencyKey } from "../api/client";
import type { CompasCategory, MandateView, PolicyReasonCode, PurchaseBody, PurchasePreview, PurchaseView } from "../api/contracts";
import { CATEGORY_LABEL, categoryList, errorText, purchaseStatus, type PurchaseTone, reasonText } from "../lib/labels";
import { AlertIcon, CheckIcon, ClockIcon, ReceiptIcon, StopIcon, StoreIcon } from "../ui/icons";
import { Button, Notice } from "../ui/primitives";
import { CategoryBadge, CategoryStack, StepBar } from "../ui/visuals";

type ChargeResult = NonNullable<DemoCharge["result"]>;

export const PAY_STEPS = ["Presupuesto", "Cobro", "Revisión", "Pago"] as const;

/** A failure that may have left a payment behind. Only the same idempotency key may ask again. */
function outcomeUnknown(code: string, status: number): boolean {
  return code === "PAYMENT_OUTCOME_UNKNOWN" || status === 0 || (status >= 500 && code === "BACKEND_UNAVAILABLE");
}

const MERCHANT_CODES: readonly PolicyReasonCode[] = [
  "MERCHANT_NOT_ELIGIBLE",
  "MERCHANT_EVIDENCE_INSUFFICIENT",
  "MERCHANT_EVIDENCE_CONFLICT",
  "MERCHANT_HISTORY_CONTRADICTS",
  "MERCHANT_CONFIDENCE_LIMIT_EXCEEDED",
];
const LINE_CODES: readonly PolicyReasonCode[] = ["PURPOSE_MISMATCH", "CLASSIFICATION_UNCERTAIN"];

type CheckState = "pass" | "fail" | "warn" | "later";

const CHECK_LOOK: Record<CheckState, { Icon: typeof CheckIcon; tone: string }> = {
  pass: { Icon: CheckIcon, tone: "bg-(--cx-ok)/12 text-(--cx-ok)" },
  fail: { Icon: StopIcon, tone: "bg-(--cx-danger)/10 text-(--cx-danger)" },
  warn: { Icon: AlertIcon, tone: "bg-(--cx-warn-soft) text-(--cx-warn)" },
  later: { Icon: ClockIcon, tone: "bg-(--cx-card) text-(--cx-muted)" },
};

function Check({ state, title, detail }: { state: CheckState; title: string; detail?: string }) {
  const look = CHECK_LOOK[state];
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${look.tone}`}>
        <look.Icon className="size-4" />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[14px] font-medium text-(--cx-ink)">{title}</span>
        {detail ? <span className="block text-[12px] leading-snug text-(--cx-muted)">{detail}</span> : null}
      </span>
    </li>
  );
}

/** What the backend checked before Open Payments, one row per rule. The backend decided each row. */
function PreviewChecks({ preview, payer }: { preview: PurchasePreview; payer: string }) {
  const codes = preview.purposeCheck?.reasonCodes ?? [];
  const enforced = preview.purposeCheck?.enforced ?? true;
  const failed = enforced ? "fail" : "warn";
  const merchantCode = codes.find((code) => MERCHANT_CODES.includes(code));
  const lineCode = codes.find((code) => LINE_CODES.includes(code));
  const ruleCode = preview.mandateRules.reasonCodes[0];
  return (
    <ul className="divide-y divide-(--cx-line)">
      <Check
        state={preview.mandateRules.passed ? "pass" : "fail"}
        title="Presupuesto activo y vigente"
        detail={ruleCode ? reasonText(ruleCode) : undefined}
      />
      {preview.purposeCheck ? (
        <>
          <Check
            state={merchantCode ? failed : "pass"}
            title="Comercio permitido"
            detail={merchantCode ? reasonText(merchantCode) : undefined}
          />
          <Check
            state={lineCode ? failed : "pass"}
            title="Productos permitidos"
            detail={lineCode ? reasonText(lineCode) : undefined}
          />
          {!enforced && (merchantCode || lineCode) ? (
            <Check state="warn" title={`Se pagaría con aviso a ${payer}`} detail="Eligió permitir y avisarle." />
          ) : null}
        </>
      ) : null}
      {preview.next === "QUOTE" ? (
        <Check state="later" title="Monto dentro del presupuesto" detail="Se confirma con la cotización, al pagar." />
      ) : null}
    </ul>
  );
}

const TONE_LOOK: Record<PurchaseTone, { Icon: typeof CheckIcon; tile: string }> = {
  ok: { Icon: CheckIcon, tile: "bg-(--cx-ok) text-white" },
  wait: { Icon: ClockIcon, tile: "bg-(--cx-warn-soft) text-(--cx-warn)" },
  stop: { Icon: StopIcon, tile: "bg-(--cx-danger)/12 text-(--cx-danger)" },
};

/** The one result that matters, large. Only a confirmed payment says "Pago realizado". */
function ResultCard({ tone, title, children }: { tone: PurchaseTone; title: string; children?: ReactNode }) {
  const look = TONE_LOOK[tone];
  return (
    <div role="status" className="flex flex-col items-center rounded-(--cx-radius) border border-(--cx-line) px-4 py-5 text-center">
      <span className={`grid size-14 place-items-center rounded-full ${look.tile}`}>
        <look.Icon className="size-7" />
      </span>
      <p className="mt-3 text-[18px] font-semibold text-(--cx-ink)">{title}</p>
      {children ? <div className="mt-1 text-[13px] leading-snug text-(--cx-muted)">{children}</div> : null}
    </div>
  );
}

function PurchaseResult({ purchase, payer }: { purchase: PurchaseView; payer: string }) {
  const status = purchaseStatus(purchase);
  return (
    <ResultCard tone={status.tone} title={status.title}>
      {purchase.outcome !== "ALLOW" ? (
        <>
          <p>{purchase.reasonCodes[0] ? reasonText(purchase.reasonCodes[0]) : null}</p>
          <p className="mt-1">El dinero sigue en la billetera de {payer}.</p>
        </>
      ) : purchase.payment.status === "CREATED" ? (
        <p className="tabular-nums">
          {formatMoneyAmount(purchase.debitAmount ?? purchase.requestedAmount)} desde la billetera de {payer}
          {purchase.payment.state === "PENDING" ? ". La billetera aún no lo confirma." : "."}
        </p>
      ) : null}
    </ResultCard>
  );
}

/**
 * Andrea pays a charge under one budget. The backend checks it, then pays it
 * only if the operator enabled demo purchases. The browser decides nothing.
 * The charge is simulated and arrives from the merchant's phone in this browser.
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
  // Refs, not state: two taps in the same tick must see the same key and the same lock.
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<"preview" | "pay" | null>(null);
  const [local, setLocal] = useState<{ chargeId: string; result: ChargeResult; uncertain?: boolean } | null>(null);
  // The last preview of this charge, kept while a payment attempt shows its own result.
  const [checked, setChecked] = useState<{ chargeId: string; preview: PurchasePreview } | null>(null);

  const shown = charge && local?.chargeId === charge.id ? local : null;
  const preview = charge && checked?.chargeId === charge.id ? checked.preview : undefined;
  const purchase = shown?.result.kind === "PURCHASE" ? shown.result.purchase : undefined;
  const current = !charge ? 1 : purchase ? 4 : preview ? 3 : 2;

  const budgetRow = (
    <div className="flex items-center gap-3 rounded-(--cx-radius) bg-(--cx-card) px-3 py-2.5">
      <CategoryStack categories={mandate.purposePolicy.eligibleCategories} />
      <span className="min-w-0 flex-1 text-[13px] leading-tight text-(--cx-ink)">
        <span className="block truncate">De {mandate.payer.displayName}</span>
        <span className="sr-only">{categoryList(mandate.purposePolicy.eligibleCategories)}</span>
      </span>
      <span className="text-right text-[13px] leading-tight font-semibold text-(--cx-ink) tabular-nums">
        {formatMoneyAmount(mandate.remainingAuthorizedAmount)}
        <span className="block text-[11px] font-normal text-(--cx-muted)">disponible</span>
      </span>
    </div>
  );

  if (!charge) {
    return (
      <div className="space-y-5">
        <StepBar steps={PAY_STEPS} current={current} />
        {budgetRow}
        <div className="flex flex-col items-center rounded-(--cx-radius) border border-dashed border-(--cx-line-strong) px-4 py-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-(--cx-route)/10 text-(--cx-route)">
            <ReceiptIcon className="size-7" />
          </span>
          <p className="mt-3 text-[16px] font-semibold text-(--cx-ink)">Pídele al comercio que genere un cobro con COMPAS</p>
          <p role="status" className="mt-2 flex items-center gap-2 text-[13px] text-(--cx-muted)">
            <span className="size-2 animate-pulse rounded-full bg-(--cx-route) motion-reduce:animate-none" />
            Esperando cobro
          </p>
        </div>
      </div>
    );
  }

  const activeCharge = charge;
  const body: PurchaseBody = {
    mandateId: mandate.id,
    merchantId: activeCharge.merchantId,
    amount: activeCharge.amount,
    lineItems: activeCharge.lineItems,
  };
  const categories = [
    ...new Set(activeCharge.lineItems.flatMap((line) => (line.category ? [line.category] : []))),
  ] as CompasCategory[];

  function settle(result: ChargeResult, uncertain = false) {
    setLocal({ chargeId: activeCharge.id, result, uncertain });
    if (result.kind === "PREVIEW") setChecked({ chargeId: activeCharge.id, preview: result.preview });
    onResult(activeCharge.id, result);
  }

  async function review() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("preview");
    try {
      settle({ kind: "PREVIEW", preview: await compasApi.previewPurchase(partyId, body) });
    } catch (error) {
      settle({ kind: "ERROR", code: errorCode(error) });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    let key = keys.current.get(activeCharge.id);
    if (!key) {
      key = newIdempotencyKey();
      keys.current.set(activeCharge.id, key);
    }
    setBusy("pay");
    try {
      const { purchase: result } = await compasApi.purchase(partyId, { ...body, idempotencyKey: key });
      settle({ kind: "PURCHASE", purchase: result });
    } catch (error) {
      const status = error instanceof CompasApiError ? error.status : 0;
      settle({ kind: "ERROR", code: errorCode(error) }, outcomeUnknown(errorCode(error), status));
    } finally {
      inFlight.current = false;
      setBusy(null);
      onPurchased();
    }
  }

  const error = shown?.result.kind === "ERROR" ? shown.result : undefined;
  // Asking again with the same key is safe: the backend replays the first attempt.
  const canAskAgain = error !== undefined && (shown?.uncertain === true || error.code === "PAYMENT_NOT_STARTED");
  const canPay = preview !== undefined && preview.execution === "ENABLED" && preview.next === "QUOTE";

  return (
    <div className="space-y-5">
      <StepBar steps={PAY_STEPS} current={current} />

      <div className="rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--cx-card) text-(--cx-ink)">
            <StoreIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-(--cx-ink)">{activeCharge.merchantDisplayName}</p>
            <p className="text-[12px] text-(--cx-muted)">Cobro de demostración</p>
          </div>
        </div>
        <p className="mt-3 text-[28px] leading-tight font-semibold tracking-tight text-(--cx-ink) tabular-nums">
          {formatMoneyAmount(activeCharge.amount)}
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {categories.length > 0 ? (
            categories.map((category) => (
              <li key={category} className="flex items-center gap-1.5 rounded-full bg-(--cx-card) py-1 pr-3 pl-1 text-[13px] text-(--cx-ink)">
                <CategoryBadge category={category} size="sm" />
                {CATEGORY_LABEL[category]}
              </li>
            ))
          ) : (
            <li className="text-[13px] text-(--cx-muted)">Productos sin categoría</li>
          )}
        </ul>
        <div className="mt-3">{budgetRow}</div>
      </div>

      {purchase ? <PurchaseResult purchase={purchase} payer={mandate.payer.displayName} /> : null}

      {!purchase && preview ? (
        <div className="space-y-3">
          {preview.next === "QUOTE" ? (
            <ResultCard tone="ok" title="Cumple las reglas">
              Aún no es un pago.
            </ResultCard>
          ) : (
            <ResultCard
              tone={preview.next === "STOP_DENY" ? "stop" : "wait"}
              title={preview.next === "STOP_DENY" ? "Compra no permitida" : "Compra retenida para revisión"}
            >
              No se pidió ningún pago a la billetera de {mandate.payer.displayName}.
            </ResultCard>
          )}
          <PreviewChecks preview={preview} payer={mandate.payer.displayName} />
        </div>
      ) : null}

      {error ? (
        <Notice tone={shown?.uncertain ? "warn" : "danger"} title={shown?.uncertain ? "No sabemos si se pagó" : "No se pudo completar"}>
          {shown?.uncertain && error.code !== "PAYMENT_OUTCOME_UNKNOWN"
            ? "Se perdió la conexión mientras se procesaba. Consulta de nuevo: no se pagará dos veces."
            : errorText(error.code)}
        </Notice>
      ) : null}

      {!purchase ? (
        <div className="space-y-2">
          {!preview && !canAskAgain ? (
            <Button onClick={review} disabled={busy !== null}>
              {busy === "preview" ? "Revisando…" : "Revisar compra"}
            </Button>
          ) : null}
          {canPay || canAskAgain ? (
            <Button onClick={pay} disabled={busy !== null}>
              {busy === "pay"
                ? "Procesando…"
                : canAskAgain
                  ? shown?.uncertain
                    ? "Consultar de nuevo"
                    : "Intentar de nuevo"
                  : `Confirmar pago de ${formatMoneyAmount(activeCharge.amount)}`}
            </Button>
          ) : null}
          {preview && preview.next === "QUOTE" && preview.execution !== "ENABLED" ? (
            <Notice tone="warn" title="Pago desactivado en esta demostración">
              {errorText(preview.execution)}
            </Notice>
          ) : null}
          {preview ? (
            <Button variant="secondary" onClick={review} disabled={busy !== null}>
              Revisar de nuevo
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
