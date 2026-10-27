import { paypalDemoPayer } from "./paypal-demo-content";
import { BellIcon } from "./PayPalIcons";

/** Decorative device status row. Not a real clock or signal reading. */
export function PayPalStatusBar() {
  return (
    <div
      aria-hidden="true"
      className="flex h-8 items-center justify-between px-6 text-[13px] font-semibold text-(--pp-ink)"
    >
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.6" />
          <rect x="4.3" y="5.5" width="3" height="6.5" rx="0.6" />
          <rect x="8.6" y="3" width="3" height="9" rx="0.6" />
          <rect x="12.9" y="0" width="3" height="12" rx="0.6" opacity="0.4" />
        </svg>
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <path d="M8 12 0.6 3.6a10.6 10.6 0 0 1 14.8 0Z" />
        </svg>
        <svg viewBox="0 0 26 12" className="h-3 w-6.5" fill="none">
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="11"
            rx="3"
            stroke="currentColor"
            opacity="0.5"
          />
          <rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor" />
          <rect x="23.5" y="4" width="1.8" height="4" rx="0.9" fill="currentColor" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

/** Sticky header: the greeting in PayPal's heavy type, notifications and profile. */
export function PayPalTopBar() {
  return (
    <header className="sticky top-0 z-10 bg-white/95 pb-3 backdrop-blur">
      <PayPalStatusBar />
      <div className="flex items-center justify-between gap-3 px-5 pt-2">
        <h1 className="truncate text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-(--pp-ink)">
          {paypalDemoPayer.greeting}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Notificaciones"
            className="grid size-10 place-items-center rounded-full bg-(--pp-chip) text-(--pp-ink) transition-colors hover:bg-(--pp-chip-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)"
          >
            <BellIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Perfil de Pedro"
            className="grid size-10 place-items-center rounded-full bg-(--pp-navy) text-[13px] font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)"
          >
            {paypalDemoPayer.initials}
          </button>
        </div>
      </div>
    </header>
  );
}
