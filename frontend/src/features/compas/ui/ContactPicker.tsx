"use client";

import { useId, useState } from "react";
import type { PartyView } from "../api/contracts";
import { searchContacts } from "../lib/wizard";
import { CheckIcon, SearchIcon } from "./icons";
import { Avatar } from "./visuals";

/**
 * Who receives the budget: a searchable contact list. Each row is a native
 * radio, so arrow keys and screen readers work. Nobody is chosen until the
 * payer taps someone. The contacts are the backend's demo directory.
 */
export function ContactPicker({
  people,
  value,
  onChange,
  issue,
}: {
  people: readonly PartyView[];
  value: string;
  onChange: (id: string) => void;
  issue?: string;
}) {
  const [query, setQuery] = useState("");
  const name = useId();
  const searchId = useId();
  const shown = searchContacts(people, query);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-(--cx-line-strong) bg-(--cx-surface) px-3.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-(--cx-focus)">
        <SearchIcon className="size-5 shrink-0 text-(--cx-muted)" />
        <label htmlFor={searchId} className="sr-only">
          Buscar contacto
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-(--cx-ink) outline-none placeholder:text-(--cx-muted)"
        />
      </div>

      <fieldset>
        <legend className="sr-only">Contactos</legend>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-(--cx-muted)">Ningún contacto se llama así.</p>
        ) : (
          <ul className="divide-y divide-(--cx-line) rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface)">
            {shown.map((person) => (
              <li key={person.id}>
                <label className="group flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors first:rounded-t-(--cx-radius) last:rounded-b-(--cx-radius) has-checked:bg-(--cx-route)/6 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-(--cx-focus)">
                  <input
                    type="radio"
                    name={name}
                    value={person.id}
                    checked={value === person.id}
                    onChange={() => onChange(person.id)}
                    className="sr-only"
                  />
                  <Avatar name={person.displayName} seed={person.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-(--cx-ink)">{person.displayName}</span>
                    <span className="block text-[12px] text-(--cx-muted)">Contacto de prueba</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-(--cx-line-strong) text-white group-has-checked:border-(--cx-route) group-has-checked:bg-(--cx-route)"
                  >
                    <CheckIcon className="size-3.5 opacity-0 group-has-checked:opacity-100" />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {issue ? <p className="text-[13px] font-medium text-(--cx-danger)">{issue}</p> : null}
    </div>
  );
}
