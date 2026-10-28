"use client";

import { useEffect, useRef, useState } from "react";
import { PayPalHome } from "@/features/paypal/PayPalHome";
import { paypalDemoDelegate } from "@/features/paypal/paypal-demo-content";
import { paypalTheme } from "@/features/paypal/paypal-theme";
import { PayPalDelegateCompasShell } from "./PayPalDelegateCompasShell";

type DelegateView = "home" | "compas";

/**
 * Andrea's simulated PayPal app (delegate). It fills its container, so the
 * same component works full-screen at /paypal-delegate and inside a PhoneFrame
 * at /demo. Only the home is simulated. The home/COMPAS view is local UI
 * state, not shared demo state.
 */
export function PayPalDelegateExperience() {
  const [view, setView] = useState<DelegateView>("home");
  const hasNavigated = useRef(false);
  const compasRowRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const compasOpen = view === "compas";

  useEffect(() => {
    if (!hasNavigated.current) return;
    const target = view === "compas" ? backButtonRef : compasRowRef;
    target.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: DelegateView) {
    hasNavigated.current = true;
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
          profile={paypalDemoDelegate}
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
      <PayPalDelegateCompasShell
        open={compasOpen}
        onBack={() => navigate("home")}
        backButtonRef={backButtonRef}
      />
    </div>
  );
}
