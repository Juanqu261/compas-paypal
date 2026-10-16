import type { RefObject } from "react";
import { CompassIcon } from "./NequiIcons";
import { NequiScreen } from "./NequiScreen";

/**
 * Placeholder COMPAS screen inside the Nequi host, for Andrea (delegate).
 * UI shell only: no mandate, policy, backend, or Open Payments behavior.
 */
export function NequiCompasShell({
  open,
  onBack,
  backButtonRef,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <NequiScreen
      open={open}
      title="Compas"
      onBack={onBack}
      backButtonRef={backButtonRef}
    >
      <div className="px-2">
        <span className="grid size-14 place-items-center rounded-full bg-(--nequi-compas)/15 text-(--nequi-compas)">
          <CompassIcon className="size-7" />
        </span>
        <p className="mt-5 text-[24px] leading-tight font-semibold tracking-tight text-(--nequi-ink)">
          Paga con un propósito
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-(--nequi-muted)">
          Usa la autorización que alguien de confianza te dio para pagar en
          comercios permitidos. La plata sale de su cuenta directo al
          comercio. No pasa por tu Nequi.
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-(--nequi-line) bg-(--nequi-card)/50 p-5 text-center text-[13px] text-(--nequi-muted)">
          Próximamente verás aquí tus autorizaciones.
        </div>
      </div>
    </NequiScreen>
  );
}
