import { formatMoneyAmount } from "@/lib/format-money";
import type { ActivityEntry, ActivityKind } from "../api/contracts";
import { formatDateTime } from "../lib/dates";
import { activityLabel, activityReason } from "../lib/labels";
import { CheckIcon, ClockIcon, EyeIcon, PauseIcon, StopIcon } from "./icons";

const KIND_LOOK: Record<ActivityKind, { Icon: typeof CheckIcon; tone: string }> = {
  COMPLETED: { Icon: CheckIcon, tone: "bg-(--cx-ok)/12 text-(--cx-ok)" },
  PENDING: { Icon: ClockIcon, tone: "bg-(--cx-warn-soft) text-(--cx-warn)" },
  FAILED: { Icon: StopIcon, tone: "bg-(--cx-card) text-(--cx-muted)" },
  DENIED: { Icon: StopIcon, tone: "bg-(--cx-danger)/10 text-(--cx-danger)" },
  REVIEW: { Icon: PauseIcon, tone: "bg-(--cx-warn-soft) text-(--cx-warn)" },
};

/** What the amount next to an attempt is. Only a completed payment says "debitado". */
function amountNote(entry: ActivityEntry): string {
  if (!entry.debitAmount) return "solicitado";
  if (entry.kind === "COMPLETED") return "debitado";
  if (entry.kind === "PENDING") return "por confirmar";
  if (entry.kind === "FAILED") return "no completado";
  return "cotizado";
}

/**
 * Attempts under one budget, newest first. A pending payment says "en
 * proceso" and is never shown as paid. An attempt that never reached a quote
 * shows what the merchant asked for, labeled as such.
 */
export function ActivityList({ entries }: { entries: readonly ActivityEntry[] }) {
  return (
    <ul className="divide-y divide-(--cx-line)">
      {entries.map((entry) => {
        const look = KIND_LOOK[entry.kind];
        const Glyph = entry.monitoredException && entry.kind === "COMPLETED" ? EyeIcon : look.Icon;
        const reason = activityReason(entry.kind, entry.reasonCodes);
        const amount = entry.debitAmount ?? entry.requestedAmount;
        const paid = entry.kind === "COMPLETED";
        return (
          <li key={entry.id} className="flex gap-3 py-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${look.tone}`}>
              <Glyph className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-(--cx-ink)">{entry.merchantDisplayName ?? "Comercio"}</p>
              <p className="text-[13px] text-(--cx-ink)">{activityLabel(entry.kind, entry.monitoredException)}</p>
              {reason ? <p className="text-[12px] leading-snug text-(--cx-muted)">{reason}</p> : null}
              <p className="text-[12px] text-(--cx-muted)">{formatDateTime(entry.recordedAt)}</p>
            </div>
            <div className="text-right">
              <p className={`text-[14px] font-semibold tabular-nums ${paid ? "text-(--cx-ink)" : "text-(--cx-muted)"} ${entry.kind === "DENIED" || entry.kind === "FAILED" ? "line-through decoration-1" : ""}`}>
                {formatMoneyAmount(amount)}
              </p>
              <p className="text-[11px] text-(--cx-muted)">{amountNote(entry)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
