"use client";

import { useState } from "react";
import { formatMoneyAmount } from "@/lib/format-money";
import { compasApi, errorCode } from "../api/client";
import type { MandateView, SpendingResponse } from "../api/contracts";
import { useMandate, useSpending } from "../api/hooks";
import { formatDate } from "../lib/dates";
import { categoryList, ENFORCEMENT_LABEL, errorText, isAuthorized, payerStatusLabel } from "../lib/labels";
import { ActivityList } from "../ui/ActivityList";
import { CapacityRoute } from "../ui/CapacityRoute";
import { ChevronRightIcon, ShieldIcon, WalletIcon } from "../ui/icons";
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
  StaleDataNotice,
  StatusBadge,
} from "../ui/primitives";
import { Avatar, CategoryStack } from "../ui/visuals";

export type DetailNotice =
  | { kind: "consent-return"; result: "granted" | "rejected" | "failed" }
  | { kind: "authorize-error"; code: string }
  /** Saved as a draft on purpose: this environment can't ask the wallet for a grant. */
  | { kind: "draft-saved"; reason: string };

function ConsentReturnNotice({ result, status }: { result: "granted" | "rejected" | "failed"; status: MandateView["status"] }) {
  if (result === "granted") {
    return status === "ACTIVE" ? (
      <Notice title="Presupuesto activo">Tu billetera confirmó la autorización.</Notice>
    ) : (
      <Notice tone="warn" title="Confirmando tu autorización">
        Tu billetera respondió. Esta pantalla se actualiza sola.
      </Notice>
    );
  }
  if (result === "rejected") {
    return (
      <Notice tone="warn" title="No autorizaste el presupuesto">
        Puedes intentarlo de nuevo cuando quieras.
      </Notice>
    );
  }
  return (
    <Notice tone="danger" title="No pudimos completar la autorización">
      La respuesta de tu billetera no se pudo verificar. El presupuesto no quedó activo.
    </Notice>
  );
}

