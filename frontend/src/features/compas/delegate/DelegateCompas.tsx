"use client";

import type { DemoCharge } from "@/features/demo/DemoSession";
import { formatMoneyAmount } from "@/lib/format-money";
import type { MandateView } from "../api/contracts";
import { useMandate, useMandateList, useMe } from "../api/hooks";
import { DEMO_PARTY_IDS } from "../demo-identities";
import { formatDate } from "../lib/dates";
import { categoryList, CONFIDENCE_LABEL, ENFORCEMENT_LABEL, STATUS_LABEL } from "../lib/labels";
import { CapacityRoute } from "../ui/CapacityRoute";
import { ChevronRightIcon, ReceiptIcon, WalletIcon } from "../ui/icons";
import { MandateCard } from "../ui/MandateCard";
import { RulesSummary } from "../ui/RulesSummary";
import {
  Button,
  DemoModeNote,
  EmptyState,
  ErrorState,
  Facts,
  LoadingState,
  Notice,
  ScreenHeading,
  SectionTitle,
  StaleDataNotice,
  StatusBadge,
} from "../ui/primitives";
import { Avatar, CategoryStack } from "../ui/visuals";
import { DelegateCheckout } from "./DelegateCheckout";

export type DelegateRoute = { name: "list" } | { name: "detail"; id: string } | { name: "pay"; id: string };

/** The charge the host app received, if any, and where to report what the backend answered. */
export type DelegateCheckoutProps = {
  charge: DemoCharge | null;
  onResult: (chargeId: string, result: NonNullable<DemoCharge["result"]>) => void;
};

export const DELEGATE_ROUTE_TITLE: Record<DelegateRoute["name"], string> = {
  list: "COMPAS",
  detail: "Presupuesto",
  pay: "Pagar con COMPAS",
};

/** Money that is not hers: one line and a glyph, said once per screen. */
function NotYourMoney({ payer }: { payer?: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-(--cx-muted)">
      <WalletIcon className="size-[18px] shrink-0 text-(--cx-route)" />
      {payer ? `Pagas desde la billetera de ${payer}. No llega a tu Nequi.` : "Pagas desde la billetera de quien te autorizó."}
    </p>
  );
}

function DelegateList({
  partyId,
  active,
  openCount,
  focusOnMount,
  onOpen,
  onPay,
  charge,
}: {
  partyId: string;
  active: boolean;
  openCount: number;
  focusOnMount: boolean;
  onOpen: (id: string) => void;
  onPay: (id: string) => void;
  charge: DemoCharge | null;
}) {
  const { resource, reload, refreshError } = useMandateList(partyId, "delegate", active, openCount);
  const me = useMe(partyId, active, openCount);
  const persistence = me.resource.status === "ready" ? me.resource.data.persistence : undefined;
  const mandates = resource.status === "ready" ? resource.data : undefined;
  const usable = mandates?.filter((mandate) => mandate.usable) ?? [];
  const past = mandates?.filter((mandate) => !mandate.usable) ?? [];

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <ScreenHeading focusOnMount={focusOnMount}>Tus presupuestos</ScreenHeading>
        <NotYourMoney />
      </div>

      {charge && !charge.result ? (
        <div className="flex items-center gap-3 rounded-(--cx-radius) border border-(--cx-route)/40 bg-(--cx-route)/6 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--cx-route) text-white">
            <ReceiptIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-(--cx-ink)">Cobro de {charge.merchantDisplayName}</p>
            <p className="text-[13px] text-(--cx-ink) tabular-nums">{formatMoneyAmount(charge.amount)}</p>
          </div>
          {usable.length === 1 ? (
            <button
              type="button"
              onClick={() => onPay(usable[0].id)}
              className="h-10 shrink-0 rounded-full bg-(--cx-accent) px-4 text-[14px] font-semibold text-(--cx-on-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-focus)"
            >
              Revisar
            </button>
          ) : (
            <span className="shrink-0 text-[12px] text-(--cx-muted)">Elige un presupuesto</span>
          )}
        </div>
      ) : null}
      {refreshError ? <StaleDataNotice error={refreshError} /> : null}

      <section aria-labelledby="delegate-active" className="space-y-3">
        <SectionTitle id="delegate-active">Disponibles</SectionTitle>
        {resource.status === "loading" ? <LoadingState label="Cargando tus presupuestos" /> : null}
        {resource.status === "error" ? <ErrorState error={resource.error} onRetry={reload} /> : null}
        {mandates && usable.length === 0 ? (
          <EmptyState title="Aún no tienes presupuestos">
            Cuando alguien te autorice uno y lo apruebe en su billetera, aparecerá aquí.
          </EmptyState>
        ) : null}
        {usable.map((mandate) => (
          <MandateCard
            key={mandate.id}
            mandate={mandate}
            onOpen={() => onOpen(mandate.id)}
            action={<Button onClick={() => onPay(mandate.id)}>Pagar con COMPAS</Button>}
          />
        ))}
      </section>

      {past.length > 0 ? (
        <details className="group [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between py-1 text-[14px] font-semibold text-(--cx-ink)">
            Anteriores ({past.length})
            <ChevronRightIcon className="size-4 text-(--cx-muted) transition-transform group-open:rotate-90 motion-reduce:transition-none" />
          </summary>
          <div className="mt-3 space-y-3">
            {past.map((mandate) => (
              <MandateCard key={mandate.id} mandate={mandate} onOpen={() => onOpen(mandate.id)} />
            ))}
          </div>
        </details>
      ) : null}

      <DemoModeNote persistence={persistence} />
    </div>
  );
}

