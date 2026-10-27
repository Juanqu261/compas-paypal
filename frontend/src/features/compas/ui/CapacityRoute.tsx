import { formatMoneyAmount } from "@/lib/format-money";
import type { MandateView } from "../api/contracts";
import { shareOf } from "../lib/amounts";
import { capacityLabel, isAuthorized } from "../lib/labels";

/**
 * COMPAS's signature: the authorized capacity drawn as a route on a chart.
 * The solid magenta stretch is permission still available. It is permission,
 * never a balance, so the label says "capacidad", not "saldo". Before the
 * payer confirms, nothing is drawn as available: the route is only dotted.
 * Built from spans so it is valid inside a button.
 */
export function CapacityRoute({ mandate }: { mandate: Pick<MandateView, "status" | "viewerRole" | "authorization" | "budget" | "remainingAuthorizedAmount"> }) {
  const authorized = isAuthorized(mandate);
  const live = mandate.status === "ACTIVE";
  const share = authorized ? shareOf(mandate.remainingAuthorizedAmount.value, mandate.budget.value) : 0;
  const amount = authorized ? mandate.remainingAuthorizedAmount : mandate.budget;
  const caption = authorized
    ? `de ${formatMoneyAmount(mandate.budget)} autorizados`
    : "Aún no hay permiso: falta autorizarlo";
  const description = authorized
    ? `Quedan ${formatMoneyAmount(mandate.remainingAuthorizedAmount)} de ${formatMoneyAmount(mandate.budget)} autorizados`
    : `${formatMoneyAmount(mandate.budget)} sin autorizar`;
  return (
    <span className="block">
      <span className="block text-[13px] text-(--cx-muted)">{capacityLabel(mandate)}</span>
      <span
        className={`mt-0.5 block text-[26px] leading-tight font-semibold tracking-tight tabular-nums ${live ? "text-(--cx-ink)" : "text-(--cx-muted)"}`}
      >
        {formatMoneyAmount(amount)}
      </span>
      <span role="img" aria-label={description} className="relative mt-3 block h-3">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t-2 border-dotted border-(--cx-line-strong)" />
        {share > 0 ? (
          <span
            aria-hidden="true"
            className={`absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full ${live ? "bg-(--cx-route)" : "bg-(--cx-muted)/60"}`}
            style={{ width: `${share * 100}%` }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 bg-(--cx-surface) ${live ? "border-(--cx-route)" : "border-(--cx-muted)"}`}
          style={{ left: `${share * 100}%` }}
        />
      </span>
      <span className="mt-2 block text-[12px] text-(--cx-muted) tabular-nums">{caption}</span>
    </span>
  );
}
