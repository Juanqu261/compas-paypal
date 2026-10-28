"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readPayPalReturn } from "@/features/compas/demo-identities";
import { PayPalCompasShell } from "./PayPalCompasShell";
import { PayPalHome } from "./PayPalHome";
import { paypalDemoPayer } from "./paypal-demo-content";
import { paypalTheme } from "./paypal-theme";

const noSubscription = () => () => {};

/** The page's query string on the client, "" while server rendering. Read once, never written here. */
function useLocationSearch(): string {
  return useSyncExternalStore(noSubscription, () => window.location.search, () => "");
}

type PayPalView = "home" | "compas";

/**
 * Pedro's simulated PayPal app (payer). It fills its container, so the same
 * component works full-screen at /paypal and inside a PhoneFrame at /demo.
 * Only the home is simulated: approving an order opens the real PayPal sandbox.
 * The home/COMPAS view is local UI state, not shared demo state. When Pedro
 * comes back from approving an order at PayPal, COMPAS opens on that budget.
 */
export function PayPalExperience() {
  const [view, setView] = useState<PayPalView>("home");
  const [openCount, setOpenCount] = useState(0);
  const [paypalReturnDismissed, setPayPalReturnDismissed] = useState(false);
  const hasNavigated = useRef(false);
  const compasRowRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const search = useLocationSearch();
  const paypalReturn = paypalReturnDismissed ? null : readPayPalReturn(search);
  const compasOpen = view === "compas" || paypalReturn !== null;

  useEffect(() => {
    if (!hasNavigated.current) return;
    const target = view === "compas" ? backButtonRef : compasRowRef;
    target.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: PayPalView) {
    hasNavigated.current = true;
    if (next === "compas") setOpenCount((n) => n + 1);
    if (next === "home" && paypalReturn) {
      // The return hint has been shown. Drop it from the URL so a reload starts clean.
      setPayPalReturnDismissed(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("paypalOrder");
      url.searchParams.delete("mandateId");
      window.history.replaceState(window.history.state, "", url);
    }
    setView(next);
  }

  return (
    <div
      style={paypalTheme}
      className="@container relative isolate h-full w-full overflow-hidden bg-white font-sans text-(--pp-ink)"
    >
      <div
        inert={compasOpen}
        className={`h-full transition-transform duration-300 ease-out motion-reduce:transition-none ${
          compasOpen ? "-translate-x-1/4" : "translate-x-0"
        }`}
      >
        <PayPalHome
          profile={paypalDemoPayer}
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
      <PayPalCompasShell
        key={paypalReturn ? `paypal-return:${paypalReturn.mandateId}` : "compas"}
        open={compasOpen}
        onBack={() => navigate("home")}
        backButtonRef={backButtonRef}
        openCount={openCount}
        paypalReturn={paypalReturn}
      />
    </div>
  );
}
