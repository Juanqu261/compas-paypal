import type { RefObject } from "react";
import { PayPalBottomNav } from "./PayPalBottomNav";
import { PayPalHomeSections } from "./PayPalHomeSections";
import { PayPalTopBar } from "./PayPalTopBar";
import type { PayPalDemoProfile } from "./paypal-demo-content";

export function PayPalHome({
  profile,
  onOpenCompas,
  compasRowRef,
}: {
  profile: PayPalDemoProfile;
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="relative h-full">
      <div className="h-full overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <PayPalTopBar profile={profile} />
        <div className="space-y-7 px-5 pt-2 pb-32">
          <PayPalHomeSections
            profile={profile}
            onOpenCompas={onOpenCompas}
            compasRowRef={compasRowRef}
          />
          <footer className="pt-4 text-center">
            <p className="text-[11px] leading-relaxed text-(--pp-muted)">
              A simulation of the PayPal app for the COMPAS demo. It is not the official app. Every
              payment is approved in the PayPal sandbox.
            </p>
          </footer>
        </div>
      </div>
      <PayPalBottomNav />
    </div>
  );
}
