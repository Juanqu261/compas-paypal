"use client";

import { useId } from "react";
import { COMPAS_CATEGORIES, type CompasCategory } from "../api/contracts";
import { CATEGORY_LABEL } from "../lib/labels";
import { BasketIcon, CheckIcon, DropletIcon, GlassIcon, PillIcon, SmokeIcon } from "./icons";

/**
 * The visual vocabulary COMPAS shares across hosts: a glyph per category, an
 * avatar per person, and a step bar for a flow. Colors come from the host's
 * `--cx-*` properties, so each wallet keeps its own look.
 */

const GLYPH: Record<CompasCategory, typeof PillIcon> = {
  MEDICATION: PillIcon,
  FOOD: BasketIcon,
  PERSONAL_CARE: DropletIcon,
  ALCOHOL: GlassIcon,
  TOBACCO: SmokeIcon,
};

export function CategoryGlyph({ category, className }: { category: CompasCategory; className?: string }) {
  const Glyph = GLYPH[category];
  return <Glyph className={className} />;
}

/** A category's glyph in a soft round tile. The label is for screen readers when the text is not next to it. */
export function CategoryBadge({ category, size = "md", label }: { category: CompasCategory; size?: "sm" | "md" | "lg"; label?: boolean }) {
  const box = { sm: "size-7", md: "size-9", lg: "size-12" }[size];
  const glyph = { sm: "size-4", md: "size-5", lg: "size-6" }[size];
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full bg-(--cx-route)/10 text-(--cx-route)`}>
      <CategoryGlyph category={category} className={glyph} />
      {label ? <span className="sr-only">{CATEGORY_LABEL[category]}</span> : null}
    </span>
  );
}

/** Up to three category glyphs, overlapped, for a compact row. */
export function CategoryStack({ categories }: { categories: readonly CompasCategory[] }) {
  return (
    <span className="flex -space-x-1.5" aria-hidden="true">
      {categories.slice(0, 3).map((category) => (
        <span key={category} className="rounded-full ring-2 ring-(--cx-surface)">
          <CategoryBadge category={category} size="sm" />
        </span>
      ))}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Soft, stable tints so people are easy to tell apart. The name is always shown next to it. */
const TINTS = ["#E8E1F5", "#DCEFE6", "#FBE6D4", "#DDE9F8", "#F7DFE8", "#ECEADB"];

function tint(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ name, seed, size = "md" }: { name: string; seed?: string; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-8 text-[12px]", md: "size-10 text-[14px]", lg: "size-14 text-[18px]" }[size];
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tint(seed ?? name) }}
      className={`grid ${box} shrink-0 place-items-center rounded-full font-semibold text-(--cx-ink)`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Where the person is in a short flow. Done steps are filled, the current one
 * is outlined, later ones are faint. The current step is announced.
 */
export function StepBar({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex gap-1.5" aria-label="Progress">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";
        return (
          <li key={step} aria-current={state === "current" ? "step" : undefined} className="min-w-0 flex-1">
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full ${
                state === "done" ? "bg-(--cx-route)" : state === "current" ? "bg-(--cx-route)/45" : "bg-(--cx-line)"
              }`}
            />
            <span
              className={`mt-1.5 block truncate text-[11px] ${
                state === "next" ? "text-(--cx-muted)" : "font-semibold text-(--cx-ink)"
              }`}
            >
              {step}
              {state === "done" ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Category tiles. Each one is a native checkbox (or radio with `single`), so
 * keyboard and screen readers work; the glyph and a check mark show selection.
 */
export function CategoryTiles({
  value,
  onChange,
  options = COMPAS_CATEGORIES,
  single = false,
  legend,
}: {
  value: readonly CompasCategory[];
  onChange: (next: CompasCategory[]) => void;
  options?: readonly CompasCategory[];
  single?: boolean;
  legend: string;
}) {
  const name = useId();
  const toggle = (category: CompasCategory) =>
    onChange(
      single
        ? [category]
        : options.filter((item) => (item === category ? !value.includes(item) : value.includes(item))),
    );
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((category) => (
          <label
            key={category}
            className="group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-(--cx-radius) border border-(--cx-line) bg-(--cx-surface) px-1.5 pt-3 pb-2.5 text-center transition-colors has-checked:border-(--cx-route) has-checked:bg-(--cx-route)/6 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--cx-focus)"
          >
            <input
              type={single ? "radio" : "checkbox"}
              name={name}
              checked={value.includes(category)}
              onChange={() => toggle(category)}
              className="sr-only"
            />
            <span className="grid size-10 place-items-center rounded-full bg-(--cx-card) text-(--cx-ink) group-has-checked:bg-(--cx-route) group-has-checked:text-white">
              <CategoryGlyph category={category} className="size-5" />
            </span>
            <span className="text-[12px] leading-tight font-medium text-(--cx-ink)">{CATEGORY_LABEL[category]}</span>
            <CheckIcon
              className="absolute top-1.5 right-1.5 size-4 text-(--cx-route) opacity-0 group-has-checked:opacity-100"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
