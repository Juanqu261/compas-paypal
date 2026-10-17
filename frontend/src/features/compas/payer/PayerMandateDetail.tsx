"use client";

import { useState } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import { compasApi, errorCode } from "../api/client";
import type { MandateView, SpendingResponse } from "../api/contracts";
import { useMandate, useSpending } from "../api/hooks";
import { formatDate } from "../lib/dates";
import { errorText, isAuthorized, payerStatusLabel, purposeTitle } from "../lib/labels";
import { ActivityList } from "../ui/ActivityList";
import { CapacityRoute } from "../ui/CapacityRoute";
import { RulesSummary } from "../ui/RulesSummary";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Facts,
  LoadingState,
  Notice,
  ScreenHeading,
  SectionTitle,
  StatusBadge,
} from "../ui/primitives";

export type DetailNotice =
  | { kind: "consent-return"; result: "granted" | "rejected" | "failed" }
  | { kind: "authorize-error"; code: string };

function ConsentReturnNotice({ result, status }: { result: "granted" | "rejected" | "failed"; status: MandateView["status"] }) {
  if (result === "granted") {
    return status === "ACTIVE" ? (
      <Notice title="Presupuesto activo">Tu billetera confirmó el permiso. Ya se pueden hacer compras con estas reglas.</Notice>
    ) : (
      <Notice tone="warn" title="Estamos confirmando tu autorización">
        Tu billetera respondió, pero COMPAS aún no registra el permiso. Esta pantalla se actualiza sola.
      </Notice>
    );
  }
  if (result === "rejected") {
    return (
      <Notice tone="warn" title="No autorizaste el presupuesto">
        Rechazaste el permiso en tu billetera. Puedes intentarlo de nuevo cuando quieras.
      </Notice>
    );
  }
  return (
    <Notice tone="danger" title="No pudimos completar la autorización">
      La respuesta de tu billetera no se pudo verificar. El presupuesto no quedó activo. Intenta de nuevo.
    </Notice>
  );
}

function Totals({ mandate, spending }: { mandate: MandateView; spending?: SpendingResponse }) {
  const totals = spending?.activity.totals;
  const authorized = isAuthorized(mandate);
  return (
    <Facts
      rows={[
        { label: authorized ? "Presupuesto autorizado" : "Presupuesto por autorizar", value: formatMoneyAmount(mandate.budget) },
        ...(authorized
          ? [
              { label: "Pagado y confirmado", value: totals ? formatMoneyAmount(totals.completed) : "…" },
              ...(totals && totals.inProgressCount > 0
                ? [{ label: `En proceso (${totals.inProgressCount})`, value: formatMoneyAmount(totals.inProgress) }]
                : []),
              ...(spending?.providerSpentAvailable
                ? [
                    {
                      label: "Debitado según tu billetera",
                      value: formatMoneyAmount(spending.providerSpent ?? { ...mandate.budget, value: "0" }),
                    },
                  ]
                : []),
              { label: "Capacidad restante", value: formatMoneyAmount(mandate.remainingAuthorizedAmount) },
            ]
          : []),
        { label: "Vigencia", value: `${formatDate(mandate.validFrom)} al ${formatDate(mandate.expiresAt)}` },
        { label: "Quién paga", value: mandate.delegate.displayName },
        { label: "Para quién", value: mandate.beneficiary.displayName },
        { label: "Estado", value: payerStatusLabel(mandate) },
      ]}
    />
  );
}

