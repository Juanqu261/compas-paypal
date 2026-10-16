import { arqDemoBalance } from "./arq-demo-content";
import {
  ChevronDownIcon,
  ConvertIcon,
  PlusIcon,
  QrIcon,
  UsFlag,
} from "./ArqIcons";

const actionButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--arq-sage)/45 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-(--arq-sage)/65 active:scale-[0.98] active:bg-(--arq-sage)/80 motion-reduce:transition-colors motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Balance and primary actions. The balance is demo/test data. */
export function ArqHero() {
  return (
    <section
      aria-label="Saldo de la cuenta"
      className="bg-(--arq-ink) px-5 pt-5 pb-12 text-white"
    >
      <div className="flex items-center gap-3">
        <UsFlag className="size-8" />
        <p className="text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums @sm:text-5xl">
          {arqDemoBalance.amount}
        </p>
      </div>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 rounded-md text-[15px] font-medium text-white/75 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {arqDemoBalance.asset} · Datos de cuenta
        <ChevronDownIcon className="size-4" />
      </button>

      <div aria-hidden="true" className="mt-6 flex justify-center gap-1.5">
        <span className="h-1.5 w-4 rounded-full bg-white" />
        <span className="size-1.5 rounded-full bg-white/35" />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" className={`${actionButton} flex-1`}>
          <PlusIcon className="size-5" />
          Recargar
        </button>
        <button type="button" className={`${actionButton} flex-1`}>
          <ConvertIcon className="size-5" />
          Convertir
        </button>
        <button
          type="button"
          aria-label="Pagar con código QR"
          className={`${actionButton} w-12 shrink-0`}
        >
          <QrIcon className="size-5" />
        </button>
      </div>
    </section>
  );
}
