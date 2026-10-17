"use client";

import { formatMoneyAmount } from "@/lib/format-money";
import { compasApi } from "../api/client";
import type { ActivityEntry, MandateView, Money } from "../api/contracts";
import { useMandateList, useResource } from "../api/hooks";
import { purposeTitle } from "../lib/labels";
import { ActivityList } from "../ui/ActivityList";
import { PlusIcon, WalletIcon } from "../ui/icons";
import { MandateCard } from "../ui/MandateCard";
import {
  Button,
  DemoModeNote,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenHeading,
  SectionTitle,
  StaleDataNotice,
} from "../ui/primitives";

const ORDER: Record<MandateView["status"], number> = {
  ACTIVE: 0,
  PENDING_AUTHORIZATION: 1,
  DRAFT: 2,
  EXHAUSTED: 3,
  EXPIRED: 4,
  REVOKED: 5,
};

/** Capacity of active budgets, summed per asset. Never mixed across assets. */
function activeCapacity(mandates: readonly MandateView[]): Money[] {
  const byAsset = new Map<string, Money>();
  for (const mandate of mandates) {
    if (mandate.status !== "ACTIVE") continue;
    const { assetCode, assetScale, value } = mandate.remainingAuthorizedAmount;
    const key = `${assetCode}:${assetScale}`;
    const current = byAsset.get(key);
    byAsset.set(key, {
      assetCode,
      assetScale,
      value: (BigInt(current?.value ?? "0") + BigInt(value)).toString(),
    });
  }
  return [...byAsset.values()];
}

/** Recent attempts across budgets the payer already authorized. Real records only. */
function useRecentActivity(partyId: string, mandates: readonly MandateView[] | undefined, active: boolean) {
  const consented = (mandates ?? [])
    .filter((mandate) => mandate.authorization?.consent === "GRANTED")
    .slice(0, 5);
  const key = active && consented.length > 0 ? consented.map((mandate) => mandate.id).join(",") : null;
  return useResource<{ entry: ActivityEntry; title: string }[]>(key, async () => {
    const reports = await Promise.all(
      consented.map(async (mandate) => ({ mandate, report: await compasApi.spending(partyId, mandate.id) })),
    );
    return reports
      .flatMap(({ mandate, report }) => report.activity.entries.map((entry) => ({ entry, title: purposeTitle(mandate) })))
      .sort((a, b) => b.entry.recordedAt.localeCompare(a.entry.recordedAt))
      .slice(0, 3);
  });
}

export function PayerHome({
  partyId,
  active,
  openCount,
  focusOnMount,
  persistence,
  onCreate,
  onOpen,
}: {
  partyId: string;
  active: boolean;
  openCount: number;
  focusOnMount: boolean;
  persistence?: string;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const { resource, reload, refreshError } = useMandateList(partyId, "payer", active, openCount);
  const mandates = resource.status === "ready" ? [...resource.data].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : undefined;
  const recent = useRecentActivity(partyId, mandates, active);
  const capacity = mandates ? activeCapacity(mandates) : [];
  const activeCount = mandates?.filter((mandate) => mandate.status === "ACTIVE").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <ScreenHeading focusOnMount={focusOnMount}>Presupuestos</ScreenHeading>
        <p className="mt-1 text-[14px] text-(--cx-muted)">Autoriza pagos sin enviar tu dinero.</p>
      </div>

      {activeCount > 0 ? (
        <div className="rounded-(--cx-radius) bg-(--cx-accent) p-4 text-(--cx-on-accent)">
          <p className="flex items-center gap-2 text-[13px] opacity-80">
            <WalletIcon className="size-4" />
            Disponible para pagar
          </p>
          {capacity.map((amount) => (
            <p key={amount.assetCode} className="mt-1 text-[28px] leading-tight font-semibold tracking-tight tabular-nums">
              {formatMoneyAmount(amount)}
            </p>
          ))}
          <p className="mt-1 text-[12px] opacity-80">
            {activeCount === 1 ? "En 1 presupuesto activo" : `En ${activeCount} presupuestos activos`}. Sigue en tu billetera.
          </p>
        </div>
      ) : null}

      <Button onClick={onCreate}>
        <PlusIcon className="size-5" />
        Crear presupuesto
      </Button>

      <section aria-labelledby="payer-budgets" className="space-y-3">
        <SectionTitle id="payer-budgets">Tus presupuestos</SectionTitle>
        {refreshError ? <StaleDataNotice error={refreshError} /> : null}
        {resource.status === "loading" ? <LoadingState label="Cargando tus presupuestos" /> : null}
        {resource.status === "error" ? <ErrorState error={resource.error} onRetry={reload} /> : null}
        {mandates && mandates.length === 0 ? (
          <EmptyState title="Aún no tienes presupuestos">
            Crea uno para que alguien de confianza pague compras como medicamentos, sin recibir tu dinero.
          </EmptyState>
        ) : null}
        {mandates?.map((mandate) => (
          <MandateCard key={mandate.id} mandate={mandate} onOpen={() => onOpen(mandate.id)} />
        ))}
      </section>

      {recent.resource.status === "ready" && recent.resource.data.length > 0 ? (
        <section aria-labelledby="payer-recent" className="space-y-1">
          <SectionTitle id="payer-recent">Movimientos recientes</SectionTitle>
          <ActivityList entries={recent.resource.data.map((item) => item.entry)} />
        </section>
      ) : null}

      <DemoModeNote persistence={persistence} />
    </div>
  );
}
