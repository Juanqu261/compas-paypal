import type { RefObject } from "react";
import { PayPalBottomNav } from "./PayPalBottomNav";
import { PayPalHomeSections } from "./PayPalHomeSections";
import { PayPalTopBar } from "./PayPalTopBar";

export function PayPalHome({
  onOpenCompas,
  compasRowRef,
}: {
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="relative h-full">
      <div className="h-full overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <PayPalTopBar />
        <div className="space-y-7 px-5 pt-2 pb-32">
          <PayPalHomeSections
            onOpenCompas={onOpenCompas}
            compasRowRef={compasRowRef}
          />
          <footer className="pt-4 text-center">
            <p className="text-[11px] leading-relaxed text-(--pp-muted)">
              Simulación de la app de PayPal para la demo de COMPAS. No es la app oficial. Cada
              pago se aprueba en el sandbox de PayPal.
            </p>
          </footer>
        </div>
      </div>
      <PayPalBottomNav />
    </div>
  );
}