export function PayerMandateDetail({
  partyId,
  id,
  active,
  focusOnMount,
  notice,
  onOpenHistory,
  onRedirectToWallet,
}: {
  partyId: string;
  id: string;
  active: boolean;
  focusOnMount: boolean;
  notice?: DetailNotice;
  onOpenHistory: () => void;
  onRedirectToWallet: (redirectUrl: string) => void;
}) {
  const mandate = useMandate(partyId, id, active);
  const spending = useSpending(partyId, id, active);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"authorize" | "revoke" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [authorizeError, setAuthorizeError] = useState<string | null>(
    notice?.kind === "authorize-error" ? notice.code : null,
  );

  if (mandate.resource.status === "loading") return <LoadingState label="Cargando el presupuesto" />;
  if (mandate.resource.status === "error") return <ErrorState error={mandate.resource.error} onRetry={mandate.reload} />;
  const view = mandate.resource.data;
  const auth = view.authorization;
  const spendingData = spending.resource.status === "ready" ? spending.resource.data : undefined;

  async function authorize() {
    setBusy("authorize");
    setActionError(null);
    try {
      const { redirectUrl } = await compasApi.authorize(partyId, id);
      onRedirectToWallet(redirectUrl);
    } catch (error) {
      setAuthorizeError(errorCode(error));
      mandate.reload();
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    setActionError(null);
    try {
      await compasApi.revoke(partyId, id);
      setConfirming(false);
    } catch (error) {
      setActionError(errorText(errorCode(error)));
    } finally {
      setBusy(null);
      mandate.reload();
      spending.reload();
    }
  }

  const draftOnly = view.status === "DRAFT";
  const cancellationPending = view.status === "REVOKED" && auth?.grantCancellation === "PENDING";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <StatusBadge status={view.status} label={payerStatusLabel(view)} />
        <ScreenHeading focusOnMount={focusOnMount}>{purposeTitle(view)}</ScreenHeading>
      </div>

      {notice?.kind === "consent-return" ? <ConsentReturnNotice result={notice.result} status={view.status} /> : null}
      {authorizeError && auth?.canAuthorize ? (
        <Notice tone="danger" title="La autorización no empezó">
          {errorText(authorizeError)}
        </Notice>
      ) : null}
      {cancellationPending ? (
        <Notice tone="warn" title="Revocado en COMPAS, falta tu billetera">
          COMPAS ya no permite compras con este presupuesto. Tu billetera aún no confirmó que canceló el permiso.
          Vuelve a intentarlo abajo.
        </Notice>
      ) : null}

      <CapacityRoute mandate={view} />
      {spendingData && !spendingData.activity.totals.capacityReconciled ? (
        <Notice tone="warn" title="La capacidad aún no descuenta todas las compras">
          COMPAS registró pagos por {formatMoneyAmount(spendingData.activity.totals.completed)}
          {spendingData.activity.totals.inProgressCount > 0
            ? ` y ${formatMoneyAmount(spendingData.activity.totals.inProgress)} en proceso`
            : ""}
          , que la capacidad restante todavía no refleja. El permiso en tu billetera sigue limitando el gasto total
          a {formatMoneyAmount(view.budget)}.
        </Notice>
      ) : null}
      <p className="text-[13px] leading-snug text-(--cx-muted)">
        {isAuthorized(view)
          ? "Es un permiso, no un saldo: el dinero sigue en tu billetera hasta que se pague una compra que cumpla tus reglas."
          : `Todavía no es un permiso. ${view.delegate.displayName} podrá pagar solo después de que lo apruebes en tu billetera. Tu dinero no se mueve.`}
      </p>

      <section aria-labelledby="detail-summary" className="space-y-1">
        <SectionTitle id="detail-summary">Resumen</SectionTitle>
        <Totals mandate={view} spending={spendingData} />
      </section>

      <section aria-labelledby="detail-rules" className="space-y-3">
        <SectionTitle id="detail-rules">Reglas</SectionTitle>
        <RulesSummary policy={view.purposePolicy} />
      </section>

      <section aria-labelledby="detail-activity" className="space-y-1">
        <SectionTitle id="detail-activity">Actividad</SectionTitle>
        {spendingData && spendingData.activity.entries.length > 0 ? (
          <>
            <ActivityList entries={spendingData.activity.entries.slice(0, 3)} />
            <Button variant="secondary" onClick={onOpenHistory}>
              Ver todos los movimientos
            </Button>
          </>
        ) : (
          <p className="py-2 text-[13px] text-(--cx-muted)">
            {view.status === "ACTIVE"
              ? "Aún no hay compras con este presupuesto."
              : "No hay movimientos. Solo un presupuesto activo puede tener compras."}
          </p>
        )}
      </section>

      {auth && (auth.canAuthorize || auth.canRevoke) ? (
        <section aria-labelledby="detail-admin" className="space-y-2">
          <SectionTitle id="detail-admin">Administración</SectionTitle>
          {auth.canAuthorize ? (
            <>
              <p className="text-[13px] leading-snug text-(--cx-muted)">
                {view.status === "PENDING_AUTHORIZATION"
                  ? "Falta que apruebes el permiso en tu billetera."
                  : "Este presupuesto todavía no está autorizado."}
              </p>
              <Button onClick={authorize} disabled={busy !== null}>
                {busy === "authorize"
                  ? "Abriendo tu billetera…"
                  : view.status === "PENDING_AUTHORIZATION"
                    ? "Reintentar autorización"
                    : "Autorizar en mi billetera"}
              </Button>
            </>
          ) : null}
          {auth.canRevoke ? (
            <Button variant="danger" onClick={() => (cancellationPending ? revoke() : setConfirming(true))} disabled={busy !== null}>
              {cancellationPending
                ? busy === "revoke"
                  ? "Reintentando…"
                  : "Reintentar cancelación en mi billetera"
                : draftOnly
                  ? "Descartar borrador"
                  : "Revocar autorización"}
            </Button>
          ) : null}
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        </section>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={draftOnly ? "¿Descartar este borrador?" : "¿Revocar esta autorización?"}
        confirmLabel={draftOnly ? "Descartar borrador" : "Revocar autorización"}
        busy={busy === "revoke"}
        onConfirm={revoke}
        onCancel={() => setConfirming(false)}
      >
        {draftOnly
          ? "El borrador no se podrá autorizar después."
          : `${view.delegate.displayName} ya no podrá pagar compras con este presupuesto. Si una compra ya se pagó, no se revierte.`}
      </ConfirmDialog>
    </div>
  );
}
