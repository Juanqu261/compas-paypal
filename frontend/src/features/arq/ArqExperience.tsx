"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArqCompasShell } from "./ArqCompasShell";
import { ArqHome } from "./ArqHome";

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
 * The home/COMPAS view is local UI state, not shared demo state.
 */
export function ArqExperience() {
  const [view, setView] = useState<ArqView>("home");
  const hasNavigated = useRef(false);
  const compasRowRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const compasOpen = view === "compas";

  useEffect(() => {
    if (!hasNavigated.current) return;
    const target = view === "compas" ? backButtonRef : compasRowRef;
    target.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: ArqView) {
    hasNavigated.current = true;
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
        open={compasOpen}
        onBack={() => navigate("home")}
        backButtonRef={backButtonRef}
      />
    </div>
  );
}
