"use client";

import { useEffect, useRef, useState } from "react";
import { paypalTheme } from "@/features/paypal/paypal-theme";
import { defaultMerchantCompasConfig, type MerchantCompasConfig } from "./paypal-business-compas-demo";
import { PayPalBusinessCompas } from "./PayPalBusinessCompas";
import { PayPalBusinessHome } from "./PayPalBusinessHome";
import { PayPalBusinessPaymentNotice } from "./PayPalBusinessPaymentNotice";

type PayPalBusinessView = "home" | "compas";

/**
 * The merchant's simulated PayPal Business app: Droguería Central, an online
 * pharmacy that takes PayPal. It fills its container, so the same component
 * works full-screen at /paypal-business and inside a PhoneFrame at /demo. The
 * home is decoration. COMPAS builds the charge that travels to the customer's
 * phone in this browser; the backend decides it, and PayPal pays the shop.
 * The view and the COMPAS settings are local UI state, not backend state.
 */
export function PayPalBusinessExperience() {
  const [view, setView] = useState<PayPalBusinessView>("home");
  // Lives here so it survives leaving and reopening the COMPAS screen.
  const [compasConfig, setCompasConfig] = useState<MerchantCompasConfig>(defaultMerchantCompasConfig);
  const hasNavigated = useRef(false);
  const compasRowRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const compasOpen = view === "compas";

  useEffect(() => {
    if (!hasNavigated.current) return;
    const target = view === "compas" ? backButtonRef : compasRowRef;
    target.current?.focus({ preventScroll: true });
  }, [view]);

  function navigate(next: PayPalBusinessView) {
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
        <PayPalBusinessHome
          config={compasConfig}
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
      <PayPalBusinessCompas
        open={compasOpen}
        config={compasConfig}
        onSave={setCompasConfig}
        onBack={() => navigate("home")}
        backButtonRef={backButtonRef}
      />
      <PayPalBusinessPaymentNotice />
    </div>
  );
}
