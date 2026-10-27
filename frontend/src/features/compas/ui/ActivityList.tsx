"use client";

import { useState } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import type { ActivityEntry, ActivityKind } from "../api/contracts";
import { formatDateTime } from "../lib/dates";
import { activityLabel, activityReason, payPalApprovalUrl } from "../lib/labels";
import { CheckIcon, ClockIcon, EyeIcon, PauseIcon, ShieldIcon, StopIcon } from "./icons";

const KIND_LOOK: Record<ActivityKind, { Icon: typeof CheckIcon; tone: string }> = {
  COMPLETED: { Icon: CheckIcon, tone: "bg-(--cx-ok)/12 text-(--cx-ok)" },
  PENDING: { Icon: ClockIcon, tone: "bg-(--cx-warn-soft) text-(--cx-warn)" },
  AWAITING_APPROVAL: { Icon: ClockIcon, tone: "bg-(--cx-route)/10 text-(--cx-route)" },
  CANCELLED: { Icon: StopIcon, tone: "bg-(--cx-card) text-(--cx-muted)" },
  FAILED: { Icon: StopIcon, tone: "bg-(--cx-card) text-(--cx-muted)" },
  DENIED: { Icon: StopIcon, tone: "bg-(--cx-danger)/10 text-(--cx-danger)" },
  REVIEW: { Icon: PauseIcon, tone: "bg-(--cx-warn-soft) text-(--cx-warn)" },
};

/** What the amount next to an attempt is. Only a payment PayPal captured says "cobrado". */
function amountNote(kind: ActivityKind): string {
  switch (kind) {
    case "COMPLETED":
      return "cobrado";
    case "PENDING":
      return "por confirmar";
    case "AWAITING_APPROVAL":
      return "por aprobar";
    case "CANCELLED":
    case "FAILED":
      return "no cobrado";
    default:
      return "solicitado";
  }
}

/**
 * Opens the PayPal page where the payer approves this exact order, in a new
 * tab, so the demo keeps its state here. PayPal sends that tab back to
 * COMPAS, which captures the order; this screen picks it up on its next read.
 */
function ApproveAtPayPal({ href }: { href: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        onClick={() => {
          window.open(href, "_blank", "noopener,noreferrer");
          setOpened(true);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--cx-route) px-3.5 text-[13px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-focus)"
      >
        <ShieldIcon className="size-4" />
        {opened ? "Abrir PayPal de nuevo" : "Aprobar en PayPal"}
      </button>
      {opened ? (
        <p role="status" className="text-[12px] text-(--cx-muted)">
          PayPal se abrió en otra pestaña. Esta pantalla se actualiza sola.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Attempts under one budget, newest first. An order waiting for the payer
 * and a pending capture are never shown as paid. Only the payer's entries
 * carry an approval link, and only a PayPal page is ever opened.
 */
export function ActivityList({
  entries,
  approvals = true,
}: {
  entries: readonly ActivityEntry[];
  /** False where the same orders' approve buttons are already on screen. */
  approvals?: boolean;
}) {
  return (
    <ul className="divide-y divide-(--cx-line)">
      {entries.map((entry) => {
        const look = KIND_LOOK[entry.kind];
        const Glyph = entry.monitoredException && entry.kind === "COMPLETED" ? EyeIcon : look.Icon;
        const reason = activityReason(entry.kind, entry.reasonCodes, entry.failureCode);
        const paid = entry.kind === "COMPLETED";
        const approval = approvals && entry.kind === "AWAITING_APPROVAL" ? payPalApprovalUrl(entry.approvalUrl) : undefined;
        const struck = entry.kind === "DENIED" || entry.kind === "FAILED" || entry.kind === "CANCELLED";
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
              {approval ? <ApproveAtPayPal href={approval} /> : null}
            </div>
            <div className="text-right">
              <p className={`text-[14px] font-semibold tabular-nums ${paid ? "text-(--cx-ink)" : "text-(--cx-muted)"} ${struck ? "line-through decoration-1" : ""}`}>
                {formatMoneyAmount(entry.requestedAmount)}
              </p>
              <p className="text-[11px] text-(--cx-muted)">{amountNote(entry.kind)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
