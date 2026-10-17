import { formatMoneyAmount } from "@/lib/format-money";
import type { MandateView } from "../api/contracts";
import { formatDate } from "../lib/dates";
import { ENFORCEMENT_LABEL, payerStatusLabel, purposeTitle, STATUS_LABEL } from "../lib/labels";
import { CapacityRoute } from "./CapacityRoute";
import { ChevronRightIcon } from "./icons";
import { StatusBadge } from "./primitives";

/** One budget in a list. The whole card is one button that opens its detail. */
export function MandateCard({ mandate, onOpen }: { mandate: MandateView; onOpen: () => void }) {
  const asPayer = mandate.viewerRole === "PAYER";
  const people = asPayer
    ? `Paga ${mandate.delegate.displayName}`
    : `Autorizado por ${mandate.payer.displayName}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) p-4 text-left transition-colors hover:bg-(--cx-card)/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-focus)"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[15px] leading-snug font-semibold text-(--cx-ink)">{purposeTitle(mandate)}</span>
          <span className="mt-0.5 block text-[13px] text-(--cx-muted)">
            {people}. Modo {ENFORCEMENT_LABEL[mandate.purposePolicy.enforcement].toLowerCase()}.
          </span>
        </span>
        <StatusBadge status={mandate.status} label={asPayer ? payerStatusLabel(mandate) : STATUS_LABEL[mandate.status]} />
      </span>
      <span className="mt-4 block">
        <CapacityRoute mandate={mandate} />
      </span>
      <span className="mt-3 flex items-center justify-between gap-2 border-t border-(--cx-line) pt-3 text-[13px] text-(--cx-muted)">
        <span className="tabular-nums">
          Presupuesto {formatMoneyAmount(mandate.budget)}, hasta el {formatDate(mandate.expiresAt)}
        </span>
        <ChevronRightIcon className="size-4 shrink-0" />
      </span>
    </button>
  );
}
