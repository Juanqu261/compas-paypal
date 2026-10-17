import type { RefObject } from "react";
import { NequiBottomNav } from "./NequiBottomNav";
import { NequiHero } from "./NequiHero";
import { NequiHomeSections } from "./NequiHomeSections";

export function NequiHome({
  menuOpen,
  onOpenMenu,
  onOpenCompas,
  menuButtonRef,
  compasTileRef,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
  onOpenCompas: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  compasTileRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="relative h-full">
      <div className="h-full overflow-x-hidden overflow-y-auto pb-28 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NequiHero />
        <NequiHomeSections
          onOpenCompas={onOpenCompas}
          compasTileRef={compasTileRef}
        />
        <p className="px-5 pt-8 text-center text-[11px] text-(--nequi-muted)">
          Simulación para la demo de COMPAS. Sin afiliación con Nequi.
        </p>
      </div>
      <NequiBottomNav
        menuOpen={menuOpen}
        onOpenMenu={onOpenMenu}
        menuButtonRef={menuButtonRef}
      />
    </div>
  );
}
