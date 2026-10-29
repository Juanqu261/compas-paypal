import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import { DEMO_MERCHANTS } from "@/features/compas/demo-identities";
import { useDemoSession } from "@/features/demo/DemoSession";
import { ArrowLeftIcon, ChevronDownIcon, InfoIcon, StoreIcon } from "@/features/paypal/PayPalIcons";
import { PayPalStatusBar } from "@/features/paypal/PayPalTopBar";
import {
  merchantCompasCategories,
  type MerchantCompasCategory,
  type MerchantCompasConfig,
} from "./paypal-business-compas-demo";
import { paypalBusinessDemo } from "./paypal-business-demo-content";
import {
  MerchantCategoryChip,
  MerchantChargeCard,
  MerchantChargeForm,
  MerchantCompasEvidence,
} from "./PayPalBusinessCompasStatus";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)";

const steps = [
  { title: "You create the order charge", body: "The amount and what the order includes." },
  { title: "The customer reviews it in their PayPal", body: "Against the budget they were given." },
  { title: "COMPAS decides and PayPal pays", body: "Only if it meets the rules and the payer approves it. The payment arrives in your PayPal account." },
];

/** A section that starts closed, so it never competes with charging. */
function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-(--pp-line) [&_summary::-webkit-details-marker]:hidden">
      <summary className={`flex cursor-pointer items-center gap-2 rounded-2xl p-4 ${focusRing}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{title}</span>
          {hint ? <span className="block text-[12px] text-(--pp-muted)">{hint}</span> : null}
        </span>
        <ChevronDownIcon className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-(--pp-line) p-4">{children}</div>
    </details>
  );
}

/**
 * The merchant's COMPAS inside the simulated PayPal Business app: its status,
 * a way to charge an online order, and, folded away, the local settings and
 * what COMPAS verified. Saving the settings is local UI state, not an
 * enrollment or a verification. This screen decides no payment.
 */
export function PayPalBusinessCompas({
  open,
  config,
  onSave,
  onBack,
  backButtonRef,
}: {
  open: boolean;
  config: MerchantCompasConfig;
  onSave: (next: MerchantCompasConfig) => void;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const switchId = useId();
  const [draft, setDraft] = useState<MerchantCompasConfig>(config);
  const [saved, setSaved] = useState(false);
  const [charging, setCharging] = useState(false);
  const { charge } = useDemoSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const missingCategory = draft.enabled && draft.categories.length === 0;

  // The form and the charge card each start at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [charging]);

  function update(next: MerchantCompasConfig) {
    setDraft(next);
    setSaved(false);
  }

  function toggleCategory(id: MerchantCompasCategory) {
    const selected = draft.categories.includes(id)
      ? draft.categories.filter((category) => category !== id)
      : [...draft.categories, id];
    update({
      ...draft,
      categories: merchantCompasCategories.map((category) => category.id).filter((category) => selected.includes(category)),
    });
  }

  return (
    <section
      aria-labelledby={titleId}
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onBack();
      }}
      className={`absolute inset-0 z-20 flex flex-col bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.12)] duration-300 ease-out motion-reduce:transition-none ${
        // Visibility flips at once on open so focus can land; it waits on close.
        open
          ? "visible translate-x-0 transition-transform"
          : "invisible translate-x-full transition-[transform,visibility]"
      }`}
    >
      <PayPalStatusBar />
      <header className="flex items-center gap-2 px-3 pb-2">
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          aria-label="Back to home"
          className={`grid size-10 place-items-center rounded-full bg-(--pp-chip) transition-colors hover:bg-(--pp-chip-strong) ${focusRing}`}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h2 id={titleId} className="text-[20px] font-extrabold tracking-[-0.01em]">
          COMPAS
        </h2>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-2 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-(--pp-chip) p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
                <CompasMark className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold">Purpose-bound payments</p>
                <p className="flex items-center gap-1 truncate text-[13px] text-(--pp-muted)">
                  <StoreIcon className="size-4 shrink-0" />
                  {DEMO_MERCHANTS.drogueria.displayName} · {paypalBusinessDemo.businessKind}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                  config.enabled ? "bg-(--pp-mint) text-(--pp-green)" : "bg-white text-(--pp-muted)"
                }`}
              >
                {config.enabled ? "Active" : "Inactive"}
              </span>
            </div>
            {config.enabled && config.categories.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Categories you accept">
                {config.categories.map((category) => (
                  <span key={category} className="rounded-full bg-white">
                    <MerchantCategoryChip category={category} />
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {charging ? (
            <MerchantChargeForm onDone={() => setCharging(false)} onCancel={() => setCharging(false)} />
          ) : (
            <>
              {charge ? (
                <MerchantChargeCard onNew={() => setCharging(true)} />
              ) : (
                <button
                  type="button"
                  disabled={!config.enabled}
                  onClick={() => setCharging(true)}
                  className={`flex h-14 w-full items-center justify-center gap-2 rounded-full bg-(--pp-ink) text-[17px] font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                >
                  <CompasMark className="size-7" />
                  Charge order with COMPAS
                </button>
              )}
              {!config.enabled ? (
                <p className="text-center text-[13px] text-(--pp-muted)">Turn on COMPAS in Settings to charge.</p>
              ) : null}

              <Fold title="Settings" hint="Saved on this phone only">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span id={switchId} className="text-[14px]">
                      Accept payments with COMPAS
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.enabled}
                      aria-labelledby={switchId}
                      onClick={() => update({ ...draft, enabled: !draft.enabled })}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${focusRing} ${
                        draft.enabled ? "bg-(--pp-blue)" : "bg-neutral-300"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                          draft.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <fieldset disabled={!draft.enabled} className="min-w-0 disabled:opacity-60">
                    <legend className="text-[14px] font-semibold">Categories you accept</legend>
                    <ul className="mt-2 space-y-2">
                      {merchantCompasCategories.map((category) => (
                        <li key={category.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-(--pp-line) p-3 has-checked:border-(--pp-ink) has-checked:bg-(--pp-chip) has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--pp-blue)">
                            <input
                              type="checkbox"
                              checked={draft.categories.includes(category.id)}
                              onChange={() => toggleCategory(category.id)}
                              className="size-5 shrink-0 accent-(--pp-blue) focus:outline-none"
                            />
                            <span className="min-w-0">
                              <span className="block text-[15px]">{category.label}</span>
                              <span className="block text-[12px] text-(--pp-muted)">{category.description}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 flex gap-2 text-[12px] leading-snug text-(--pp-muted)">
                      <InfoIcon className="size-4 shrink-0" />
                      Ticking a category does not verify it. COMPAS accepts it once an independent source corroborates it.
                    </p>
                  </fieldset>
                  <p role="status" className="min-h-5 text-center text-[13px]">
                    {missingCategory ? "Choose at least one category." : saved ? "Saved on this phone." : ""}
                  </p>
                  <button
                    type="button"
                    disabled={missingCategory}
                    onClick={() => {
                      onSave(draft);
                      setSaved(true);
                    }}
                    className={`flex h-12 w-full items-center justify-center rounded-full border border-(--pp-ink) text-[15px] font-bold transition-colors hover:bg-(--pp-chip) disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                  >
                    Save settings
                  </button>
                </div>
              </Fold>

              <Fold title="Verification in COMPAS" hint="What COMPAS knows about your business">
                <MerchantCompasEvidence selected={draft.categories} />
              </Fold>

              <Fold title="How does it work?">
                <ol className="space-y-3">
                  {steps.map((step, index) => (
                    <li key={step.title} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-(--pp-chip-strong) text-[13px] font-bold"
                      >
                        {index + 1}
                      </span>
                      <p className="min-w-0">
                        <span className="block text-[14px] font-semibold">{step.title}</span>
                        <span className="block text-[12px] text-(--pp-muted)">{step.body}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              </Fold>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
