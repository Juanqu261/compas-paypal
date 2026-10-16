import { useId, useState, type ComponentType, type ReactNode } from "react";
import { nequiBusinessDemo } from "./nequi-business-demo-content";
import { NequiBusinessBottomNav } from "./NequiBusinessBottomNav";
import {
  ArrowRightIcon,
  CardIcon,
  DollarSquareIcon,
  EyeIcon,
  EyeOffIcon,
  HelpIcon,
  LetterMark,
  LinkIcon,
  QrIcon,
  RefreshIcon,
  StoreIcon,
  ZigzagMark,
} from "./NequiBusinessIcons";
import { NequiBusinessStatusBar } from "./NequiBusinessStatusBar";

const iconButton =
  "grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5 active:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--nb-blue)";

function CollectionCard({
  title,
  subtitle,
  Icon,
  mark,
  onClick,
}: {
  title: string;
  subtitle: string;
  Icon: ComponentType<{ className?: string }>;
  mark: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex min-h-[11rem] min-w-0 flex-col rounded-lg border-2 border-white bg-(--nb-card) p-2.5 text-left shadow-[0_2px_6px_rgba(43,0,43,0.12)] transition-[transform,box-shadow] hover:shadow-[0_3px_10px_rgba(43,0,43,0.18)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue) @min-[360px]:p-3"
    >
      <span className="absolute top-2 right-2 text-neutral-400/80">{mark}</span>
      <span className="grid size-10 place-items-center rounded bg-(--nb-sky)">
        <Icon className="size-7" />
      </span>
      <span className="mt-4 text-[14px] leading-tight font-bold @min-[360px]:text-[15px]">
        {title}
      </span>
      <span className="mt-1 text-[12.5px] leading-snug @min-[360px]:text-[13px]">
        {subtitle}
      </span>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[14px] font-semibold text-(--nb-blue)">
        Cobrar
        <ArrowRightIcon className="size-4" />
      </span>
    </button>
  );
}

function SalesToday({ onOpenSales }: { onOpenSales: () => void }) {
  const headingId = useId();
  const [hidden, setHidden] = useState(false);

  return (
    <section aria-labelledby={headingId} className="px-5 pt-9 pb-6 @min-[380px]:px-6">
      <h2 id={headingId} className="text-[17px] font-bold">
        Ventas del día
      </h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-(--nb-line) bg-white">
        <div className="flex items-center gap-1 py-4 pr-2 pl-3">
          <button
            type="button"
            onClick={onOpenSales}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-(--nb-blue)"
          >
            <DollarSquareIcon className="size-9 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[17px] font-bold tabular-nums">
                {hidden ? "$ ••••" : nequiBusinessDemo.salesToday}
              </span>
              <span className="block truncate text-[13px] text-(--nb-muted)">
                {nequiBusinessDemo.salesTodayLabel}
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Ocultar ventas"
            aria-pressed={hidden}
            onClick={() => setHidden((value) => !value)}
            className={iconButton}
          >
            {hidden ? (
              <EyeOffIcon className="size-7" />
            ) : (
              <EyeIcon className="size-7" />
            )}
          </button>
          <button type="button" aria-label="Actualizar saldo" className={iconButton}>
            <RefreshIcon className="size-7" />
          </button>
        </div>
        <p className="border-t border-(--nb-line) bg-(--nb-cyan) py-2 text-center text-[13px]">
          Saldo actualizado a las {nequiBusinessDemo.balanceUpdatedAt}
        </p>
      </div>
    </section>
  );
}

export function NequiBusinessHome({
  onCollectCard,
  onCollectLink,
  onCollectQr,
  onOpenSales,
}: {
  onCollectCard: () => void;
  onCollectLink: () => void;
  onCollectQr: () => void;
  onOpenSales: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* The sky background stops partway down the collection cards. */}
        <div className="bg-[linear-gradient(to_bottom,var(--nb-sky)_calc(100%_-_4.5rem),#fff_calc(100%_-_4.5rem))] px-5 @min-[380px]:px-6">
          <NequiBusinessStatusBar tone="dark" />
          <header className="mt-5 flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-(--nb-tile)">
              <StoreIcon className="size-7" />
            </span>
            <p className="min-w-0 flex-1 leading-tight">
              <span className="block text-[14px]">Hola,</span>
              <span className="block truncate text-[17px] font-medium">
                {nequiBusinessDemo.ownerName}
              </span>
            </p>
            <button type="button" aria-label="Ayuda" className={`${iconButton} -mr-2`}>
              <HelpIcon className="size-7" />
            </button>
          </header>

          <h2 className="mt-6 text-[23px] leading-tight font-semibold tracking-tight @min-[360px]:text-[25px]">
            ¿Cómo quieres cobrar?
          </h2>

          <div className="mt-5 grid grid-cols-3 gap-2.5 @min-[360px]:gap-3">
            <CollectionCard
              title="Tarjeta"
              subtitle="Débito o crédito"
              Icon={CardIcon}
              mark={<ZigzagMark className="size-5" />}
              onClick={onCollectCard}
            />
            <CollectionCard
              title="Link pago"
              subtitle="Para ventas digitales"
              Icon={LinkIcon}
              mark={<ZigzagMark className="size-5" />}
              onClick={onCollectLink}
            />
            <CollectionCard
              title="QR·Bre-B"
              subtitle="Escanean y pagan"
              Icon={QrIcon}
              mark={<LetterMark className="size-5" />}
              onClick={onCollectQr}
            />
          </div>
        </div>

        <SalesToday onOpenSales={onOpenSales} />
      </div>
      <NequiBusinessBottomNav onOpenSales={onOpenSales} />
    </div>
  );
}
