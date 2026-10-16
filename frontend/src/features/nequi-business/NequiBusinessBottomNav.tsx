import { GridIcon, HomeIcon, SalesIcon } from "./NequiBusinessIcons";

/** Persistent tabs. `Ventas` opens the pushed sales summary instead. */
export type NequiBusinessTab = "home" | "more";

const tabButton =
  "flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--nb-blue)";

function tabClass(active: boolean) {
  return `${tabButton} ${
    active ? "bg-(--nb-card) font-semibold" : "hover:bg-(--nb-card)/60"
  }`;
}

/** Floating bottom navigation. It sits outside the scroll area. */
export function NequiBusinessBottomNav({
  activeTab,
  onSelectTab,
  onOpenSales,
}: {
  activeTab: NequiBusinessTab;
  onSelectTab: (tab: NequiBusinessTab) => void;
  onOpenSales: () => void;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 bg-white px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <ul className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 shadow-[0_4px_18px_rgba(43,0,43,0.13)]">
        <li>
          <button
            type="button"
            aria-current={activeTab === "home" ? "page" : undefined}
            onClick={() => onSelectTab("home")}
            className={tabClass(activeTab === "home")}
          >
            <HomeIcon filled={activeTab === "home"} className="size-6" />
            Inicio
          </button>
        </li>
        <li>
          <button type="button" onClick={onOpenSales} className={tabClass(false)}>
            <SalesIcon className="size-6" />
            Ventas
          </button>
        </li>
        <li>
          <button
            type="button"
            aria-current={activeTab === "more" ? "page" : undefined}
            onClick={() => onSelectTab("more")}
            className={tabClass(activeTab === "more")}
          >
            <GridIcon className="size-6" />
            Conoce más
          </button>
        </li>
      </ul>
    </nav>
  );
}
