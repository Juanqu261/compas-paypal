import {
  CreditIcon,
  HomeIcon,
  InvestIcon,
  SavingsIcon,
  TransferIcon,
} from "./ArqIcons";

const navItems = [
  { label: "Inicio", Icon: HomeIcon },
  { label: "Crédito", Icon: CreditIcon },
  { label: "Transferir", Icon: TransferIcon },
  { label: "Invertir", Icon: InvestIcon },
  { label: "Ahorrar", Icon: SavingsIcon },
] as const;

/** Bottom navigation. It sits outside the scroll area, so it stays fixed. */
export function ArqBottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 border-t border-(--arq-line) bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {navItems.map(({ label, Icon }) => {
          const active = label === "Inicio";
          return (
            <li key={label}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--arq-forest) ${
                  active
                    ? "font-semibold text-(--arq-ink)"
                    : "font-medium text-neutral-500 hover:text-neutral-800"
                }`}
              >
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full ${
                    active ? "bg-(--arq-mint)/45" : ""
                  }`}
                >
                  <Icon className="size-[22px]" />
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
