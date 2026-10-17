import { useEffect, useId, useRef, type RefObject } from "react";
import type { ConsentReturn } from "@/features/compas/demo-identities";
import {
  PAYER_ROUTE_TITLE,
  PayerCompas,
  type PayerRoute,
  usePayerNavigation,
} from "@/features/compas/payer/PayerCompas";
import { compasTheme } from "@/features/compas/theme";
import { ArrowLeftIcon } from "./ArqIcons";
import { ArqStatusBar } from "./ArqTopBar";

/**
 * COMPAS inside the ARQ host, for Pedro (payer). The shell keeps ARQ's slide,
 * status bar and back arrow. The arrow steps back inside COMPAS first and
 * closes it from the COMPAS home. Mandates, consent and revocation are the
 * backend's: this shell only shows them.
 */
export function ArqCompasShell({
  open,
  onBack,
  backButtonRef,
  openCount,
  consentReturn,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  openCount: number;
  /** Set when Pedro just came back from his wallet's consent screen. */
  consentReturn?: ConsentReturn | null;
}) {
  const titleId = useId();
  const initial: PayerRoute[] = consentReturn
    ? [
        { name: "home" },
        { name: "detail", id: consentReturn.mandateId, notice: { kind: "consent-return", result: consentReturn.result } },
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
      style={compasTheme("arq")}
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
      <ArqStatusBar tone="dark" />
      <header className="flex items-center gap-1 px-2 pb-2">
        <button
          ref={backButtonRef}
          type="button"
          onClick={back}
          aria-label={nav.canGoBack ? "Volver" : "Volver al inicio"}
          className="grid size-11 place-items-center rounded-full text-neutral-900 transition-colors hover:bg-neutral-100 active:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--arq-forest)"
        >
          <ArrowLeftIcon className="size-6" />
        </button>
        <h2 id={titleId} className="text-[17px] font-semibold text-neutral-900">
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
