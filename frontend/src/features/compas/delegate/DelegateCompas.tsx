"use client";

import { formatMoneyAmount } from "@/lib/format-money";
import type { MandateView } from "../api/contracts";
import { useMandate, useMandateList } from "../api/hooks";
import { DEMO_PARTY_IDS } from "../demo-identities";
import { formatDate } from "../lib/dates";
import { CONFIDENCE_LABEL, ENFORCEMENT_LABEL, purposeTitle, STATUS_LABEL } from "../lib/labels";
import { CapacityRoute } from "../ui/CapacityRoute";
import { WalletIcon } from "../ui/icons";
import { MandateCard } from "../ui/MandateCard";
import { RulesSummary } from "../ui/RulesSummary";
import {
  DemoModeNote,
  EmptyState,
  ErrorState,
  Facts,
  LoadingState,
  Notice,
  ScreenHeading,
  SectionTitle,
  StatusBadge,
} from "../ui/primitives";

export type DelegateRoute = { name: "list" } | { name: "detail"; id: string };

export const DELEGATE_ROUTE_TITLE: Record<DelegateRoute["name"], string> = {
  list: "Tus autorizaciones",
  detail: "Autorización",
};

function DelegateList({
  partyId,
  active,
  openCount,
  focusOnMount,
  onOpen,
}: {
  partyId: string;
  active: boolean;
  openCount: number;
  focusOnMount: boolean;
  onOpen: (id: string) => void;
}) {
  const { resource, reload } = useMandateList(partyId, "delegate", active, openCount);
  const mandates = resource.status === "ready" ? resource.data : undefined;
  const usable = mandates?.filter((mandate) => mandate.status === "ACTIVE") ?? [];
  const past = mandates?.filter((mandate) => mandate.status !== "ACTIVE") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <ScreenHeading focusOnMount={focusOnMount}>Te dieron permiso para pagar</ScreenHeading>
        <p className="mt-2 text-[14px] leading-relaxed text-(--cx-muted)">
          Aquí ves los presupuestos que alguien de confianza te autorizó. La plata sigue en su cuenta y sale directo
          al comercio. No pasa por tu Nequi.
        </p>
      </div>

      <section aria-labelledby="delegate-active" className="space-y-3">
        <SectionTitle id="delegate-active">Activas</SectionTitle>
        {resource.status === "loading" ? <LoadingState label="Cargando tus autorizaciones" /> : null}
        {resource.status === "error" ? <ErrorState error={resource.error} onRetry={reload} /> : null}
        {mandates && usable.length === 0 ? (
          <EmptyState title="No tienes autorizaciones activas">
            Cuando alguien te autorice un presupuesto y lo apruebe en su billetera, aparecerá aquí.
          </EmptyState>
        ) : null}
        {usable.map((mandate) => (
          <MandateCard key={mandate.id} mandate={mandate} onOpen={() => onOpen(mandate.id)} />
        ))}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="delegate-past" className="space-y-3">
          <SectionTitle id="delegate-past">Anteriores</SectionTitle>
          {past.map((mandate) => (
            <MandateCard key={mandate.id} mandate={mandate} onOpen={() => onOpen(mandate.id)} />
          ))}
        </section>
      ) : null}

      <DemoModeNote persistence="IN_MEMORY_DEMO" />
    </div>
  );
}

function UnusableNotice({ mandate }: { mandate: MandateView }) {
  if (mandate.status === "REVOKED") {
    return (
      <Notice tone="warn" title="Esta autorización fue revocada">
        {mandate.payer.displayName} retiró el permiso. Ya no puedes pagar con este presupuesto.
      </Notice>
    );
  }
  if (mandate.status === "EXPIRED") {
    return (
      <Notice tone="warn" title="Esta autorización venció">
        Terminó el {formatDate(mandate.expiresAt)}. Ya no puedes pagar con este presupuesto.
      </Notice>
    );
  }
  if (mandate.status === "EXHAUSTED") {
    return <Notice tone="warn" title="Ya se usó todo el presupuesto">No queda capacidad para nuevas compras.</Notice>;
  }
  return null;
}

