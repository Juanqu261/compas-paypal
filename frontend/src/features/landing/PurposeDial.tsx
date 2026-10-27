"use client";

import {
  startTransition,
  useState,
  ViewTransition,
  type ReactNode,
} from "react";
import type { DemoScenario } from "@/demo/scenarios";
import { formatMoneyAmount } from "@/lib/format-money";

/** Where each purpose sits on the dial, in degrees clockwise from north. */
const categoryAngle: Record<string, number> = {
  MEDICATION: 0,
  ALCOHOL: 146,
};

const SECTOR_HALF_WIDTH = 12;

function angleOf(category: string): number {
  return categoryAngle[category] ?? 90;
}

function point(angle: number, radius: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  // Rounded so the server and the browser render identical attributes.
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return [round(radius * Math.sin(radians)), round(-radius * Math.cos(radians))];
}

function arc(from: number, to: number, radius: number, clockwise: boolean) {
  const [x1, y1] = point(from, radius);
  const [x2, y2] = point(to, radius);
  return `M${x1} ${y1} A${radius} ${radius} 0 0 ${clockwise ? 1 : 0} ${x2} ${y2}`;
}

function purposeName(category: string): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

function DialFace({
  allowed,
  categories,
  merchantAngle,
  denied,
}: {
  allowed: string;
  categories: string[];
  merchantAngle: number;
  denied: boolean;
}) {
  const allowedAngle = angleOf(allowed);
  const [s1x, s1y] = point(allowedAngle - SECTOR_HALF_WIDTH, 176);
  const [s2x, s2y] = point(allowedAngle + SECTOR_HALF_WIDTH, 176);
  const [s3x, s3y] = point(allowedAngle + SECTOR_HALF_WIDTH, 122);
  const [s4x, s4y] = point(allowedAngle - SECTOR_HALF_WIDTH, 122);

  return (
    <svg
      viewBox="-200 -200 400 400"
      className="h-auto w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="hazard-hatch"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-ink)" strokeWidth="1.6" />
        </pattern>
        {categories.map((category) => {
          const angle = angleOf(category);
          const lower = angle > 90 && angle < 270;
          return (
            <path
              key={category}
              id={`purpose-arc-${category}`}
              d={
                lower
                  ? arc(angle + 50, angle - 50, 146, false)
                  : arc(angle - 50, angle + 50, 133, true)
              }
            />
          );
        })}
      </defs>

      <circle r="190" fill="var(--color-paper)" />
      <circle r="176" fill="var(--color-shoal)" fillOpacity="0.35" />

      {/* The mandate's purpose: the only sector a payment may point at. */}
      <path
        d={`M${s1x} ${s1y} A176 176 0 0 1 ${s2x} ${s2y} L${s3x} ${s3y} A122 122 0 0 0 ${s4x} ${s4y} Z`}
        fill="var(--color-route)"
        fillOpacity="0.14"
      />

      <g stroke="var(--color-route)">
        <circle r="190" fill="none" strokeWidth="1.5" />
        <circle r="176" fill="none" strokeWidth="0.75" />
        {Array.from({ length: 72 }, (_, index) => {
          const angle = index * 5;
          const length = angle % 30 === 0 ? 12 : angle % 10 === 0 ? 8 : 4;
          const [x1, y1] = point(angle, 190);
          const [x2, y2] = point(angle, 190 - length);
          return (
            <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="0.9" />
          );
        })}
      </g>
      <g
        fill="var(--color-route)"
        fontSize="10"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-site tabular-nums"
      >
        {Array.from({ length: 12 }, (_, index) => index * 30).map((angle) => (
          <text key={angle} transform={`rotate(${angle}) translate(0 -165)`}>
            {angle}
          </text>
        ))}
      </g>

      <circle r="156" fill="none" stroke="var(--color-ink)" strokeOpacity="0.35" strokeWidth="0.75" />
      <circle r="122" fill="none" stroke="var(--color-ink)" strokeOpacity="0.6" strokeWidth="0.75" />
      <circle r="62" fill="none" stroke="var(--color-ink)" strokeOpacity="0.2" strokeWidth="0.75" strokeDasharray="2 4" />

      <g fontSize="15" className="font-site italic" letterSpacing="0.5">
        {categories.map((category) => (
          <text
            key={category}
            fill={category === allowed ? "var(--color-route)" : "var(--color-ink)"}
            textAnchor="middle"
          >
            <textPath href={`#purpose-arc-${category}`} startOffset="50%">
              {purposeName(category)}
            </textPath>
          </text>
        ))}
      </g>

      {/* The needle is locked on the mandate's purpose. */}
      <g transform={`rotate(${allowedAngle})`}>
        <g className="needle-settle">
          <path d="M0 -150 L9 0 L-9 0 Z" fill="var(--color-route)" />
          <path d="M0 150 L9 0 L-9 0 Z" fill="var(--color-ink)" />
          <path d="M0 -150 L0 150" stroke="var(--color-paper)" strokeOpacity="0.5" strokeWidth="0.75" />
        </g>
      </g>
      <circle r="7" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2" />

      {/* The merchant's claimed category. */}
      <g
        style={{ transform: `rotate(${merchantAngle}deg)`, transformOrigin: "0 0" }}
        className="transition-transform duration-[900ms] ease-[cubic-bezier(0.34,1.32,0.5,1)] motion-reduce:transition-none"
      >
        {denied ? (
          <g transform="translate(0 -100)">
            <circle r="16" fill="url(#hazard-hatch)" fillOpacity="0.55" />
            <circle r="16" fill="none" stroke="var(--color-ink)" strokeWidth="1.6" strokeDasharray="2.5 3" />
            <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        ) : (
          <circle
            cy="-100"
            r="9"
            fill="var(--color-paper)"
            stroke="var(--color-route)"
            strokeWidth="3.5"
          />
        )}
      </g>
    </svg>
  );
}

