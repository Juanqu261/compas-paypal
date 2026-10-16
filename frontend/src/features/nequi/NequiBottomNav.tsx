import type { RefObject } from "react";
import { DollarIcon, GridIcon, HomeIcon, ListIcon } from "./NequiIcons";

const navItems = [
  { label: "Inicio", Icon: HomeIcon },
  { label: "Movimientos", Icon: ListIcon },
  { label: "Servicios", Icon: GridIcon },
] as const;

/**
 * Floating bottom bar with the magenta "$" button that opens the action
 * menu. It sits over the scroll area, so the home pads its bottom for it.
 */
export function NequiBottomNav({
  menuOpen,
  onOpenMenu,
  menuButtonRef,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end gap-2.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Navegación principal"
        className="pointer-events-auto min-w-0 flex-1 rounded-xl bg-white p-1.5 shadow-[0_2px_12px_rgba(32,0,32,0.16)]"
      >
        <ul className="grid grid-cols-3 gap-1">
          {navItems.map(({ label, Icon }) => {
            const active = label === "Inicio";
            return (
              <li key={label}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 rounded-lg py-2 text-[13px] text-(--nequi-ink) transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--nequi-magenta) ${
                    active
                      ? "bg-(--nequi-lilac) font-semibold"
                      : "hover:bg-(--nequi-lilac)/50"
                  }`}
                >
                  <Icon className="size-6" />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        ref={menuButtonRef}
        type="button"
        aria-label="Abrir acciones"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
        className="pointer-events-auto grid size-[4.25rem] shrink-0 place-items-center rounded-xl bg-(--nequi-magenta) text-white shadow-[0_2px_12px_rgba(218,0,129,0.35)] transition-[background-color,transform] hover:bg-(--nequi-magenta)/90 active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nequi-plum)"
      >
        <DollarIcon className="size-9" />
      </button>
    </div>
  );
}