function DelegateDetail({ partyId, id, active, focusOnMount }: { partyId: string; id: string; active: boolean; focusOnMount: boolean }) {
  const { resource, reload } = useMandate(partyId, id, active);
  if (resource.status === "loading") return <LoadingState label="Cargando la autorización" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={reload} />;
  const mandate = resource.data;
  const { minimum } = mandate.purposePolicy.merchantConfidence;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <StatusBadge status={mandate.status} label={STATUS_LABEL[mandate.status]} />
        <ScreenHeading focusOnMount={focusOnMount}>{purposeTitle(mandate)}</ScreenHeading>
        <p className="text-[14px] text-(--cx-muted)">
          {mandate.payer.displayName} te autorizó a pagar compras para {mandate.beneficiary.displayName}.
        </p>
      </div>

      <UnusableNotice mandate={mandate} />

      <CapacityRoute mandate={mandate} />

      <div className="flex gap-2.5 rounded-(--cx-radius) bg-(--cx-card) p-3 text-[13px] leading-snug text-(--cx-ink)">
        <WalletIcon className="mt-px size-[18px] shrink-0 text-(--cx-route)" />
        <p>
          Este dinero no es tuyo ni está en tu Nequi. Sigue en la billetera de {mandate.payer.displayName} y solo sale,
          directo al comercio, cuando pagas una compra que cumple sus reglas.
        </p>
      </div>

      <section aria-labelledby="delegate-summary" className="space-y-1">
        <SectionTitle id="delegate-summary">Condiciones</SectionTitle>
        <Facts
          rows={[
            { label: "Quién te dio el permiso", value: mandate.payer.displayName },
            { label: "Para quién se gasta", value: mandate.beneficiary.displayName },
            { label: "Capacidad restante", value: formatMoneyAmount(mandate.remainingAuthorizedAmount) },
            { label: "Vigencia", value: `${formatDate(mandate.validFrom)} al ${formatDate(mandate.expiresAt)}` },
            { label: "Modo", value: ENFORCEMENT_LABEL[mandate.purposePolicy.enforcement] },
            {
              label: "Comercios aceptados",
              value:
                minimum === "HIGH"
                  ? "Solo confianza alta"
                  : minimum === "MEDIUM"
                    ? "Confianza media o alta"
                    : `Confianza ${CONFIDENCE_LABEL[minimum].toLowerCase()} o mayor`,
            },
            { label: "Estado", value: STATUS_LABEL[mandate.status] },
          ]}
        />
      </section>

      <section aria-labelledby="delegate-rules" className="space-y-3">
        <SectionTitle id="delegate-rules">Qué puedes comprar</SectionTitle>
        <RulesSummary policy={mandate.purposePolicy} />
      </section>

      <section aria-labelledby="delegate-pay" className="space-y-2">
        <SectionTitle id="delegate-pay">Pagar con COMPAS</SectionTitle>
        {mandate.usable ? (
          <Notice title="El pago se activa en el comercio">
            Para pagar, el comercio debe crear el cobro desde Nequi Negocios. Esa conexión aún no está disponible en
            esta versión, así que todavía no puedes iniciar una compra desde aquí.
          </Notice>
        ) : (
          <p className="text-[13px] text-(--cx-muted)">Esta autorización no se puede usar para pagar.</p>
        )}
      </section>
    </div>
  );
}

/** Andrea's COMPAS (delegate). Read only: she can't revoke or change what Pedro granted. */
export function DelegateCompas({
  route,
  onOpen,
  active,
  openCount,
  focusOnMount,
  partyId = DEMO_PARTY_IDS.andrea,
}: {
  route: DelegateRoute;
  onOpen: (id: string) => void;
  active: boolean;
  openCount: number;
  focusOnMount: boolean;
  partyId?: string;
}) {
  if (route.name === "detail") {
    return <DelegateDetail key={route.id} partyId={partyId} id={route.id} active={active} focusOnMount={focusOnMount} />;
  }
  return <DelegateList partyId={partyId} active={active} openCount={openCount} focusOnMount={focusOnMount} onOpen={onOpen} />;
}
