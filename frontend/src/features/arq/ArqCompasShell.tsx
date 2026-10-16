import { useId, type RefObject } from "react";
import { ArrowLeftIcon, CompassIcon } from "./ArqIcons";
import { ArqStatusBar } from "./ArqTopBar";

/**
 * Placeholder COMPAS screen inside the ARQ host. UI shell only: no mandate,
 * policy, backend, or Open Payments behavior lives here.
 */
export function ArqCompasShell({
  open,
  onBack,
  backButtonRef,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") onBack();
      }}
      className={`absolute inset-0 z-20 flex flex-col bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.12)] duration-300 ease-out motion-reduce:transition-none ${
        // Visibility flips at once on open so focus can land; it waits on close.
        open
          ? "visible translate-x-0 transition-transform"
          : "invisible translate-x-full transition-[transform,visibility]"
      }`}
    >
      <ArqStatusBar tone="dark" />
      <header className="flex items-center gap-1 px-2 pb-2">
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          aria-label="Volver al inicio"
          className="grid size-11 place-items-center rounded-full text-neutral-900 transition-colors hover:bg-neutral-100 active:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--arq-forest)"
        >
          <ArrowLeftIcon className="size-6" />
        </button>
        <h2 id={titleId} className="text-[17px] font-semibold text-neutral-900">
          COMPAS
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="grid size-14 place-items-center rounded-full bg-(--arq-mint)/40 text-(--arq-forest)">
          <CompassIcon className="size-7" />
        </span>
        <p className="mt-5 text-[26px] leading-tight font-semibold tracking-tight text-neutral-900">
          Destina dinero con un propósito
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-(--arq-muted)">
          Autoriza a alguien de confianza a pagar por un propósito que tú
          eliges. El dinero se queda en tu cuenta hasta que se usa en un
          comercio permitido.
        </p>
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-(--arq-page) p-5 text-center text-[13px] text-(--arq-muted)">
          Próximamente podrás configurar tu primer destino aquí.
        </div>
      </div>
    </section>
  );
}
