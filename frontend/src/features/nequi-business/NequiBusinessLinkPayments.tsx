import { useId } from "react";
import {
  ArrowRightIcon,
  BackIcon,
  InstantMoneyIcon,
  ShareIcon,
} from "./NequiBusinessIcons";
import { NequiBusinessScreen } from "./NequiBusinessScreen";
import { NequiBusinessStatusBar } from "./NequiBusinessStatusBar";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)";

/**
 * Abstract stand-in for the promotional photo: a blurred laptop, a tilted
 * phone, and soft hand shapes, drawn with CSS only.
 */
function LinkPaymentsHero() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_75%_15%,#F4F0EC,#D3CCC5_45%,#8E8781)]"
    >
      <div className="absolute top-[6%] left-[-12%] h-[48%] w-[72%] rounded-xl bg-[#ECE9E5] blur-[2px]">
        <div className="absolute top-[38%] left-[6%] h-[11%] w-[34%] rounded bg-[#4E86D6]/80" />
        <div className="absolute top-[62%] left-[10%] h-[4%] w-[40%] rounded bg-[#9C9894]/60" />
      </div>
      <div className="absolute bottom-[14%] left-[-8%] h-[22%] w-[48%] -skew-x-12 rounded-md bg-[#2E2C2B] blur-[1.5px]" />
      <div className="absolute right-[-4%] bottom-[-6%] h-[38%] w-[46%] rounded-full bg-[#E3B59D] blur-md" />
      <div className="absolute bottom-[-10%] left-[22%] h-[30%] w-[34%] rounded-full bg-[#D9A68C] blur-md" />
      <div className="absolute top-[20%] left-[30%] aspect-[9/17] w-[44%] -rotate-[28deg] rounded-[1.6rem] border-[6px] border-[#2B3E78] bg-white shadow-2xl">
        <div className="mx-auto mt-2 h-1.5 w-1/3 rounded-full bg-[#2B3E78]/80" />
        <div className="mx-[10%] mt-[14%] h-[5%] rounded bg-[#4E86D6]" />
        <div className="mx-[10%] mt-[8%] flex gap-[6%]">
          <div className="aspect-square w-[34%] rounded bg-[#C9B9AE]" />
          <div className="flex-1 space-y-1.5 pt-1">
            <div className="h-1.5 w-2/3 rounded bg-[#7CC48F]" />
            <div className="h-1.5 rounded bg-neutral-300" />
            <div className="h-1.5 w-4/5 rounded bg-neutral-300" />
          </div>
        </div>
        <div className="mx-[10%] mt-[12%] space-y-2">
          <div className="h-1.5 rounded bg-neutral-200" />
          <div className="h-1.5 w-5/6 rounded bg-neutral-200" />
          <div className="h-1.5 w-2/3 rounded bg-neutral-200" />
          <div className="h-1.5 w-3/4 rounded bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}

export function NequiBusinessLinkPayments({ onBack }: { onBack: () => void }) {
  const titleId = useId();

  return (
    <NequiBusinessScreen labelledBy={titleId} onBack={onBack}>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative aspect-[360/400] max-h-[56%] w-full overflow-hidden rounded-b-[2.25rem]">
          <LinkPaymentsHero />
          <div className="relative">
            <NequiBusinessStatusBar tone="light" />
            <button
              type="button"
              data-initial-focus
              onClick={onBack}
              aria-label="Volver al inicio"
              className={`ml-3 grid size-11 place-items-center rounded-full text-white drop-shadow hover:bg-white/15 ${focusRing}`}
            >
              <BackIcon className="size-7" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-6 pb-8 @min-[380px]:px-6">
          <h2 id={titleId} className="text-[30px] leading-tight font-bold tracking-tight">
            Link de pagos
          </h2>

          <ul className="mt-3">
            <li className="flex items-center gap-4 border-b border-(--nb-line) py-4">
              <ShareIcon className="size-9 shrink-0 text-(--nb-navy)" />
              <p className="min-w-0">
                <span className="block text-[16px]">Vende por redes</span>
                <span className="block text-[15px] leading-snug text-(--nb-muted)">
                  Crea tu link, envíalo y cobra en línea
                </span>
              </p>
            </li>
            <li className="flex items-center gap-4 border-b border-(--nb-line) py-4">
              <InstantMoneyIcon className="size-9 shrink-0 text-(--nb-navy)" />
              <p className="min-w-0">
                <span className="block text-[16px]">Cobros instantáneos</span>
                <span className="block text-[15px] leading-snug text-(--nb-muted)">
                  Recibe tu dinero al momento
                </span>
              </p>
            </li>
          </ul>

          <p className="mt-5 flex items-baseline gap-1.5 text-[16px]">
            Un servicio de
            <span className="text-[21px] font-extrabold tracking-tight">Wompi</span>
          </p>

          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              className={`rounded text-[16px] text-(--nb-blue) underline underline-offset-2 hover:no-underline ${focusRing}`}
            >
              Conoce las tarifas
            </button>
            <button
              type="button"
              aria-label="Continuar"
              className={`grid size-14 shrink-0 place-items-center rounded-sm bg-(--nb-cta) transition-colors hover:bg-(--nb-blue) active:brightness-95 ${focusRing}`}
            >
              <ArrowRightIcon className="size-7" />
            </button>
          </div>
        </div>
      </div>
    </NequiBusinessScreen>
  );
}
