"use client";

import { useId, useRef } from "react";
import { Connector, FlowDiagram, type Step } from "./flow-diagram";
import { BoxIcon, CheckBadgeIcon, ExternalIcon, PersonIcon, PillIcon, StoreIcon } from "./flow-icons";

/** Act 2's manual steps: the work an AI agent replaces. */
const REPLACED: readonly Step[] = [
  { icon: StoreIcon, title: "Find a pharmacy", caption: "Looks for one", tone: "model", state: "done" },
  { icon: PillIcon, title: "Choose the medicine", caption: "Picks it", tone: "model", state: "done" },
  { icon: BoxIcon, title: "Build the order", caption: "Fills the cart", tone: "model", state: "done" },
  { icon: ExternalIcon, title: "Send it", caption: "Sends it to Compas", tone: "model", state: "done" },
];

/** The steps that never change, agent or not. */
const KEPT: readonly Step[] = [
  { icon: CheckBadgeIcon, title: "Compas checks", caption: "Pharmacy, medicine, budget", tone: "ok", state: "done" },
  { icon: PersonIcon, title: "Pedro approves", caption: "At PayPal", tone: "ok", state: "done" },
];

/**
 * Act 3's explanation, kept out of the way: a button that opens a dialog with
 * the flow, so the live test is the first thing on the page. The dialog closes
 * with Escape, its close button, or a click outside it.
 */
export function AgentReplaces() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="text-lg font-semibold text-route-deep underline decoration-route/40 underline-offset-4 transition-colors duration-200 hover:decoration-route focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-route motion-reduce:transition-none"
      >
        See what it replaces →
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          // Only the backdrop is the dialog element itself; the content sits in the div below.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto rounded-2xl bg-paper text-ink shadow-xl backdrop:bg-ink/50"
      >
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h3 id={titleId} className="font-display text-2xl text-ink sm:text-3xl">
              An AI agent can do Andrea’s part
            </h3>
            <form method="dialog">
              <button
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full border border-ink/25 text-lg leading-none text-ink transition-colors duration-200 hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-route motion-reduce:transition-none"
              >
                <span aria-hidden>×</span>
              </button>
            </form>
          </div>

          <div className="mt-6 flex flex-col items-stretch gap-2 lg:flex-row">
            <div className="rounded-2xl border-2 border-dashed border-route/50 p-3 lg:flex-[4]">
              <p className="mb-3 text-center text-sm font-semibold text-route-deep">The work the agent replaces</p>
              <FlowDiagram steps={REPLACED} state="done" />
            </div>
            <ol aria-hidden className="flex items-center justify-center self-center lg:pt-10">
              <Connector />
            </ol>
            <div className="border-2 border-transparent p-3 lg:flex-[2]">
              <p className="mb-3 text-center text-sm font-semibold text-ink-soft">Never changes</p>
              <FlowDiagram steps={KEPT} state="done" startAt={REPLACED.length + 1} />
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