function Totals({ mandate, spending }: { mandate: MandateView; spending?: SpendingResponse }) {
  const totals = spending?.activity.totals;
  const authorized = isAuthorized(mandate);
  return (
    <Facts
      rows={[
        { label: "Para", value: mandate.delegate.displayName },
        {
          label: "Uso",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <CategoryStack categories={mandate.purposePolicy.eligibleCategories} />
              {categoryList(mandate.purposePolicy.eligibleCategories)}
            </span>
          ),
        },
        { label: authorized ? "Presupuesto autorizado" : "Presupuesto por autorizar", value: formatMoneyAmount(mandate.budget) },
        ...(authorized
          ? [
              { label: "Pagado", value: totals ? formatMoneyAmount(totals.completed) : "…" },
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
            ]
          : []),
        { label: "Vigencia", value: `${formatDate(mandate.validFrom)} al ${formatDate(mandate.expiresAt)}` },
        { label: "Control", value: ENFORCEMENT_LABEL[mandate.purposePolicy.enforcement] },
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
  payerGrants,
}: {
  partyId: string;
  id: string;
  active: boolean;
  focusOnMount: boolean;
  notice?: DetailNotice;
  onOpenHistory: () => void;
  onRedirectToWallet: (redirectUrl: string) => void;
  /** Whether this session may ask the wallet for a grant. Unknown until /me answers. */
  payerGrants?: "enabled" | "disabled_for_demo" | "not_configured";
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
  const entries = spendingData?.activity.entries ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={view.delegate.displayName} seed={view.delegate.id} size="lg" />
        <div className="min-w-0 space-y-1">
          <ScreenHeading focusOnMount={focusOnMount}>Para {view.delegate.displayName}</ScreenHeading>
          <StatusBadge status={view.status} label={payerStatusLabel(view)} />
        </div>
      </div>

      {notice?.kind === "consent-return" ? <ConsentReturnNotice result={notice.result} status={view.status} /> : null}
      {notice?.kind === "draft-saved" && view.status === "DRAFT" ? (
        <Notice tone="warn" title="Borrador guardado, sin autorizar">
          {errorText(notice.reason)} {view.delegate.displayName} aún no lo ve.
        </Notice>
      ) : null}
      {mandate.refreshError ? <StaleDataNotice error={mandate.refreshError} /> : null}
      {authorizeError && auth?.canAuthorize ? (
        <Notice tone="danger" title="La autorización no empezó">
          {errorText(authorizeError)}
        </Notice>
      ) : null}
      {cancellationPending ? (
        <Notice tone="warn" title="Revocado, falta confirmar en tu billetera">
          Ya no se puede pagar con este presupuesto. Reintenta la cancelación abajo.
        </Notice>
      ) : null}

      <div className="rounded-(--cx-radius) border border-(--cx-line) p-4">
        <CapacityRoute mandate={view} />
      </div>

      {auth?.canAuthorize && payerGrants && payerGrants !== "enabled" && notice?.kind !== "draft-saved" ? (
        <p className="flex gap-2 rounded-(--cx-radius) bg-(--cx-card) p-3 text-[13px] text-(--cx-muted)">
          <ShieldIcon className="mt-px size-[18px] shrink-0" />
          {errorText(payerGrants === "not_configured" ? "OPEN_PAYMENTS_NOT_CONFIGURED" : "PAYER_GRANTS_DISABLED_FOR_DEMO")}
        </p>
      ) : null}
      {auth?.canAuthorize && payerGrants === "enabled" ? (
        <div className="space-y-2">
          <Button onClick={authorize} disabled={busy !== null}>
            <ShieldIcon className="size-5" />
            {busy === "authorize"
              ? "Abriendo tu billetera…"
              : view.status === "PENDING_AUTHORIZATION"
                ? "Reintentar autorización"
                : "Autorizar en mi billetera"}
          </Button>
          <p className="text-center text-[12px] text-(--cx-muted)">Aprobarás un permiso de hasta {formatMoneyAmount(view.budget)}.</p>
        </div>
      ) : null}

      {spendingData && !spendingData.activity.totals.capacityReconciled ? (
        <Notice tone="warn" title="La capacidad aún no descuenta todas las compras">
          Tu billetera sigue limitando el gasto total a {formatMoneyAmount(view.budget)}.
        </Notice>
      ) : null}

      <p className="flex gap-2 text-[13px] leading-snug text-(--cx-ink)">
        <WalletIcon className="mt-px size-[18px] shrink-0 text-(--cx-route)" />
        {isAuthorized(view)
          ? "Es una autorización, no un saldo: el dinero sigue en tu billetera."
          : `Aún no autoriza nada. Tu dinero no se mueve.`}
      </p>

      <section aria-labelledby="detail-activity" className="space-y-1">
        <SectionTitle id="detail-activity">Movimientos</SectionTitle>
        {entries.length > 0 ? (
          <>
            <ActivityList entries={entries.slice(0, 3)} />
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex w-full items-center justify-between py-2 text-[14px] font-semibold text-(--cx-ink) focus-visible:outline-2 focus-visible:outline-(--cx-focus)"
            >
              Ver todos
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : (
          <p className="py-2 text-[13px] text-(--cx-muted)">
            {view.status === "ACTIVE" ? "Aún no hay compras." : "Sin movimientos."}
          </p>
        )}
      </section>

      <section aria-labelledby="detail-summary" className="space-y-1">
        <SectionTitle id="detail-summary">Resumen</SectionTitle>
        <Totals mandate={view} spending={spendingData} />
      </section>

      <details className="rounded-(--cx-radius) border border-(--cx-line) [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between p-3.5 text-[14px] font-semibold text-(--cx-ink)">
          Reglas completas
          <ChevronRightIcon className="size-4 text-(--cx-muted)" />
        </summary>
        <div className="border-t border-(--cx-line) p-3.5">
          <RulesSummary policy={view.purposePolicy} />
        </div>
      </details>

      {auth?.canRevoke ? (
        <div className="space-y-2">
          <Button variant="danger" onClick={() => (cancellationPending ? revoke() : setConfirming(true))} disabled={busy !== null}>
            {cancellationPending
              ? busy === "revoke"
                ? "Reintentando…"
                : "Reintentar cancelación"
              : draftOnly
                ? "Descartar borrador"
                : "Revocar autorización"}
          </Button>
          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        </div>
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
          ? "No se podrá autorizar después."
          : `${view.delegate.displayName} ya no podrá pagar con este presupuesto. Las compras ya pagadas no se revierten.`}
      </ConfirmDialog>
    </div>
  );
}
