import { HomeIcon, ProfileIcon, QrIcon, TransferIcon } from "./PayPalIcons";

const navItems = [
  { label: "Inicio", Icon: HomeIcon },
  { label: "Enviar", Icon: TransferIcon },
  { label: "Yo", Icon: ProfileIcon },
] as const;

const floating = "bg-white shadow-[0_6px_24px_rgba(0,20,53,0.14),0_1px_3px_rgba(0,20,53,0.08)]";

/**
 * PayPal's floating bottom bar: a pill with the three tabs and a separate QR
 * button. It floats over the bottom of the home, which leaves room for it.
 */
export function PayPalBottomNav() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-2.5 bg-linear-to-t from-white via-white/85 to-transparent px-5 pt-8 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
      <nav aria-label="Navegación principal" className={`pointer-events-auto rounded-full p-1.5 ${floating}`}>
        <ul className="flex">
          {navItems.map(({ label, Icon }) => {
            const active = label === "Inicio";
            return (
              <li key={label}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={`flex w-[4.25rem] flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--pp-blue) ${
                    active
                      ? "bg-(--pp-chip) font-bold text-(--pp-ink)"
                      : "font-medium text-(--pp-muted) hover:text-(--pp-ink)"
                  }`}
                >
                  <Icon className="size-[22px]" />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        aria-label="Pagar o cobrar con código QR"
        className={`pointer-events-auto grid size-[3.6rem] place-items-center rounded-full text-(--pp-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue) ${floating}`}
      >
        <QrIcon className="size-6" />
      </button>
    </div>
  );
}
