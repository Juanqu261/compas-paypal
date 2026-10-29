"use client";

import { useId, useState } from "react";
import { errorCode } from "@/features/compas/api/client";
import { COMPAS_CATEGORIES, type CompasCategory, type DemoMerchant } from "@/features/compas/api/contracts";
import { useDemoMerchants } from "@/features/compas/api/hooks";
import { DEMO_MERCHANTS } from "@/features/compas/demo-identities";
import { parseAmountInput } from "@/features/compas/lib/amounts";
import { CATEGORY_LABEL, CORROBORATION_LABEL, errorText, reasonText, TRUST_LEVEL_LABEL } from "@/features/compas/lib/labels";
import { CategoryGlyph } from "@/features/compas/ui/visuals";
import { buildCharge, type ChargeLine, merchantChargeStatus, scenarioLines } from "@/features/demo/demo-charge";
import { useDemoSession } from "@/features/demo/DemoSession";
import { formatMoneyAmount } from "@/lib/format-money";
import { CloseIcon, InfoIcon } from "@/features/paypal/PayPalIcons";
import type { MerchantCompasCategory } from "./paypal-business-compas-demo";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)";

/**
 * The online shop charges in USD, the demo budget's asset: the PayPal order is in the
 * charge's currency, PayPal takes no COP, and COMPAS does not convert.
 * demo/test data: there is no PayPal lookup here.
 */
const CHARGE_ASSET = { assetCode: "USD", assetScale: 2 } as const;

