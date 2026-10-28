"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ACTS, CHAPTERS, chapterOf, type Act } from "./chapters";

const nodeBase = "grid size-10 shrink-0 place-items-center rounded-full font-display text-xl";

/** Puts the hint under the selected act's column. */
const HINT_COLUMN: Record<Act, string> = {
  1: "sm:col-start-1",
  2: "sm:col-start-2",
  3: "sm:col-start-3",
};

/**
 * The demo's table of contents, drawn as a path: where the viewer is and what
 * to do there. Moving between acts is free in both directions, so nothing is
 * ticked off. It is the tablist for the three act panels, so arrow keys move
 * between acts. The hint under the current act can be dismissed per act.
 */
export function StoryRail({ act, onChange }: { act: Act; onChange: (act: Act) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<Act>>(() => new Set<Act>());
  const hintShown = !dismissed.has(act);

  function setHint(shown: boolean) {
    setDismissed((current) => {
      const next = new Set(current);
      if (shown) next.delete(act);
      else next.add(act);
      return next;
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = ACTS.length - 1;
    const index = act - 1;
    const target =
      event.key === "ArrowRight" ? (index + 1) % ACTS.length
      : event.key === "ArrowLeft" ? (index + last) % ACTS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (target === undefined) return;
    event.preventDefault();
    onChange(ACTS[target]);
    tabs.current[target]?.focus();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-8">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-semibold tracking-wide text-route-deep uppercase">Follow the story</p>
        {hintShown ? null : (
          <button
            type="button"
            onClick={() => setHint(true)}
            className="text-sm font-semibold text-route-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-route"
          >
            Show hint
          </button>
        )}
      </div>
      <div role="tablist" aria-label="Demo acts" onKeyDown={onKeyDown} className="mt-3 grid gap-4 sm:grid-cols-3">
        {CHAPTERS.map((chapter, index) => {
          const selected = chapter.act === act;
          return (
            <button
              key={chapter.act}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`act-tab-${chapter.act}`}
              aria-selected={selected}
              aria-controls={`act-panel-${chapter.act}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(chapter.act)}
              className="group relative flex flex-col gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-route"
            >
              <span
                className={`${nodeBase} transition-colors duration-200 motion-reduce:transition-none ${
                  selected ? "bg-ink text-paper" : "border border-ink/30 bg-paper text-ink-soft group-hover:border-ink/60"
                }`}
              >
                {chapter.act}
              </span>
              {index < CHAPTERS.length - 1 ? (
                <span aria-hidden className="pointer-events-none absolute top-5 left-12 -right-2 hidden h-0.5 bg-ink/15 sm:block" />
              ) : null}
              <span className={`text-lg leading-snug font-semibold ${selected ? "text-ink" : "text-ink-soft group-hover:text-ink"}`}>
                {chapter.title}
              </span>
            </button>
          );
        })}
        {hintShown ? (
          <div
            role="status"
            className={`relative mt-1 rounded-xl border border-route/30 bg-paper p-3.5 shadow-sm sm:col-span-1 ${HINT_COLUMN[act]} sm:row-start-2`}
          >
            <span
              aria-hidden
              className="absolute -top-1.5 left-[0.95rem] size-3 rotate-45 border-t border-l border-route/30 bg-paper"
            />
            <p className="text-sm font-semibold tracking-wide text-route-deep uppercase">Your move</p>
            <p className="mt-1 text-ink">{chapterOf(act).move}</p>
            <button
              type="button"
              onClick={() => setHint(false)}
              className="mt-2 text-sm font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-route"
            >
              Got it
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
