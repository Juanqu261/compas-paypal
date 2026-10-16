import { useState } from "react";
import { nequiDemoBalance, nequiDemoUser } from "./nequi-demo-content";
import {
  BellIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  HelpIcon,
  LockIcon,
  UserIcon,
} from "./NequiIcons";

/** Decorative device status row. Not a real clock or signal reading. */
export function NequiStatusBar({ tone }: { tone: "light" | "dark" }) {
  const color = tone === "light" ? "text-white" : "text-(--nequi-ink)";
  return (
    <div
      aria-hidden="true"
      className={`flex h-8 shrink-0 items-center justify-between px-6 text-[13px] font-semibold ${color}`}
    >
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.6" />
          <rect x="4.3" y="5.5" width="3" height="6.5" rx="0.6" />
          <rect x="8.6" y="3" width="3" height="9" rx="0.6" />
          <rect x="12.9" y="0" width="3" height="12" rx="0.6" opacity="0.4" />
        </svg>
        <svg viewBox="0 0 26 12" className="h-3 w-6.5" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.5" />
          <rect x="2" y="2" width="12" height="8" rx="1.6" fill="currentColor" />
          <rect x="23.5" y="4" width="1.8" height="4" rx="0.9" fill="currentColor" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

const headerIconButton =
  "relative grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Greeting, balance and the angular plum header. The magenta shard sits
 * behind the plum shape so it peeks out at the lower edge, as in Nequi.
 */
export function NequiHero() {
  const [hidden, setHidden] = useState(false);

  return (
    <section aria-label="Saldo de la cuenta" className="relative isolate pb-20">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-(--nequi-magenta) [clip-path:polygon(0_0,100%_0,100%_80%,38%_100%,0_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-(--nequi-plum) [clip-path:polygon(0_0,100%_0,100%_68%,76%_95%,0_66%)]"
      />

      <NequiStatusBar tone="light" />

      <div className="flex items-center gap-3 px-5 pt-4">
        <button
          type="button"
          aria-label="Perfil"
          className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <UserIcon className="size-7" />
        </button>
        <p className="min-w-0 flex-1 text-[17px] leading-snug text-white">
          Hola,
          <span className="block truncate text-[19px]">
            {nequiDemoUser.firstName}
          </span>
        </p>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Notificaciones, 1 nueva"
            className={headerIconButton}
          >
            <BellIcon className="size-6" />
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-2 size-2.5 rounded-full bg-(--nequi-coral) ring-2 ring-(--nequi-plum)"
            />
          </button>
          <button type="button" aria-label="Ayuda" className={headerIconButton}>
            <HelpIcon className="size-6" />
          </button>
          <button
            type="button"
            aria-label="Cerrar sesión"
            className={headerIconButton}
          >
            <LockIcon className="size-6" />
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center px-5 text-center text-white">
        <p className="flex items-center gap-2 text-[15px]">
          {nequiDemoBalance.label}
          <button
            type="button"
            aria-pressed={hidden}
            aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
            onClick={() => setHidden((value) => !value)}
            className="grid size-7 place-items-center rounded-full text-white/85 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {hidden ? (
              <EyeIcon className="size-[18px]" />
            ) : (
              <EyeOffIcon className="size-[18px]" />
            )}
          </button>
        </p>
        <p className="mt-1 text-[2.5rem] leading-tight font-bold tracking-tight tabular-nums">
          {hidden ? (
            <>
              <span aria-hidden="true">$ ••••••</span>
              <span className="sr-only">Saldo oculto</span>
            </>
          ) : (
            <>
              {nequiDemoBalance.whole}
              <span className="text-[1.6rem]">{nequiDemoBalance.cents}</span>
            </>
          )}
        </p>
        <p className="mt-2 text-[15px] text-white/90 tabular-nums">
          Total{" "}
          {hidden ? (
            <span aria-hidden="true">$ ••••••</span>
          ) : (
            <>
              {nequiDemoBalance.whole}
              <span className="text-[12px]">{nequiDemoBalance.cents}</span>
            </>
          )}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-white/85 px-5 text-[15px] text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Tu plata
          <ChevronDownIcon className="size-5" />
        </button>
      </div>
    </section>
  );
}
