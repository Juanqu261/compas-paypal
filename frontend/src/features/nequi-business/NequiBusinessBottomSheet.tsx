import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./NequiBusinessIcons";

/**
 * Bottom sheet confined to the simulated phone. It is `absolute` against the
 * experience root, never `fixed`, so in /demo it cannot cover other phones.
 */
export function NequiBusinessBottomSheet({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-(--nb-plum)/75 backdrop-blur-[3px] transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none"
      />
      <section
        role="dialog"
        aria-labelledby={labelledBy}
        className="relative max-h-[88%] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pt-3 pb-8 transition-transform duration-300 ease-out starting:translate-y-full motion-reduce:transition-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden @min-[380px]:px-6"
      >
        <div aria-hidden="true" className="mx-auto h-1.5 w-12 rounded-full bg-neutral-300" />
        <div className="-mr-2 flex justify-end pt-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-10 place-items-center rounded-full transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--nb-blue)"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
