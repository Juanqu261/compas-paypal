import { useId, type ReactNode, type RefObject } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import {
  paypalDemoAccounts,
  paypalDemoBalance,
  paypalDemoTransactions,
  type PayPalDemoTransaction,
} from "./paypal-demo-content";
import {
  BankIcon,
  CardIcon,
  ChevronRightIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
} from "./PayPalIcons";

const roundButton =
  "grid size-9 place-items-center rounded-full bg-(--pp-chip) text-(--pp-ink) transition-colors hover:bg-(--pp-chip-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)";

const pillButton =
  "inline-flex h-12 flex-1 items-center justify-center rounded-full bg-(--pp-ink) text-[15px] font-bold text-white transition-[background-color,transform] hover:bg-black active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)";

function PayPalSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-center justify-between">
        <h2 id={headingId} className="text-[19px] font-extrabold tracking-[-0.01em] text-(--pp-ink)">
          {title}
        </h2>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Balance card and the two black pill actions. The balance is demo/test data. */
function BalanceSection() {
  return (
    <section aria-label={paypalDemoBalance.label} className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-(--pp-navy) px-5 pt-5 pb-6 text-white">
        <span
          aria-hidden="true"
          className="absolute -top-10 -right-8 size-36 rounded-full bg-(--pp-blue)/45"
        />
        <span
          aria-hidden="true"
          className="absolute -right-2 -bottom-14 size-28 rounded-full bg-(--pp-sky)/25"
        />
        <p className="relative text-[14px] font-semibold text-white/80">{paypalDemoBalance.label}</p>
        <p className="relative mt-2 flex items-baseline gap-2">
          <span className="text-[2.6rem] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {paypalDemoBalance.amount}
          </span>
          <span className="text-[15px] font-semibold text-white/80">{paypalDemoBalance.currency}</span>
        </p>
        <p className="relative mt-3 text-[12px] text-white/70">Valor de demostración. No es tu saldo.</p>
      </div>
      <div className="flex gap-3">
        <button type="button" className={pillButton}>
          Enviar
        </button>
        <button type="button" className={pillButton}>
          Solicitar
        </button>
      </div>
    </section>
  );
}

/** COMPAS's entry, styled like PayPal's grey callouts. The mark is COMPAS's own logo. */
function CompasCallout({
  onOpenCompas,
  compasRowRef,
}: {
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={compasRowRef}
      type="button"
      onClick={onOpenCompas}
      className="flex w-full items-center gap-3 rounded-2xl bg-(--pp-chip) p-3.5 text-left transition-colors hover:bg-(--pp-chip-strong) active:bg-(--pp-chip-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
        <CompasMark className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-(--pp-ink)">COMPAS</span>
        <span className="block text-[13px] leading-snug text-(--pp-muted)">
          Presupuestos con propósito para tu familia. Apruebas cada pago en PayPal.
        </span>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-(--pp-ink)">
        <ChevronRightIcon className="size-4" />
      </span>
    </button>
  );
}

function WalletSection() {
  return (
    <PayPalSection
      title="Billetera"
      actions={
        <button type="button" aria-label="Vincular tarjeta o banco" className={roundButton}>
          <PlusIcon className="size-4" />
        </button>
      }
    >
      <ul className="divide-y divide-(--pp-line)">
        {paypalDemoAccounts.map((account) => {
          const Glyph = account.kind === "card" ? CardIcon : BankIcon;
          return (
            <li key={account.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--pp-blue) text-white">
                <Glyph className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-(--pp-ink)">{account.title}</span>
                <span className="block text-[13px] text-(--pp-muted) tabular-nums">{account.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </PayPalSection>
  );
}

const avatarTone: Record<PayPalDemoTransaction["tone"], string> = {
  blue: "bg-(--pp-blue) text-white",
  orange: "bg-[#F26B3A] text-white",
  teal: "bg-[#1A8C8C] text-white",
  ink: "bg-(--pp-ink) text-white",
};

function ActivitySection() {
  return (
    <PayPalSection
      title="Actividad"
      actions={
        <>
          <button type="button" aria-label="Filtrar actividad" className={roundButton}>
            <FilterIcon className="size-4" />
          </button>
          <button type="button" aria-label="Buscar en la actividad" className={roundButton}>
            <SearchIcon className="size-4" />
          </button>
        </>
      }
    >
      <ul className="divide-y divide-(--pp-line)">
        {paypalDemoTransactions.map((transaction) => (
          <li key={transaction.id} className="flex items-center gap-3 py-3">
            <span
              aria-hidden="true"
              className={`grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold ${avatarTone[transaction.tone]}`}
            >
              {transaction.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-(--pp-ink)">{transaction.title}</span>
              <span className="block truncate text-[13px] text-(--pp-muted)">{transaction.detail}</span>
            </span>
            <span
              className={`text-[15px] font-semibold tabular-nums ${
                transaction.incoming ? "text-(--pp-green)" : "text-(--pp-ink)"
              }`}
            >
              {transaction.amount}
            </span>
          </li>
        ))}
      </ul>
    </PayPalSection>
  );
}

export function PayPalHomeSections({
  onOpenCompas,
  compasRowRef,
}: {
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      <BalanceSection />
      <CompasCallout onOpenCompas={onOpenCompas} compasRowRef={compasRowRef} />
      <WalletSection />
      <ActivitySection />
    </>
  );
}
