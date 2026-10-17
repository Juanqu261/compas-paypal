"use client";

import { useId, type ReactNode } from "react";
import {
  COMPAS_CATEGORIES,
  CONFIDENCE_MINIMUMS,
  type CompasCategory,
  type ConfidenceMinimum,
  type Enforcement,
  type PartyView,
} from "../api/contracts";
import {
  CATEGORY_DESCRIPTION,
  CATEGORY_LABEL,
  CONFIDENCE_DESCRIPTION,
  CONFIDENCE_LABEL,
  ENFORCEMENT_DESCRIPTION,
  ENFORCEMENT_LABEL,
  MONITORED_WARNING,
} from "../lib/labels";
import { CheckIcon } from "./icons";
import { Notice } from "./primitives";

/**
 * Form controls for the budget wizard. Native inputs carry the semantics;
 * the styling only shows them. A selected option always shows a check mark,
 * so selection never depends on color alone.
 */

const optionBox =
  "flex cursor-pointer gap-3 rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) p-3.5 transition-colors has-checked:border-(--cx-accent) has-checked:bg-(--cx-card) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--cx-focus)";

function Mark({ type }: { type: "radio" | "checkbox" }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 grid size-5 shrink-0 place-items-center border-2 border-(--cx-line-strong) text-(--cx-on-accent) group-has-checked:border-(--cx-accent) group-has-checked:bg-(--cx-accent) ${type === "radio" ? "rounded-full" : "rounded-md"}`}
    >
      <CheckIcon className="size-3.5 opacity-0 group-has-checked:opacity-100" />
    </span>
  );
}

function Option({
  type,
  name,
  checked,
  onChange,
  title,
  children,
  disabled,
}: {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`group ${optionBox} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input type={type} name={name} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      <Mark type={type} />
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-(--cx-ink)">{title}</span>
        {children ? <span className="mt-0.5 block text-[13px] leading-snug text-(--cx-muted)">{children}</span> : null}
      </span>
    </label>
  );
}

export function FieldIssue({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[13px] font-medium text-(--cx-danger)">{message}</p>;
}

/** Who may spend and who the budget is for. Options come from the backend's demo directory. */
export function ParticipantPicker({
  legend,
  hint,
  name,
  people,
  value,
  onChange,
  issue,
}: {
  legend: string;
  hint: string;
  name: string;
  people: readonly PartyView[];
  value: string;
  onChange: (id: string) => void;
  issue?: string;
}) {
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold text-(--cx-ink)">{legend}</legend>
      <p className="mt-0.5 text-[13px] text-(--cx-muted)">{hint}</p>
      <div className="mt-2.5 space-y-2">
        {people.map((person) => (
          <Option
            key={person.id}
            type="radio"
            name={name}
            checked={value === person.id}
            onChange={() => onChange(person.id)}
            title={person.displayName}
          />
        ))}
      </div>
      <FieldIssue message={issue} />
    </fieldset>
  );
}

export function CategoryPicker({
  value,
  onChange,
  issue,
}: {
  value: readonly CompasCategory[];
  onChange: (next: CompasCategory[]) => void;
  issue?: string;
}) {
  const name = useId();
  const toggle = (category: CompasCategory) =>
    onChange(
      COMPAS_CATEGORIES.filter((item) => (item === category ? !value.includes(item) : value.includes(item))),
    );
  return (
    <fieldset>
      <legend className="sr-only">Categorías permitidas</legend>
      <div className="space-y-2">
        {COMPAS_CATEGORIES.map((category) => (
          <Option
            key={category}
            type="checkbox"
            name={name}
            checked={value.includes(category)}
            onChange={() => toggle(category)}
            title={CATEGORY_LABEL[category]}
          >
            {CATEGORY_DESCRIPTION[category]}
          </Option>
        ))}
      </div>
      <FieldIssue message={issue} />
    </fieldset>
  );
}

export function EnforcementPicker({
  value,
  acknowledged,
  onChange,
  onAcknowledge,
  issue,
}: {
  value: Enforcement;
  acknowledged: boolean;
  onChange: (next: Enforcement) => void;
  onAcknowledge: (next: boolean) => void;
  issue?: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold text-(--cx-ink)">Modo de control</legend>
      <div className="mt-2.5 space-y-2">
        {(["ENFORCED", "MONITORED"] as const).map((mode) => (
          <Option
            key={mode}
            type="radio"
            name={name}
            checked={value === mode}
            onChange={() => onChange(mode)}
            title={mode === "ENFORCED" ? `${ENFORCEMENT_LABEL[mode]} (recomendado)` : ENFORCEMENT_LABEL[mode]}
          >
            {ENFORCEMENT_DESCRIPTION[mode]}
          </Option>
        ))}
      </div>
      {value === "MONITORED" ? (
        <div className="mt-3 space-y-2">
          <Notice tone="warn" title="Antes de elegir el modo supervisado">
            {MONITORED_WARNING}
          </Notice>
          <label className="group flex cursor-pointer items-start gap-3 rounded-(--cx-radius) p-1 has-focus-visible:outline-2 has-focus-visible:outline-(--cx-focus)">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
              className="sr-only"
            />
            <Mark type="checkbox" />
            <span className="text-[14px] text-(--cx-ink)">
              Entiendo que se pagarán compras fuera del propósito y que COMPAS solo las registrará.
            </span>
          </label>
          <FieldIssue message={issue} />
        </div>
      ) : null}
    </fieldset>
  );
}

export function ConfidencePicker({
  value,
  onChange,
}: {
  value: ConfidenceMinimum;
  onChange: (next: ConfidenceMinimum) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold text-(--cx-ink)">Confianza mínima del comercio</legend>
      <p className="mt-0.5 text-[13px] text-(--cx-muted)">
        Una confianza más baja permite pagar en comercios con evidencia más limitada.
      </p>
      <div className="mt-2.5 space-y-2">
        {CONFIDENCE_MINIMUMS.map((level) => (
          <Option
            key={level}
            type="radio"
            name={name}
            checked={value === level}
            onChange={() => onChange(level)}
            title={level === "HIGH" ? `${CONFIDENCE_LABEL[level]} (recomendada)` : CONFIDENCE_LABEL[level]}
          >
            {CONFIDENCE_DESCRIPTION[level]}
          </Option>
        ))}
      </div>
    </fieldset>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  issue,
  type = "text",
  inputMode,
  min,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  issue?: string;
  type?: "text" | "date";
  inputMode?: "decimal";
  min?: string;
  suffix?: string;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[14px] font-medium text-(--cx-ink)">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-[12px] text-(--cx-muted)">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5 flex items-center rounded-(--cx-radius) border border-(--cx-line-strong) bg-(--cx-surface) focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-(--cx-focus)">
        <input
          id={id}
          type={type}
          value={value}
          min={min}
          inputMode={inputMode}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={issue ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 min-w-0 flex-1 rounded-(--cx-radius) bg-transparent px-3 text-[16px] text-(--cx-ink) outline-none tabular-nums"
        />
        {suffix ? <span className="pr-3 text-[14px] font-semibold text-(--cx-muted)">{suffix}</span> : null}
      </div>
      <FieldIssue message={issue} />
    </div>
  );
}
