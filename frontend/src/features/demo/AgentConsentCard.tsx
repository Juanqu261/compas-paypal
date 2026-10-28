"use client";

import { useState } from "react";
import type { AgentConsentRequest } from "@/features/compas/api/contracts";
import { formatMoney } from "./agent-view";
import { PersonIcon } from "./flow-icons";

/**
 * What the delegate sees when an AI agent asks for access: who is asking, and
 * which of their own errands they give it. Shared by Act 3 and the page an MCP
 * client's browser lands on. The client's name is the client's own text, so it
 * is shown as text and never trusted.
 */
export function AgentConsentCard({
  request,
  busy,
  error,
  onAllow,
  onRefuse,
}: {
  request: AgentConsentRequest;
  busy: boolean;
  error?: string;
  onAllow: (errandIds: readonly string[]) => void;
  onRefuse: () => void;
}) {
  // Everything is allowed by default only when there is one errand: more than one is a choice.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(request.errands.length === 1 ? request.errands.map((errand) => errand.id) : []),
  );
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="consent-title" className="rounded-2xl border border-ink/15 bg-paper p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-route/10 text-route">
          <PersonIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-route uppercase">Andrea’s phone · Compas</p>
          <h3 id="consent-title" className="font-semibold text-ink">
            <span className="break-words">{request.client.name}</span> wants to shop for you
          </h3>
          <p className="text-sm text-ink-soft">
            It asked from <span className="font-mono">{request.client.redirectHost}</span>. It can only propose carts for the
            errands you give it. It can never pay.
          </p>
        </div>
      </div>

      {request.errands.length === 0 ? (
        <p className="mt-4 rounded-lg bg-buff/40 p-3 text-sm text-ink">You have no open errand to give it. Confirm one first.</p>
      ) : (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-ink">Give it these errands</legend>
          <ul className="mt-2 flex flex-col gap-2">
            {request.errands.map((errand) => (
              <li key={errand.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink/15 bg-white p-3 has-checked:border-route has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-route">
                  <input
                    type="checkbox"
                    checked={chosen.has(errand.id)}
                    onChange={() => toggle(errand.id)}
                    className="mt-1 size-4 accent-route"
                  />
                  <span className="text-sm">
                    <span className="block font-semibold text-ink">
                      {errand.items.map((item) => `${item.maxUnits} × ${item.label}`).join(", ")}
                    </span>
                    <span className="block text-ink-soft">
                      Up to {formatMoney(errand.maxAmount)} · until {new Date(errand.expiresAt).toLocaleDateString()}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-route-deep">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || chosen.size === 0}
          onClick={() => onAllow([...chosen])}
          className="rounded-lg bg-ink px-4 py-2.5 font-semibold text-paper transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRefuse}
          className="rounded-lg border border-ink/25 px-4 py-2.5 font-semibold text-ink transition-colors hover:border-ink/50 disabled:opacity-40 motion-reduce:transition-none"
        >
          Don’t allow
        </button>
      </div>
    </section>
  );
}
