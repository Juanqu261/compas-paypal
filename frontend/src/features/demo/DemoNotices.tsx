"use client";

import { useState, useSyncExternalStore } from "react";
import { resetDemo, subscribeWorkspaceRenewed, workspaceWasRenewed } from "@/features/compas/api/client";

const noSubscription = () => () => {};

/** PayPal's return said the demo behind the order had ended (`?paypalOrder=ended`). */
function useEndedReturn(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => new URLSearchParams(window.location.search).get("paypalOrder") === "ended",
    () => false,
  );
}

/** The page without the return hint, so a reload doesn't show the notice again. */
function dropReturnHint(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("paypalOrder");
  url.searchParams.delete("mandateId");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * What a visitor needs to know about their own demo: it is theirs alone, it
 * can end (2 hours idle, or a server restart), and they can start over. Says
 * so when a demo ended under them, including while they were at PayPal.
 */
export function DemoNotices() {
  const endedAtPayPal = useEndedReturn();
  const renewed = useSyncExternalStore(subscribeWorkspaceRenewed, workspaceWasRenewed, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    await resetDemo();
    dropReturnHint();
    window.location.reload();
  };

  const notice = dismissed
    ? null
    : endedAtPayPal
      ? "Your demo ended while you were at PayPal: the server restarted, or it sat idle for 2 hours. COMPAS never captured that order, so nothing was charged. This is a new, empty demo."
      : renewed
        ? "Your previous demo ended: the server restarted, or it sat idle for 2 hours. This is a new, empty demo, so set up your budget and sandbox accounts again."
        : null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      {notice ? (
        <div role="status" className="mt-4 flex flex-col gap-3 rounded-2xl border border-ink/20 bg-buff/40 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-ink">{notice}</p>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              if (endedAtPayPal) dropReturnHint();
            }}
            className="shrink-0 font-semibold text-route-deep hover:underline"
          >
            Got it
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm text-ink-soft">
        {confirming ? (
          <>
            <span className="text-ink">Start over? Your budgets, purchases and sandbox accounts in this demo are cleared.</span>
            <button
              type="button"
              onClick={() => void reset()}
              disabled={resetting}
              className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-paper disabled:cursor-progress disabled:opacity-60"
            >
              {resetting ? "Resetting…" : "Yes, reset"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
          </>
        ) : (
          <>
            <span>This demo is yours alone: no other visitor sees it.</span>
            <button type="button" onClick={() => setConfirming(true)} className="font-semibold text-route-deep hover:underline">
              Reset my demo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
