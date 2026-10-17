import type { RefObject } from "react";
import { ArqBottomNav } from "./ArqBottomNav";
import { ArqHero } from "./ArqHero";
import { ArqHomeSections } from "./ArqHomeSections";
import { ArqTopBar } from "./ArqTopBar";

export function ArqHome({
  onOpenCompas,
  compasRowRef,
}: {
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ArqTopBar />
        <ArqHero />
        <div className="relative -mt-5 space-y-8 rounded-t-[1.75rem] bg-(--arq-page) px-5 pt-6 pb-6">
          <ArqHomeSections
            onOpenCompas={onOpenCompas}
            compasRowRef={compasRowRef}
          />
          <footer className="pt-6 text-center">
            <p
              aria-hidden="true"
              className="text-6xl font-black tracking-tighter text-(--arq-line) select-none"
            >
              ARQ
            </p>
            <p className="mt-3 text-[11px] text-neutral-500">
              Simulación para la demo de COMPAS. Sin afiliación con ARQ.
            </p>
          </footer>
        </div>
      </div>
      <ArqBottomNav />
    </div>
  );
}
