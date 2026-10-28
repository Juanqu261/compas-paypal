import { useId, type ReactNode, type RefObject } from "react";
import { CompasMark } from "@/features/brand/CompasLogo";
import { errorCode } from "@/features/compas/api/client";
import type { MerchantPayPalPayment, Money } from "@/features/compas/api/contracts";
import { useMerchantPayPalPayments } from "@/features/compas/api/hooks";
import { DEMO_MERCHANTS } from "@/features/compas/demo-identities";
import { CATEGORY_LABEL, errorText } from "@/features/compas/lib/labels";
import { chargePaymentCompleted } from "@/features/demo/demo-charge";
import { useDemoSession } from "@/features/demo/DemoSession";
import { PayPalBottomNav, type PayPalNavItem } from "@/features/paypal/PayPalBottomNav";
import { BellIcon, ChevronRightIcon, HomeIcon, OrdersIcon, StoreIcon, ToolsIcon } from "@/features/paypal/PayPalIcons";
import { PayPalStatusBar } from "@/features/paypal/PayPalTopBar";
import { formatMoneyAmount } from "@/lib/format-money";
import type { MerchantCompasConfig } from "./paypal-business-compas-demo";
import { paypalBusinessDemo } from "./paypal-business-demo-content";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)";

const businessNavItems: readonly PayPalNavItem[] = [
  { label: "Inicio", Icon: HomeIcon },
  { label: "Pedidos", Icon: OrdersIcon },
  { label: "Herramientas", Icon: ToolsIcon },
];

const MERCHANT = DEMO_MERCHANTS.drogueria;