function Chip({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "ok" | "sim" }) {
  const look = {
    neutral: "bg-neutral-100 text-(--pp-muted)",
    ok: "bg-(--pp-mint) text-(--pp-green)",
    sim: "bg-(--pp-sand) text-(--pp-ink)",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${look}`}>{children}</span>;
}

/** A category's glyph on the merchant's own palette. */
export function MerchantCategoryChip({ category }: { category: CompasCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-(--pp-chip) py-1 pr-3 pl-1 text-[13px]">
      <span className="grid size-6 place-items-center rounded-full bg-white">
        <CategoryGlyph category={category} className="size-4" />
      </span>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

/**
 * What COMPAS itself knows about this shop, read from the backend: what it
 * declared and what independent evidence corroborates. Separate from the
 * local preferences, which the backend never sees.
 */
export function MerchantCompasEvidence({ selected }: { selected: readonly MerchantCompasCategory[] }) {
  const { resource, reload, refreshError } = useDemoMerchants(true);
  const data = resource.status === "ready" ? resource.data : undefined;
  const merchant: DemoMerchant | undefined = data?.merchants.find((item) => item.id === DEMO_MERCHANTS.drogueria.id);
  const declared = new Set(merchant?.declarations.map((item) => item.category));
  const notSent = selected.filter((category) => !declared.has(category));

  return (
    <div className="space-y-4">
      {resource.status === "loading" ? <p className="text-[13px] text-(--pp-muted)">Checking with COMPAS…</p> : null}
      {resource.status === "error" ? (
        <div className="space-y-2">
          <p role="alert" className="rounded-xl bg-(--pp-sand) p-3 text-[13px]">
            {errorText(errorCode(resource.error))}
          </p>
          <button type="button" onClick={reload} className={`text-[13px] font-semibold underline ${focusRing}`}>
            Try again
          </button>
        </div>
      ) : null}
      {refreshError ? <p className="text-[12px] text-(--pp-muted)">No connection. Showing the last result.</p> : null}

      {data ? (
        <>
          {data.categorySources === "NONE_REGISTERED" ? (
            <p className="rounded-xl bg-(--pp-sand) p-3 text-[13px] leading-snug">
              COMPAS has no active verification sources in this environment. It does not recognize any categories for your business yet.
            </p>
          ) : null}
          <div>
            <p className="text-[13px] font-semibold">Declared to COMPAS</p>
            {merchant && merchant.declarations.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {merchant.declarations.map((item) => (
                  <li key={item.category} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <span>{CATEGORY_LABEL[item.category]}</span>
                    <Chip tone={item.corroboration === "CONTRADICTED" || item.corroboration === "UNCORROBORATED" ? "neutral" : "ok"}>
                      {CORROBORATION_LABEL[item.corroboration]}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-(--pp-muted)">None.</p>
            )}
          </div>
          <div>
            <p className="text-[13px] font-semibold">Recognized by COMPAS</p>
            {merchant && merchant.categories.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {merchant.categories.map((item) => (
                  <li key={item.category} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <span>{CATEGORY_LABEL[item.category]}</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      <Chip tone="ok">{TRUST_LEVEL_LABEL[item.trustLevel]}</Chip>
                      {item.simulated ? <Chip tone="sim">Simulated verification</Chip> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-(--pp-muted)">None.</p>
            )}
          </div>
          {notSent.length > 0 ? (
            <p className="flex gap-2 rounded-xl bg-(--pp-info) p-3 text-[13px] leading-snug">
              <InfoIcon className="size-5 shrink-0" />
              You ticked {notSent.map((category) => CATEGORY_LABEL[category].toLowerCase()).join(", ")} on this phone.
              COMPAS has no record of it.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const TONE_LOOK = {
  wait: "bg-(--pp-sand) text-(--pp-ink)",
  ok: "bg-(--pp-mint) text-(--pp-green)",
  stop: "bg-(--pp-alert-soft) text-(--pp-alert)",
} as const;

/**
 * The open charge, large: amount, what it is for, and where it stands. It
 * follows the backend's answer to the customer, relayed in this browser.
 */
export function MerchantChargeCard({ onNew }: { onNew: () => void }) {
  const { charge, clearCharge } = useDemoSession();
  if (!charge) return null;
  const status = merchantChargeStatus(charge);
  const categories = [...new Set(charge.lineItems.flatMap((line) => (line.category ? [line.category] : [])))];
  const reasons = charge.result?.kind === "PURCHASE" ? charge.result.purchase.reasonCodes : charge.result?.kind === "PREVIEW" ? [...charge.result.preview.mandateRules.reasonCodes, ...(charge.result.preview.purposeCheck?.reasonCodes ?? [])] : [];
  const done = Boolean(charge.result && (charge.result.kind === "PURCHASE" || status.tone === "stop"));

  return (
    <section aria-label="Current charge" className="rounded-2xl border border-(--pp-line) bg-white p-4 shadow-[0_1px_3px_rgba(0,20,53,0.08)]">
      <p className="text-[13px] text-(--pp-muted)">Order charge</p>
      <p className="mt-0.5 text-[30px] leading-tight font-bold tracking-tight tabular-nums">{formatMoneyAmount(charge.amount)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <MerchantCategoryChip key={category} category={category} />
        ))}
      </div>
      <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-[14px] font-semibold ${TONE_LOOK[status.tone]}`}>
        {status.title}
      </p>
      {!charge.result ? (
        <p className="mt-2 text-[13px] text-(--pp-muted)">The customer needs to open COMPAS in their PayPal and review the charge.</p>
      ) : reasons.length > 0 && status.tone !== "ok" ? (
        <p className="mt-2 text-[13px] text-(--pp-muted)">{reasonText(reasons[0])}.</p>
      ) : null}
      <p className="mt-2 text-[11px] text-(--pp-muted)">Simulation: the charge travels to the customer's PayPal inside this browser.</p>
      <div className="mt-3 flex gap-2">
        {done ? (
          <button
            type="button"
            onClick={onNew}
            className={`h-11 flex-1 rounded-full bg-(--pp-ink) text-[15px] font-bold text-white ${focusRing}`}
          >
            New charge
          </button>
        ) : null}
        <button
          type="button"
          onClick={clearCharge}
          className={`h-11 flex-1 rounded-full border border-(--pp-line) text-[15px] font-bold ${focusRing}`}
        >
          {done ? "Close" : "Cancel charge"}
        </button>
      </div>
    </section>
  );
}

type DraftLine = { category: CompasCategory | null; amount: string };

