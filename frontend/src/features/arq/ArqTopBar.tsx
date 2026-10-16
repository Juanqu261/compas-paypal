import { arqDemoRewardPill } from "./arq-demo-content";
import { GiftIcon, ProfileIcon, SparkleIcon } from "./ArqIcons";

const pillButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-(--arq-sage)/45 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-(--arq-sage)/65 active:bg-(--arq-sage)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Decorative device status row. Not a real clock or signal reading. */
export function ArqStatusBar({ tone }: { tone: "light" | "dark" }) {
  const color = tone === "light" ? "text-white" : "text-neutral-900";
  return (
    <div
      aria-hidden="true"
      className={`flex h-8 items-center justify-between px-6 text-[13px] font-semibold ${color}`}
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

/** Sticky ARQ utility bar: stays on top while the home scrolls. */
export function ArqTopBar() {
  return (
    <header className="sticky top-0 z-10 bg-(--arq-ink) pb-3">
      <ArqStatusBar tone="light" />
      <div className="flex items-center justify-between gap-2 px-5 pt-1">
        <button
          type="button"
          aria-label="Perfil"
          className={`${pillButton} w-9 justify-center px-0`}
        >
          <ProfileIcon className="size-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className={pillButton}>
            <SparkleIcon className="size-4 text-(--arq-mint)" />
            Beneficios
          </button>
          <button
            type="button"
            aria-label={`Recompensa de ${arqDemoRewardPill}`}
            className={pillButton}
          >
            <GiftIcon className="size-4 text-(--arq-mint)" />
            <span className="tabular-nums">{arqDemoRewardPill}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
