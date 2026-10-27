import { useEffect, useId, useRef, type RefObject } from "react";
import type { PayPalReturn } from "@/features/compas/demo-identities";
import {
  PAYER_ROUTE_TITLE,
  PayerCompas,
  type PayerRoute,
  usePayerNavigation,
} from "@/features/compas/payer/PayerCompas";
import { compasTheme } from "@/features/compas/theme";
import { ArrowLeftIcon } from "./PayPalIcons";
import { PayPalStatusBar } from "./PayPalTopBar";

/**
 * COMPAS inside the simulated PayPal app, for Pedro (payer). The shell keeps
 * the host's slide, status bar, round back button and heavy title. The arrow steps back inside COMPAS first and
 * closes it from the COMPAS home. Mandates, approvals and revocation are the
 * backend's: this shell only shows them.
 */
export function PayPalCompasShell({
  open,
  onBack,
  backButtonRef,
  openCount,
  paypalReturn,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  openCount: number;
  /** Set when Pedro just came back from approving or cancelling an order at PayPal. */
  paypalReturn?: PayPalReturn | null;
}) {
  const titleId = useId();
  const initial: PayerRoute[] = paypalReturn
    ? [
        { name: "home" },
        { name: "detail", id: paypalReturn.mandateId, notice: { kind: "paypal-return", result: paypalReturn.result } },
      ]
    : [{ name: "home" }];
  const nav = usePayerNavigation(initial);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Each COMPAS screen starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [nav.moves]);

  const back = () => (nav.canGoBack ? nav.back() : onBack());

  return (
    <section
      aria-labelledby={titleId}
      inert={!open}
      style={compasTheme("paypal")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) back();
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
          onClick={back}
          aria-label={nav.canGoBack ? "Volver" : "Volver al inicio"}
          className="grid size-10 place-items-center rounded-full bg-(--pp-chip) text-(--pp-ink) transition-colors hover:bg-(--pp-chip-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)"
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h2 id={titleId} className="text-[20px] font-extrabold tracking-[-0.01em] text-(--pp-ink)">
          {PAYER_ROUTE_TITLE[nav.current.name]}
        </h2>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <PayerCompas nav={nav} active={open} openCount={openCount} />
      </div>
    </section>
  );
}