/**
 * The fixtures carry no category evidence; the backend resolves it from the
 * merchant's PayPal merchant id. Its demo seed declares the same category as
 * the first line item, so the display reads the claim from there.
 */
function merchantClaim(scenario: DemoScenario): string | undefined {
  return scenario.purchaseIntent.lineItems[0]?.category;
}

function Readout({ scenario }: { scenario: DemoScenario }) {
  const { merchantDisplayName, lineItems, amount } = scenario.purchaseIntent;
  const allowed = scenario.mandate.purposePolicy.allowedPurposes;
  const claim = merchantClaim(scenario) ?? "UNKNOWN";
  const item = lineItems[0];
  const result = scenario.expectedPolicyResult;
  const allowedNames = allowed.map(purposeName).join(" and ");

  if (result.outcome === "ALLOW") {
    return (
      <div className="space-y-3">
        <p className="font-display text-5xl text-route sm:text-6xl">Allow</p>
        <p className="max-w-[34rem] text-lg leading-relaxed text-ink">
          {merchantDisplayName} claims {purposeName(claim)}, and{" "}
          {item?.description.toLowerCase()} is {purposeName(item?.category ?? claim)}.
          The mandate allows {allowedNames}, so the payment goes ahead: one
          PayPal order, and once Pedro approves it, {formatMoneyAmount(amount)}
          from Pedro’s PayPal straight to the pharmacy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-display text-5xl text-ink sm:text-6xl">
        <span className="bg-[repeating-linear-gradient(135deg,var(--color-ink)_0_1.5px,transparent_1.5px_6px)] bg-[length:100%_0.22em] bg-bottom bg-no-repeat pb-1">
          Deny
        </span>
      </p>
      <p className="max-w-[34rem] text-lg leading-relaxed text-ink">
        Purpose mismatch. {merchantDisplayName} claims {purposeName(claim)}, and
        the mandate only allows {allowedNames}. No PayPal order is created,
        so none of the {formatMoneyAmount(amount)} moves.
      </p>
    </div>
  );
}

export function PurposeDial({
  scenarios,
  intro,
}: {
  scenarios: readonly DemoScenario[];
  intro: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const selected =
    scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
  const allowed = selected.mandate.purposePolicy.allowedPurposes[0];
  const merchantCategory = merchantClaim(selected) ?? allowed;
  const categories = [
    ...new Set([
      allowed,
      ...scenarios.flatMap((scenario) => merchantClaim(scenario) ?? []),
    ]),
  ];

  return (
    <div className="grid items-center gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {intro}

      <figure className="mx-auto w-full max-w-[22rem] sm:max-w-[30rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none">
        <DialFace
          allowed={allowed}
          categories={categories}
          merchantAngle={angleOf(merchantCategory)}
          denied={selected.expectedPolicyResult.outcome !== "ALLOW"}
        />
        <figcaption className="mt-4 text-center text-ink-soft">
          The needle holds Pedro’s purpose, {purposeName(allowed)}. The marker
          is the merchant’s claim.
        </figcaption>
      </figure>

      <div className="space-y-10 lg:self-start">

        <fieldset className="space-y-3">
          <legend className="mb-3 text-ink-soft">Where is Andrea paying?</legend>
          <div className="flex flex-col gap-3 sm:flex-row">
            {scenarios.map((scenario) => {
              const checked = scenario.id === selected.id;
              const item = scenario.purchaseIntent.lineItems[0];
              return (
                <label
                  key={scenario.id}
                  className={`flex-1 cursor-pointer rounded-md border px-4 py-3 transition-[border-color,background-color,box-shadow] duration-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-route motion-reduce:transition-none ${
                    checked
                      ? "border-ink bg-white shadow-[inset_0_-3px_0_var(--color-ink)]"
                      : "border-ink/20 bg-paper hover:border-ink/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="purchase"
                    value={scenario.id}
                    checked={checked}
                    onChange={() =>
                      startTransition(() => setSelectedId(scenario.id))
                    }
                    className="sr-only"
                  />
                  <span className="block font-medium text-ink">
                    {scenario.purchaseIntent.merchantDisplayName}
                  </span>
                  <span className="block text-ink-soft">
                    {item?.description}, {formatMoneyAmount(scenario.purchaseIntent.amount)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div aria-live="polite" className="min-h-[13rem]">
          <ViewTransition
            key={selected.id}
            name="decision-readout"
            share="readout"
            enter="readout"
            default="none"
          >
            <div>
              <Readout scenario={selected} />
            </div>
          </ViewTransition>
          <p className="mt-5 max-w-[34rem] text-sm text-ink-soft italic">
            Expected story outcome from {selected.dataLabel}. The merchant’s
            category claim is self-declared. The COMPAS backend makes the real
            decision.
          </p>
        </div>
      </div>
    </div>
  );
}