function UnusableNotice({ mandate }: { mandate: MandateView }) {
  if (mandate.status === "REVOKED") {
    return <Notice tone="warn" title="Revocado">{mandate.payer.displayName} retiró la autorización.</Notice>;
  }
  if (mandate.status === "EXPIRED") {
    return <Notice tone="warn" title="Vencido">Terminó el {formatDate(mandate.expiresAt)}.</Notice>;
  }
  if (mandate.status === "EXHAUSTED") {
    return <Notice tone="warn" title="Agotado">Ya se usó todo el presupuesto.</Notice>;
  }
  return null;
}

/** One budget, read-only. Andrea can't change or revoke what Pedro granted. */
function DelegateDetail({
  partyId,
  id,
  active,
  focusOnMount,
  onPay,
}: {
  partyId: string;
  id: string;
  active: boolean;
  focusOnMount: boolean;
  onPay: () => void;
}) {
  const { resource, reload, refreshError } = useMandate(partyId, id, active);
  if (resource.status === "loading") return <LoadingState label="Cargando el presupuesto" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={reload} />;
  const mandate = resource.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={mandate.payer.displayName} seed={mandate.payer.id} size="lg" />
        <div className="min-w-0 space-y-1">
          <ScreenHeading focusOnMount={focusOnMount}>De {mandate.payer.displayName}</ScreenHeading>
          <StatusBadge status={mandate.status} label={STATUS_LABEL[mandate.status]} />
        </div>
      </div>

      {refreshError ? <StaleDataNotice error={refreshError} /> : null}
      <UnusableNotice mandate={mandate} />

      <div className="rounded-(--cx-radius) border border-(--cx-line) p-4">
        <CapacityRoute mandate={mandate} />
      </div>
      {mandate.usable ? <Button onClick={onPay}>Pagar con COMPAS</Button> : null}
      <NotYourMoney payer={mandate.payer.displayName} />

      <Facts
        rows={[
          {
            label: "Uso",
            value: (
              <span className="inline-flex items-center gap-1.5">
                <CategoryStack categories={mandate.purposePolicy.eligibleCategories} />
                {categoryList(mandate.purposePolicy.eligibleCategories)}
              </span>
            ),
          },
          { label: "Hasta el", value: formatDate(mandate.expiresAt) },
          { label: "Control", value: ENFORCEMENT_LABEL[mandate.purposePolicy.enforcement] },
          { label: "Comercios", value: `Confianza ${CONFIDENCE_LABEL[mandate.purposePolicy.merchantConfidence.minimum].toLowerCase()} o más` },
        ]}
      />

      <details className="rounded-(--cx-radius) border border-(--cx-line) [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between p-3.5 text-[14px] font-semibold text-(--cx-ink)">
          Reglas completas
          <ChevronRightIcon className="size-4 text-(--cx-muted)" />
        </summary>
        <div className="border-t border-(--cx-line) p-3.5">
          <RulesSummary policy={mandate.purposePolicy} />
        </div>
      </details>
    </div>
  );
}

/** Paying under one budget. The budget is read from the backend; the charge comes from the host. */
function DelegatePay({
  partyId,
  id,
  active,
  focusOnMount,
  checkout,
}: {
  partyId: string;
  id: string;
  active: boolean;
  focusOnMount: boolean;
  checkout: DelegateCheckoutProps;
}) {
  const { resource, reload, refreshError } = useMandate(partyId, id, active);
  if (resource.status === "loading") return <LoadingState label="Cargando el presupuesto" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={reload} />;
  const mandate = resource.data;
  return (
    <div className="space-y-5">
      {/* The host header already says "Pagar con COMPAS". This heading is for screen readers and focus. */}
      <div className="sr-only">
        <ScreenHeading focusOnMount={focusOnMount}>Pagar con COMPAS</ScreenHeading>
      </div>
      {refreshError ? <StaleDataNotice error={refreshError} /> : null}
      {mandate.usable ? (
        <DelegateCheckout
          partyId={partyId}
          mandate={mandate}
          charge={checkout.charge}
          onResult={checkout.onResult}
          onPurchased={reload}
        />
      ) : (
        <UnusableNotice mandate={mandate} />
      )}
    </div>
  );
}

/** Andrea's COMPAS (delegate). She reads budgets and pays under them; she can't change them. */
export function DelegateCompas({
  route,
  onOpen,
  onPay,
  active,
  openCount,
  focusOnMount,
  checkout,
  partyId = DEMO_PARTY_IDS.andrea,
}: {
  route: DelegateRoute;
  onOpen: (id: string) => void;
  onPay: (id: string) => void;
  active: boolean;
  openCount: number;
  focusOnMount: boolean;
  checkout: DelegateCheckoutProps;
  partyId?: string;
}) {
  if (route.name === "pay") {
    return <DelegatePay key={route.id} partyId={partyId} id={route.id} active={active} focusOnMount={focusOnMount} checkout={checkout} />;
  }
  if (route.name === "detail") {
    return (
      <DelegateDetail
        key={route.id}
        partyId={partyId}
        id={route.id}
        active={active}
        focusOnMount={focusOnMount}
        onPay={() => onPay(route.id)}
      />
    );
  }
  return (
    <DelegateList
      partyId={partyId}
      active={active}
      openCount={openCount}
      focusOnMount={focusOnMount}
      onOpen={onOpen}
      onPay={onPay}
      charge={checkout.charge}
    />
  );
}
