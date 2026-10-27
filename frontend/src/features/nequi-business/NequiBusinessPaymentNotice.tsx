"use client";

import { useEffect, useState } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import { chargePaymentCompleted } from "@/features/demo/demo-charge";
import { useDemoSession } from "@/features/demo/DemoSession";
import { formatMoneyAmount } from "@/lib/format-money";
import { CloseIcon } from "./NequiBusinessIcons";

const VISIBLE_MS = 8000;

/**
 * A push-style notice at the top of the merchant's phone, once per charge,
 * when PayPal captured the COMPAS payment. Never for an order still waiting
 * for the payer, or a pending capture. The amount is the shop's own charge.
 */
export function NequiBusinessPaymentNotice() {
  const { charge } = useDemoSession();
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const shown = charge && chargePaymentCompleted(charge) && dismissedId !== charge.id ? charge : null;
  const shownId = shown?.id ?? null;

  useEffect(() => {
    if (!shownId) return;
    const timer = setTimeout(() => setDismissedId(shownId), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shownId]);

  if (!shown) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3 pt-3">
      <div
        role="status"
        className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-white/95 p-3 shadow-[0_8px_24px_rgb(43_0_43/0.22)] ring-1 ring-(--nb-line) backdrop-blur transition-[translate,opacity] duration-300 ease-out starting:-translate-y-4 starting:opacity-0 motion-reduce:transition-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-(--nb-line)">
          <CompasMark className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">Pago recibido</p>
          <p className="text-[13px] leading-snug">
            Recibiste {formatMoneyAmount(shown.amount)} en {shown.merchantDisplayName} con COMPAS. PayPal
            confirmó el pago.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissedId(shown.id)}
          aria-label="Cerrar aviso"
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}
