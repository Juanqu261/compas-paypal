import { useId, type ReactNode, type RefObject } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import { nequiDemoPromos } from "./nequi-demo-content";
import {
  EditIcon,
  GridIcon,
  HeartIcon,
  MobileIcon,
  PhoneCardIcon,
  PiggyIcon,
  SendIcon,
  SmileIcon,
} from "./NequiIcons";

const hideScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function JarIllustration() {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false" className="block w-full">
      <rect x="30" y="4" width="36" height="22" rx="4" className="fill-(--nequi-lilac)" />
      <rect x="38" y="9" width="20" height="12" rx="2" className="fill-none stroke-(--nequi-magenta)" strokeWidth="2.5" />
      <path d="M22 28h52l-4 56a8 8 0 0 1-8 7H34a8 8 0 0 1-8-7z" className="fill-white" />
      <path d="M22 28h52l-.8 10H22.8z" className="fill-(--nequi-lilac)" />
      <circle cx="48" cy="62" r="11" className="fill-(--nequi-magenta)/15" />
      <path d="M48 56v12M44.5 59h5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4h5" className="fill-none stroke-(--nequi-magenta)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PromoCarousel() {
  return (
    <section aria-label="Novedades" className="relative -mt-4">
      <ul
        className={`flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 ${hideScrollbar}`}
      >
        {nequiDemoPromos.map((promo) => (
          <li
            key={promo.id}
            className="flex w-[86%] shrink-0 snap-start items-center gap-2 overflow-hidden rounded-xl bg-(--nequi-card) py-4 pl-4 shadow-[0_1px_3px_rgba(32,0,32,0.12)]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-(--nequi-ink)">
                {promo.title}
              </p>
              <p className="mt-0.5 text-[15px] leading-snug text-(--nequi-ink)">
                {promo.body}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-9 items-center rounded-md bg-(--nequi-plum) px-4 text-[15px] text-white transition-colors hover:bg-(--nequi-plum)/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nequi-magenta)"
              >
                {promo.action}
              </button>
            </div>
            <div className="w-24 shrink-0 translate-x-2">
              <JarIllustration />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({
  label,
  icon,
  onClick,
  buttonRef,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <li className="w-[5.25rem] shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col items-center gap-2 rounded-lg text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nequi-magenta)"
      >
        <span className="grid size-[5.25rem] place-items-center rounded-md border border-(--nequi-line) bg-white text-(--nequi-ink) shadow-[0_1px_2px_rgba(32,0,32,0.06)] transition-colors group-hover:border-(--nequi-magenta)/40 group-active:bg-(--nequi-lilac)/50">
          {icon}
        </span>
        <span className="text-[13px] leading-tight text-(--nequi-ink)">
          {label}
        </span>
      </button>
    </li>
  );
}

function TileRow({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-center justify-between gap-2 px-5">
        <h2
          id={headingId}
          className="flex items-center gap-2.5 text-[17px] text-(--nequi-muted)"
        >
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <ul className={`flex gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 ${hideScrollbar}`}>
        {children}
      </ul>
    </section>
  );
}

/** The official COMPAS mark for the Nequi tile. Our own logo, not a Nequi asset. */
function CompasTileMark() {
  return <CompasMark className="size-13" />;
}

export function NequiHomeSections({
  onOpenCompas,
  compasTileRef,
}: {
  onOpenCompas: () => void;
  compasTileRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="space-y-7">
      <PromoCarousel />

      <TileRow title="Sugeridos Nequi">
        <Tile
          label="Bre-B"
          icon={
            <span className="text-[22px] font-black tracking-tight text-(--nequi-violet)">
              Bre-B
            </span>
          }
        />
        <Tile
          label="Compas"
          icon={<CompasTileMark />}
          onClick={onOpenCompas}
          buttonRef={compasTileRef}
        />
        <Tile
          label="Paquetes de celular"
          icon={<MobileIcon className="size-10 text-(--nequi-magenta)" />}
        />
        <Tile label="Colchón" icon={<PiggyIcon className="size-10" />} />
        <Tile label="Más servicios" icon={<GridIcon className="size-11" />} />
      </TileRow>

      <TileRow
        title="Tus favoritos"
        icon={<HeartIcon className="size-6 text-(--nequi-ink)" />}
        action={
          <button
            type="button"
            aria-label="Editar favoritos"
            className="grid size-10 place-items-center rounded-full text-(--nequi-ink) hover:bg-(--nequi-lilac)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nequi-magenta)"
          >
            <EditIcon className="size-7" />
          </button>
        }
      >
        <Tile label="Tarjeta" icon={<PhoneCardIcon className="size-11" />} />
        <Tile label="Créditos" icon={<SmileIcon className="size-11" />} />
        <Tile
          label="Recargas"
          icon={<MobileIcon className="size-10 text-(--nequi-magenta)" />}
        />
        <Tile label="Transferencias" icon={<SendIcon className="size-9" />} />
      </TileRow>
    </div>
  );
}