/** "1500" at scale 2 becomes "15.00", without floating point. */
function minorToInput(value: string, scale: number): string {
  if (scale === 0) return value;
  const padded = value.padStart(scale + 1, "0");
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

/**
 * The charge form: what the customer buys and how much, line by line. The
 * total is the sum of the lines, as the backend checks. The merchant is this
 * shop, named by its directory id; the backend finds its PayPal account and categories.
 */
export function MerchantChargeForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { scenario, createCharge } = useDemoSession();
  const [lines, setLines] = useState<DraftLine[]>([{ category: null, amount: "" }]);
  const [showIssues, setShowIssues] = useState(false);
  const baseId = useId();

  const parsed = lines.map((line) => ({ line, amount: parseAmountInput(line.amount, CHARGE_ASSET.assetScale) }));
  const valid = parsed.every(({ line, amount }) => line.category !== null && amount.ok);
  const total = parsed.reduce((sum, { amount }) => sum + (amount.ok ? BigInt(amount.minorUnits) : BigInt(0)), BigInt(0));

  const update = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));

  function fillFromScenario() {
    setLines(
      scenarioLines(scenario).map((line) => ({ category: line.category ?? null, amount: minorToInput(line.amount.value, line.amount.assetScale) })),
    );
  }

  function generate() {
    if (!valid) {
      setShowIssues(true);
      return;
    }
    const chargeLines: ChargeLine[] = parsed.map(({ line, amount }) => ({
      category: line.category ?? undefined,
      amount: { ...CHARGE_ASSET, value: amount.ok ? amount.minorUnits : "0" },
    }));
    const charge = buildCharge(DEMO_MERCHANTS.drogueria, chargeLines, new Date(), scenario.id);
    if (!charge) return;
    createCharge(charge);
    onDone();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[19px] font-extrabold tracking-[-0.01em]">Charge order with COMPAS</h3>
        <button type="button" onClick={onCancel} aria-label="Cancel" className={`grid size-10 place-items-center rounded-full hover:bg-black/5 ${focusRing}`}>
          <CloseIcon className="size-6" />
        </button>
      </div>

      <ol className="space-y-4">
        {lines.map((line, index) => {
          const amountIssue = showIssues && !parsed[index].amount.ok;
          const categoryIssue = showIssues && line.category === null;
          return (
            <li key={index} className="space-y-3 rounded-lg border border-(--pp-line) p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold">
                  {lines.length > 1 ? `Item ${index + 1}` : "What does the order include?"}
                </p>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                    className={`text-[13px] text-(--pp-muted) underline ${focusRing}`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <fieldset>
                <legend className="sr-only">Category</legend>
                <div className="grid grid-cols-3 gap-2">
                  {COMPAS_CATEGORIES.map((category) => (
                    <label
                      key={category}
                      className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-(--pp-line) px-1 py-2.5 text-center has-checked:border-(--pp-ink) has-checked:bg-(--pp-chip) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--pp-blue)"
                    >
                      <input
                        type="radio"
                        name={`${baseId}-${index}`}
                        checked={line.category === category}
                        onChange={() => update(index, { category })}
                        className="sr-only"
                      />
                      <CategoryGlyph category={category} className="size-6" />
                      <span className="text-[12px] leading-tight">{CATEGORY_LABEL[category]}</span>
                    </label>
                  ))}
                </div>
                {categoryIssue ? <p className="mt-1.5 text-[13px] font-medium text-(--pp-alert)">Choose a category.</p> : null}
              </fieldset>
              <div>
                <label htmlFor={`${baseId}-amount-${index}`} className="text-[13px] font-medium">
                  Amount
                </label>
                <div className="mt-1 flex items-center rounded-xl border border-(--pp-line) focus-within:outline-2 focus-within:outline-(--pp-blue)">
                  <input
                    id={`${baseId}-amount-${index}`}
                    inputMode="decimal"
                    value={line.amount}
                    placeholder="0"
                    onChange={(event) => update(index, { amount: event.target.value })}
                    aria-invalid={amountIssue ? true : undefined}
                    className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[18px] font-semibold outline-none tabular-nums"
                  />
                  <span className="pr-3 text-[13px] font-semibold text-(--pp-muted)">{CHARGE_ASSET.assetCode}</span>
                </div>
                {amountIssue ? <p className="mt-1.5 text-[13px] font-medium text-(--pp-alert)">Enter an amount greater than zero.</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {lines.length < 5 ? (
          <button
            type="button"
            onClick={() => setLines((current) => [...current, { category: null, amount: "" }])}
            className={`text-[14px] font-semibold text-(--pp-blue) ${focusRing}`}
          >
            Add item
          </button>
        ) : null}
        <button type="button" onClick={fillFromScenario} className={`text-[14px] font-semibold text-(--pp-blue) ${focusRing}`}>
          Use the demo example
        </button>
      </div>

      <div className="flex items-baseline justify-between border-t border-(--pp-line) pt-3">
        <span className="text-[14px] text-(--pp-muted)">Charge total</span>
        <span className="text-[24px] font-bold tabular-nums">
          {formatMoneyAmount({ ...CHARGE_ASSET, value: total.toString() })}
        </span>
      </div>

      <button
        type="button"
        onClick={generate}
        className={`flex h-13 w-full items-center justify-center rounded-full bg-(--pp-ink) text-[16px] font-bold text-white transition-colors hover:bg-black ${focusRing}`}
      >
        Send charge to customer
      </button>
    </div>
  );
}
