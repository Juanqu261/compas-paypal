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
  { label: "Home", Icon: HomeIcon },
  { label: "Orders", Icon: OrdersIcon },
  { label: "Tools", Icon: ToolsIcon },
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
  if (paypal.read === "UNAVAILABLE") return { label: "PayPal did not respond", tone: "muted" };
  switch (paypal.capture?.status) {
    case "COMPLETED":
      return { label: "Payment received", tone: "ok" };
    case "PENDING":
      return { label: "Capture pending at PayPal", tone: "wait" };
    case "DECLINED":
    case "FAILED":
      return { label: "Payment declined", tone: "stop" };
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return { label: "Refunded", tone: "muted" };
  }
  switch (paypal.orderStatus) {
    case "APPROVED":
      return { label: "Approved, ready to capture", tone: "wait" };
    case "VOIDED":
      return { label: "Order voided", tone: "muted" };
    case "COMPLETED":
      return { label: "Completed", tone: "ok" };
    default:
      return { label: "Waiting for the payer to approve", tone: "wait" };
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

const dateFormat = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

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
            aria-label="Notifications"
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
    <section aria-label="PayPal sandbox account" className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-(--pp-navy) px-5 pt-5 pb-6 text-white">
        <span aria-hidden="true" className="absolute -top-10 -right-8 size-36 rounded-full bg-(--pp-blue)/45" />
        <span aria-hidden="true" className="absolute -right-2 -bottom-14 size-28 rounded-full bg-(--pp-sky)/25" />
        <p className="relative text-[14px] font-semibold text-white/80">Received with COMPAS</p>
        <p className="relative mt-2 text-[2.4rem] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
          {total ? formatMoneyAmount(total) : "—"}
        </p>
        <p className="relative mt-3 text-[12px] text-white/80">
          Captured by PayPal sandbox{account ? ` in account ${account}` : ""}.
        </p>
      </div>
      {activityUrl ? (
        <a
          href={activityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-full bg-(--pp-ink) text-[15px] font-bold text-white transition-colors hover:bg-black ${focusRing}`}
        >
          Open PayPal sandbox
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
      <p className="text-center text-[12px] leading-snug text-(--pp-muted)">
        Log in with the shop's business test account to see the payment arrive.
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
          <span className="block truncate text-[15px] font-semibold">Order with COMPAS</span>
          <span className="block truncate text-[12px] text-(--pp-muted)">{dateFormat.format(new Date(payment.recordedAt))}</span>
        </span>
        <span className={`text-[15px] font-semibold tabular-nums ${status.tone === "ok" ? "text-(--pp-green)" : ""}`}>
          {amount ? `${status.tone === "ok" ? "+" : ""}${formatMoneyAmount(amount)}` : "—"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-13 text-[11px] text-(--pp-muted)">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_LOOK[status.tone]}`}>{status.label}</span>
        <span className="font-mono">Order {payment.orderId}</span>
        {captureId ? <span className="font-mono">Transaction {captureId}</span> : null}
      </div>
    </li>
  );
}

function PaymentsSection({ resource }: { resource: ReturnType<typeof useMerchantPayPalPayments> }) {
  const { resource: state, reload, refreshError } = resource;
  return (
    <Section title="Payments with COMPAS" aside={<span className="text-[11px] text-(--pp-muted)">Read from PayPal sandbox</span>}>
      {state.status === "loading" ? <p className="py-3 text-[13px] text-(--pp-muted)">Checking with PayPal…</p> : null}
      {state.status === "error" ? (
        <div className="space-y-2 py-2">
          <p role="alert" className="rounded-xl bg-(--pp-sand) p-3 text-[13px]">
            {errorText(errorCode(state.error))}
          </p>
          <button type="button" onClick={reload} className={`text-[13px] font-semibold underline ${focusRing}`}>
            Try again
          </button>
        </div>
      ) : null}
      {refreshError ? <p className="text-[12px] text-(--pp-muted)">No connection. Showing the last result.</p> : null}
      {state.status === "ready" ? (
        state.data.payments.length > 0 ? (
          <ul className="divide-y divide-(--pp-line)">
            {state.data.payments.map((payment) => (
              <PaymentRow key={payment.orderId} payment={payment} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-(--pp-chip) p-4 text-[13px] leading-snug text-(--pp-muted)">
            There are no COMPAS payments for this account yet. Charge an order with COMPAS and, once the payer approves it, it will appear
            here.
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
            {config.enabled ? "Active" : "Inactive"}
          </span>
        </span>
        <span className="block text-[13px] leading-snug text-(--pp-muted)">
          {config.enabled && accepted
            ? `Charge by purpose: ${accepted.toLowerCase()}.`
            : "Charge by purpose."}
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
              A COMPAS demo screen styled like PayPal Business. It is not the official app. The account and payments
              are real PayPal sandbox data: test accounts, no real money.
            </p>
          </footer>
        </div>
      </div>
      <PayPalBottomNav items={businessNavItems} qrLabel="Charge with QR code" />
    </div>
  );
}
