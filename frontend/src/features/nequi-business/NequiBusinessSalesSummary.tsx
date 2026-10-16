import { useId, type ReactNode } from "react";
import { nequiBusinessDemo } from "./nequi-business-demo-content";
import {
  BackIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  MoneyIcon,
  QrIcon,
  SearchIcon,
} from "./NequiBusinessIcons";
import { NequiBusinessScreen } from "./NequiBusinessScreen";
import { NequiBusinessStatusBar } from "./NequiBusinessStatusBar";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)";

function MethodIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-md bg-(--nb-card)">
      {children}
    </span>
  );
}

/** Sales summary. All amounts are demo/test data from the content module. */
export function NequiBusinessSalesSummary({ onBack }: { onBack: () => void }) {
  const titleId = useId();
  const methodsId = useId();

  return (
    <NequiBusinessScreen labelledBy={titleId} onBack={onBack}>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="bg-[linear-gradient(to_bottom,var(--nb-card)_calc(100%_-_5rem),#fff_calc(100%_-_5rem))] px-5 @min-[380px]:px-6">
          <NequiBusinessStatusBar tone="dark" />
          <button
            type="button"
            data-initial-focus
            onClick={onBack}
            aria-label="Volver al inicio"
            className={`-ml-2 mt-2 grid size-11 place-items-center rounded-full hover:bg-black/5 ${focusRing}`}
          >
            <BackIcon className="size-7" />
          </button>
          <h2 id={titleId} className="mt-2 text-[24px] leading-tight font-bold tracking-tight">
            Resumen de ventas
          </h2>
          <p className="mt-4 flex items-center gap-2 text-[15px]">
            <CalendarIcon className="size-5" />
            {nequiBusinessDemo.summaryDate}
          </p>

          <div className="mt-3 rounded-lg border border-(--nb-line) bg-white px-4 pt-3">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded bg-(--nb-mint) p-2.5">
                <dt className="text-[13px] leading-snug">Disponible en tu Nequi</dt>
                <dd className="mt-3 text-[15px] font-bold tabular-nums">
                  {nequiBusinessDemo.available}
                </dd>
              </div>
              <div className="rounded bg-(--nb-sand) p-2.5">
                <dt className="text-[13px] leading-snug">En proceso a tu Nequi</dt>
                <dd className="mt-3 text-[15px] font-bold tabular-nums">
                  {nequiBusinessDemo.inProcess}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded py-4 text-[15px] text-(--nb-plum)/80 ${focusRing}`}
            >
              Ver detalle
              <ChevronDownIcon className="size-6" />
            </button>
          </div>
        </div>

        <section aria-labelledby={methodsId} className="px-5 pt-7 pb-8 @min-[380px]:px-6">
          <h3 id={methodsId} className="text-[15px] font-bold">
            Ventas por método de pago
          </h3>

          <div className="mt-4 rounded-lg border border-(--nb-line)">
            <div className="flex items-center gap-3 p-4">
              <MethodIcon>
                <QrIcon className="size-7" />
              </MethodIcon>
              <p className="min-w-0 flex-1">
                <span className="block text-[15px]">QR</span>
                <span className="block text-[17px] font-bold tabular-nums">
                  {nequiBusinessDemo.qrSales}
                </span>
              </p>
              <ChevronRightIcon className="size-5 shrink-0 text-(--nb-muted)" />
            </div>
            <p className="flex items-center justify-between gap-2 border-t border-(--nb-line) px-4 py-3 text-[14px] text-(--nb-green)">
              Ya disponible en tu Nequi
              <InfoIcon className="size-5 shrink-0" />
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-(--nb-line)">
            <div className="flex items-center gap-3 p-4">
              <MethodIcon>
                <MoneyIcon className="size-7" />
              </MethodIcon>
              <p className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug">
                  Tarjeta y link de pago
                </span>
                <span className="block text-[17px] font-bold text-(--nb-amber) tabular-nums">
                  {nequiBusinessDemo.cardAndLinkSales}
                </span>
              </p>
              <span className="shrink-0 rounded-full bg-(--nb-sand) px-2.5 py-1 text-[12px]">
                Pendiente
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-(--nb-muted)" />
            </div>
            <p className="border-t border-(--nb-line) px-4 py-4 text-[14px] leading-snug text-(--nb-alert)">
              La plata de tus ventas por estos métodos de pago se verá
              reflejada en tu Nequi, máximo en 2 días hábiles.
            </p>
          </div>

          <button
            type="button"
            className={`mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-md border-2 border-(--nb-plum) text-[16px] font-medium transition-colors hover:bg-(--nb-card) active:bg-(--nb-sky)/40 ${focusRing}`}
          >
            <SearchIcon className="size-6" />
            Consultar reporte
          </button>
        </section>
      </div>
    </NequiBusinessScreen>
  );
}