/** Only a PayPal sandbox page is ever opened from this screen. */
function sandboxUrl(href: string): string | undefined {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname === "www.sandbox.paypal.com" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

type Tone = "ok" | "wait" | "stop" | "muted";

const TONE_LOOK: Record<Tone, string> = {
  ok: "bg-(--pp-mint) text-(--pp-green)",
  wait: "bg-(--pp-sand) text-(--pp-ink)",
  stop: "bg-(--pp-alert-soft) text-(--pp-alert)",
  muted: "bg-(--pp-chip) text-(--pp-muted)",
};

/** What PayPal says about the order now, in the merchant's words. */
function paymentStatus(payment: MerchantPayPalPayment): { label: string; tone: Tone } {
  const paypal = payment.paypal;
  if (paypal.read === "UNAVAILABLE") return { label: "PayPal no respondió", tone: "muted" };
  switch (paypal.capture?.status) {
    case "COMPLETED":
      return { label: "Pago recibido", tone: "ok" };
    case "PENDING":
      return { label: "Captura pendiente en PayPal", tone: "wait" };
    case "DECLINED":
    case "FAILED":
      return { label: "Pago rechazado", tone: "stop" };
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return { label: "Reembolsado", tone: "muted" };
  }
  switch (paypal.orderStatus) {
    case "APPROVED":
      return { label: "Aprobado, por capturar", tone: "wait" };
    case "VOIDED":
      return { label: "Orden anulada", tone: "muted" };
    case "COMPLETED":
      return { label: "Completada", tone: "ok" };
    default:
      return { label: "Esperando que quien paga apruebe", tone: "wait" };
  }
}

function paymentAmount(payment: MerchantPayPalPayment): Money | undefined {
  return payment.paypal.read === "OK" ? (payment.paypal.capture?.amount ?? payment.paypal.amount) : undefined;
}

/** Captured COMPAS payments in USD, the demo's only currency, summed without floating point. */
function receivedTotal(payments: readonly MerchantPayPalPayment[]): Money {
  let total = BigInt(0);
  for (const payment of payments) {
    const amount = payment.paypal.read === "OK" && payment.paypal.capture?.status === "COMPLETED" ? paymentAmount(payment) : undefined;
    if (amount?.assetCode === "USD" && amount.assetScale === 2) total += BigInt(amount.value);
  }
  return { value: total.toString(), assetCode: "USD", assetScale: 2 };
}

const dateFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-[19px] font-extrabold tracking-[-0.01em]">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BusinessTopBar() {
  return (
    <header className="sticky top-0 z-10 bg-white/95 pb-3 backdrop-blur">
      <PayPalStatusBar />
      <div className="flex items-center justify-between gap-3 px-5 pt-2">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{MERCHANT.displayName}</h1>
          <p className="flex items-center gap-1.5 text-[13px] text-(--pp-muted)">
            <StoreIcon className="size-4" />
            {paypalBusinessDemo.businessKind}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Notificaciones"
            className={`grid size-10 place-items-center rounded-full bg-(--pp-chip) transition-colors hover:bg-(--pp-chip-strong) ${focusRing}`}
          >
            <BellIcon className="size-5" />
          </button>
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-(--pp-navy) text-[13px] font-bold text-white"
          >
            {paypalBusinessDemo.initials}
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * The merchant's real sandbox account: its PayPal id, what COMPAS payments
 * PayPal reports captured to it, and a way into the sandbox itself.
 */
function SandboxAccountCard({
  account,
  total,
  activityUrl,
}: {
  account?: string;
  total?: Money;
  activityUrl?: string;
}) {
  return (
    <section aria-label="Cuenta de PayPal sandbox" className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-(--pp-navy) px-5 pt-5 pb-6 text-white">
        <span aria-hidden="true" className="absolute -top-10 -right-8 size-36 rounded-full bg-(--pp-blue)/45" />
        <span aria-hidden="true" className="absolute -right-2 -bottom-14 size-28 rounded-full bg-(--pp-sky)/25" />
        <p className="relative text-[14px] font-semibold text-white/80">Recibido con COMPAS</p>
        <p className="relative mt-2 text-[2.4rem] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
          {total ? formatMoneyAmount(total) : "—"}
        </p>
        <p className="relative mt-3 text-[12px] text-white/80">
          Capturado por PayPal sandbox{account ? ` en la cuenta ${account}` : ""}.
        </p>
      </div>
      {activityUrl ? (
        <a
          href={activityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-full bg-(--pp-ink) text-[15px] font-bold text-white transition-colors hover:bg-black ${focusRing}`}
        >
          Abrir PayPal sandbox
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
      ) : null}
      <p className="text-center text-[12px] leading-snug text-(--pp-muted)">
        Inicia sesión con la cuenta de prueba business del comercio para ver el pago llegar.
      </p>
    </section>
  );
}

function PaymentRow({ payment }: { payment: MerchantPayPalPayment }) {
  const status = paymentStatus(payment);
  const amount = paymentAmount(payment);
  const captureId = payment.paypal.read === "OK" ? payment.paypal.capture?.id : undefined;
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-(--pp-chip)">
          <CompasMark className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">Pedido con COMPAS</span>
          <span className="block truncate text-[12px] text-(--pp-muted)">{dateFormat.format(new Date(payment.recordedAt))}</span>
        </span>
        <span className={`text-[15px] font-semibold tabular-nums ${status.tone === "ok" ? "text-(--pp-green)" : ""}`}>
          {amount ? `${status.tone === "ok" ? "+" : ""}${formatMoneyAmount(amount)}` : "—"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-13 text-[11px] text-(--pp-muted)">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_LOOK[status.tone]}`}>{status.label}</span>
        <span className="font-mono">Orden {payment.orderId}</span>
        {captureId ? <span className="font-mono">Transacción {captureId}</span> : null}
      </div>
    </li>
  );
}

function PaymentsSection({ resource }: { resource: ReturnType<typeof useMerchantPayPalPayments> }) {
  const { resource: state, reload, refreshError } = resource;
  return (
    <Section title="Pagos con COMPAS" aside={<span className="text-[11px] text-(--pp-muted)">Leídos de PayPal sandbox</span>}>
      {state.status === "loading" ? <p className="py-3 text-[13px] text-(--pp-muted)">Consultando PayPal…</p> : null}
      {state.status === "error" ? (
        <div className="space-y-2 py-2">
          <p role="alert" className="rounded-xl bg-(--pp-sand) p-3 text-[13px]">
            {errorText(errorCode(state.error))}
          </p>
          <button type="button" onClick={reload} className={`text-[13px] font-semibold underline ${focusRing}`}>
            Reintentar
          </button>
        </div>
      ) : null}
      {refreshError ? <p className="text-[12px] text-(--pp-muted)">Sin conexión. Mostrando la última consulta.</p> : null}
      {state.status === "ready" ? (
        state.data.payments.length > 0 ? (
          <ul className="divide-y divide-(--pp-line)">
            {state.data.payments.map((payment) => (
              <PaymentRow key={payment.orderId} payment={payment} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-(--pp-chip) p-4 text-[13px] leading-snug text-(--pp-muted)">
            Aún no hay pagos COMPAS para esta cuenta. Cobra un pedido con COMPAS y, cuando quien paga lo apruebe, aparecerá
            aquí.
          </p>
        )
      ) : null}
    </Section>
  );
}

/** COMPAS's entry, styled like PayPal's grey callouts. The mark is COMPAS's own logo. */
function CompasCallout({
  config,
  onOpenCompas,
  compasRowRef,
}: {
  config: MerchantCompasConfig;
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  const accepted = config.categories.map((category) => CATEGORY_LABEL[category]).join(", ");
  return (
    <button
      ref={compasRowRef}
      type="button"
      onClick={onOpenCompas}
      className={`flex w-full items-center gap-3 rounded-2xl bg-(--pp-chip) p-3.5 text-left transition-colors hover:bg-(--pp-chip-strong) ${focusRing}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
        <CompasMark className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-bold">COMPAS</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              config.enabled ? "bg-(--pp-mint) text-(--pp-green)" : "bg-white text-(--pp-muted)"
            }`}
          >
            {config.enabled ? "Activo" : "Inactivo"}
          </span>
        </span>
        <span className="block text-[13px] leading-snug text-(--pp-muted)">
          {config.enabled && accepted
            ? `Cobra con propósito: ${accepted.toLowerCase()}.`
            : "Cobra con propósito."}
        </span>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white">
        <ChevronRightIcon className="size-4" />
      </span>
    </button>
  );
}

/**
 * The merchant's PayPal Business screen. The chrome is a simulation; the
 * account and its COMPAS payments are the real PayPal sandbox, read through
 * the backend, and the button opens the sandbox itself.
 */
export function PayPalBusinessHome({
  config,
  onOpenCompas,
  compasRowRef,
}: {
  config: MerchantCompasConfig;
  onOpenCompas: () => void;
  compasRowRef: RefObject<HTMLButtonElement | null>;
}) {
  const { charge } = useDemoSession();
  // Read PayPal again as soon as the open charge is paid, not at the next poll.
  const payments = useMerchantPayPalPayments(MERCHANT.id, true, charge && chargePaymentCompleted(charge) ? 1 : 0);
  const data = payments.resource.status === "ready" ? payments.resource.data : undefined;

  return (
    <div className="relative h-full">
      <div className="h-full overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <BusinessTopBar />
        <div className="space-y-7 px-5 pt-2 pb-32">
          <SandboxAccountCard
            {...(data
              ? {
                  account: data.merchant.paypalMerchantId,
                  total: receivedTotal(data.payments),
                  activityUrl: sandboxUrl(data.sandboxActivityUrl),
                }
              : {})}
          />
          <CompasCallout config={config} onOpenCompas={onOpenCompas} compasRowRef={compasRowRef} />
          <PaymentsSection resource={payments} />
          <footer className="pt-4 text-center">
            <p className="text-[11px] leading-relaxed text-(--pp-muted)">
              Pantalla de la demo de COMPAS con el aspecto de PayPal Business. No es la app oficial. La cuenta y los pagos
              son reales del sandbox de PayPal: cuentas de prueba, sin dinero real.
            </p>
          </footer>
        </div>
      </div>
      <PayPalBottomNav items={businessNavItems} qrLabel="Cobrar con código QR" />
    </div>
  );
}
