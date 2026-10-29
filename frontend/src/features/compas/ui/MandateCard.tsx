import type { ReactNode } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import type { MandateView } from "../api/contracts";
import { shareOf } from "../lib/amounts";
import { formatDate } from "../lib/dates";
import { categoryList, isAuthorized, payerStatusLabel, STATUS_LABEL } from "../lib/labels";
import { ChevronRightIcon } from "./icons";
import { StatusBadge } from "./primitives";
import { Avatar, CategoryStack } from "./visuals";

/** A thin version of the capacity route: the solid stretch is permission still available. */
export function CapacityBar({ mandate }: { mandate: Pick<MandateView, "status" | "viewerRole" | "authorization" | "budget" | "remainingAuthorizedAmount"> }) {
  const share = isAuthorized(mandate) ? shareOf(mandate.remainingAuthorizedAmount.value, mandate.budget.value) : 0;
  const live = mandate.status === "ACTIVE";
  return (
    <span aria-hidden="true" className="relative block h-1.5 overflow-hidden rounded-full bg-(--cx-line)">
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${live ? "bg-(--cx-route)" : "bg-(--cx-muted)/50"}`}
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}

/**
 * One budget in a list, as the viewer sees it. The whole card opens the
 * detail; `action` adds a button below it (Andrea's "Pay with COMPAS").
 */
export function MandateCard({ mandate, onOpen, action }: { mandate: MandateView; onOpen: () => void; action?: ReactNode }) {
  const asPayer = mandate.viewerRole === "PAYER";
  const person = asPayer ? mandate.delegate : mandate.payer;
  const authorized = isAuthorized(mandate);
  const amount = authorized ? mandate.remainingAuthorizedAmount : mandate.budget;
  return (
    <div className="rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-(--cx-radius) p-4 text-left transition-colors hover:bg-(--cx-card)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-focus)"
      >
        <span className="flex items-center gap-3">
          <Avatar name={person.displayName} seed={person.id} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-(--cx-ink)">
              {asPayer ? person.displayName : `From ${person.displayName}`}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-(--cx-muted)">
              <CategoryStack categories={mandate.purposePolicy.eligibleCategories} />
              <span className="truncate">{categoryList(mandate.purposePolicy.eligibleCategories)}</span>
            </span>
          </span>
          <StatusBadge status={mandate.status} label={asPayer ? payerStatusLabel(mandate) : STATUS_LABEL[mandate.status]} />
        </span>
        <span className="mt-3.5 block">
          <span className={`text-[22px] font-semibold tracking-tight whitespace-nowrap tabular-nums ${mandate.status === "ACTIVE" ? "text-(--cx-ink)" : "text-(--cx-muted)"}`}>
            {formatMoneyAmount(amount)}
          </span>
          <span className="ml-1.5 text-[12px] text-(--cx-muted)">{authorized ? "available" : "to authorize"}</span>
        </span>
        <span className="mt-2 block">
          <CapacityBar mandate={mandate} />
        </span>
        <span className="mt-2 flex items-center justify-between text-[12px] text-(--cx-muted)">
          Until {formatDate(mandate.expiresAt)}
          <ChevronRightIcon className="size-4" />
        </span>
      </button>
      {action ? <div className="px-4 pb-4">{action}</div> : null}
    </div>
  );
}
