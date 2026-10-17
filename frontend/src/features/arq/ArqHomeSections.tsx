import { useId, type ReactNode, type RefObject } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import {
  arqDemoCards,
  arqDemoRate,
  arqDemoTransactions,
  type ArqDemoTransaction,
} from "./arq-demo-content";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CardIcon,
  ChevronRightIcon,
  CoFlag,
  PlusIcon,
  ReceiptIcon,
  UsFlag,
} from "./ArqIcons";
import { BusinessPromo, GroupsPromo } from "./ArqPromoCards";

const textLink =
  "rounded text-[13px] font-semibold text-(--arq-forest) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--arq-forest)";

function ArqSection({
  title,
  seeAll = false,
  children,
}: {
  title: string;
  seeAll?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id={headingId} className="text-[17px] font-semibold text-neutral-900">
          {title}
        </h2>
        {seeAll ? (
          <button type="button" className={textLink}>
            Ver todo
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function CardsSection() {
  return (
    <ArqSection title="Tarjetas">
      <ul className="flex gap-3">
        {arqDemoCards.map((card) => (
          <li
            key={card.id}
            className={`relative flex aspect-[1.55] min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-xl p-2.5 ${
              card.tone === "forest"
                ? "bg-(--arq-forest) text-white"
                : "bg-(--arq-mint) text-(--arq-ink)"
            }`}
          >
            <span aria-hidden="true" className="absolute top-2.5 right-2.5 flex">
              <span className="size-3 rounded-full bg-current opacity-60" />
              <span className="-ml-1.5 size-3 rounded-full bg-current opacity-35" />
            </span>
            <span className="text-[12px] font-semibold tabular-nums">
              <span className="sr-only">{card.label} terminada en </span>
              <span aria-hidden="true">•• </span>
              {card.suffix}
            </span>
          </li>
        ))}
        <li className="flex min-w-0 flex-1">
          <button
            type="button"
            aria-label="Agregar tarjeta"
            className="grid aspect-[1.55] w-full place-items-center rounded-xl border border-dashed border-neutral-300 text-neutral-600 transition-colors hover:bg-(--arq-card) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--arq-forest)"
          >
            <PlusIcon className="size-5" />
          </button>
        </li>
      </ul>
    </ArqSection>
  );
}

function TransactionIcon({ kind }: { kind: ArqDemoTransaction["kind"] }) {
  const Glyph =
    kind === "incoming"
      ? ArrowDownLeftIcon
      : kind === "outgoing"
        ? ArrowUpRightIcon
        : CardIcon;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--arq-card) text-neutral-800">
      <Glyph className="size-5" />
    </span>
  );
}

function TransactionsSection() {
  return (
    <ArqSection title="Transacciones" seeAll>
      <ul className="divide-y divide-(--arq-line)">
        {arqDemoTransactions.map((transaction) => (
          <li key={transaction.id} className="flex items-center gap-3 py-3">
            <TransactionIcon kind={transaction.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-neutral-900">
                {transaction.title}
              </p>
              <p className="text-[13px] text-(--arq-muted)">{transaction.date}</p>
            </div>
            <div className="text-right">
              <p
                className={`text-[15px] font-medium tabular-nums ${
                  transaction.kind === "incoming"
                    ? "text-(--arq-forest)"
                    : "text-neutral-900"
                }`}
              >
                {transaction.amount}
              </p>
              <p className="text-[12px] text-(--arq-muted) tabular-nums">
                {transaction.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ArqSection>
  );
}

function ExchangeRateSection() {
  return (
    <ArqSection title="Tasa de conversión">
      <div className="rounded-2xl bg-(--arq-card) p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex">
              <UsFlag className="size-6 ring-2 ring-(--arq-card)" />
              <CoFlag className="-ml-2 size-6 ring-2 ring-(--arq-card)" />
            </span>
            <span className="text-[15px] font-semibold text-neutral-900">
              {arqDemoRate.pair}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-(--arq-mint)/40 px-2 py-0.5 text-[12px] font-semibold text-(--arq-forest) tabular-nums">
            <span aria-hidden="true">▲</span>
            <span className="sr-only">Sube </span>
            {arqDemoRate.change}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-3">
            <dt className="text-[13px] text-(--arq-muted)">Compra</dt>
            <dd className="mt-0.5 text-[17px] font-semibold text-neutral-900 tabular-nums">
              {arqDemoRate.buy}
            </dd>
          </div>
          <div className="rounded-xl bg-white p-3">
            <dt className="text-[13px] text-(--arq-muted)">Venta</dt>
            <dd className="mt-0.5 text-[17px] font-semibold text-neutral-900 tabular-nums">
              {arqDemoRate.sell}
            </dd>
          </div>
        </dl>
        {/* demo/test data: these figures are display values, not a quote. */}
        <p className="mt-3 text-[11px] text-(--arq-muted)">
          Valores de demostración. No son una cotización.
        </p>
      </div>
      <div aria-hidden="true" className="mt-3 flex justify-center gap-1.5">
        <span className="h-1.5 w-4 rounded-full bg-neutral-800" />
        <span className="size-1.5 rounded-full bg-neutral-300" />
        <span className="size-1.5 rounded-full bg-neutral-300" />
      </div>
    </ArqSection>
  );
}

function PaymentRow({
  icon,
  title,
  subtitle,
  onClick,
  buttonRef,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.06] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--arq-forest)"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-(--arq-forest)">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-neutral-900">
            {title}
          </span>
          <span className="block truncate text-[13px] text-(--arq-muted)">
            {subtitle}
          </span>
        </span>
        <ChevronRightIcon className="size-5 shrink-0 text-neutral-400" />
      </button>
    </li>
  );
}

function OtherPaymentsSection({
  onOpenCompas,
  compasRowRef,
}: {
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ArqSection title="Otras formas de pago">
      <ul className="divide-y divide-(--arq-line) overflow-hidden rounded-2xl bg-(--arq-card)">
        <PaymentRow
          icon={<ReceiptIcon className="size-5" />}
          title="Pagar una factura"
          subtitle="Servicios, impuestos y más"
        />
        <PaymentRow
          icon={<CompasMark className="size-7" />}
          title="COMPAS"
          subtitle="Destina dinero con un propósito"
          onClick={onOpenCompas}
          buttonRef={compasRowRef}
        />
      </ul>
    </ArqSection>
  );
}

export function ArqHomeSections({
  onOpenCompas,
  compasRowRef,
}: {
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      <BusinessPromo />
      <CardsSection />
      <TransactionsSection />
      <ExchangeRateSection />
      <OtherPaymentsSection
        onOpenCompas={onOpenCompas}
        compasRowRef={compasRowRef}
      />
      <ArqSection title="Grupos">
        <GroupsPromo />
      </ArqSection>
    </>
  );
}
