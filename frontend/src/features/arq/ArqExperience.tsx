"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { readConsentReturn } from "@/features/compas/demo-identities";
import { ArqCompasShell } from "./ArqCompasShell";
import { ArqHome } from "./ArqHome";

const noSubscription = () => () => {};

/** The page's query string on the client, "" while server rendering. Read once, never written here. */
function useLocationSearch(): string {
  return useSyncExternalStore(noSubscription, () => window.location.search, () => "");
}

/** ARQ simulation palette, scoped to this surface. */
const arqTheme = {
  "--arq-ink": "#002F1B",
  "--arq-forest": "#09482D",
  "--arq-sage": "#718D85",
  "--arq-mint": "#78E2B1",
  "--arq-page": "#F9F9F8",
  "--arq-card": "#F0F1EE",
  "--arq-line": "#E4E6E1",
  "--arq-muted": "#5F6662",
} as CSSProperties;

type ArqView = "home" | "compas";

/**
 * Pedro's simulated ARQ wallet (payer). It fills its container, so the same
 * component works full-screen at /arq and inside a PhoneFrame at /demo.
 * The home/COMPAS view is local UI state, not shared demo state. When Pedro
 * comes back from his wallet's consent screen, COMPAS opens on that budget.
 */
export function ArqExperience() {
  const [view, setView] = useState<ArqView>("home");
  const [openCount, setOpenCount] = useState(0);
  const [consentReturnDismissed, setConsentReturnDismissed] = useState(false);
  const hasNavigated = useRef(false);
  const compasRowRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const search = useLocationSearch();
  const consentReturn = consentReturnDismissed ? null : readConsentReturn(search);
  const compasOpen = view === "compas" || consentReturn !== null;

  useEffect(() => {
    if (!hasNavigated.current) return;
    const target = view === "compas" ? backButtonRef : compasRowRef;
    target.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: ArqView) {
    hasNavigated.current = true;
    if (next === "compas") setOpenCount((n) => n + 1);
    if (next === "home" && consentReturn) {
      // The return hint has been shown. Drop it from the URL so a reload starts clean.
      setConsentReturnDismissed(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("payerAuthorization");
      url.searchParams.delete("grantKey");
      window.history.replaceState(window.history.state, "", url);
    }
    setView(next);
  }

  return (
    <div
      style={arqTheme}
      className="@container relative isolate h-full w-full overflow-hidden bg-(--arq-page) font-sans text-neutral-900"
    >
      <div
        inert={compasOpen}
        className={`h-full transition-transform duration-300 ease-out motion-reduce:transition-none ${
          compasOpen ? "-translate-x-1/4" : "translate-x-0"
        }`}
      >
        <ArqHome
          onOpenCompas={() => navigate("compas")}
          compasRowRef={compasRowRef}
        />
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 bg-black/25 transition-opacity duration-300 motion-reduce:transition-none ${
          compasOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <ArqCompasShell
        key={consentReturn ? `consent-return:${consentReturn.mandateId}` : "compas"}
        open={compasOpen}
        onBack={() => navigate("home")}
        backButtonRef={backButtonRef}
        openCount={openCount}
        consentReturn={consentReturn}
      />
    </div>
  );
}
