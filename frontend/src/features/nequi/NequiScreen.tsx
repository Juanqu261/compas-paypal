import { useId, type ReactNode, type RefObject } from "react";
import { ArrowLeftIcon } from "./NequiIcons";
import { NequiStatusBar } from "./NequiHero";

/** Full-height screen that slides in over the home, with a back arrow. */
export function NequiScreen({
  open,
  title,
  onBack,
  backButtonRef,
  children,
}: {
  open: boolean;
  title: string;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") onBack();
      }}
      className={`absolute inset-0 z-20 flex flex-col bg-white shadow-[-8px_0_24px_rgba(32,0,32,0.12)] duration-300 ease-out motion-reduce:transition-none ${
        // Visibility flips at once on open so focus can land; it waits on close.
        open
          ? "visible translate-x-0 transition-transform"
          : "invisible translate-x-full transition-[transform,visibility]"
      }`}
    >
      <NequiStatusBar tone="dark" />
      <header className="px-3 pt-2">
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="grid size-11 place-items-center rounded-full text-(--nequi-ink) transition-colors hover:bg-(--nequi-lilac)/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nequi-magenta)"
        >
          <ArrowLeftIcon className="size-7" />
        </button>
        <h2
          id={titleId}
          className="mt-4 px-2 text-[28px] leading-tight font-semibold tracking-tight text-(--nequi-ink)"
        >
          {title}
        </h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}
