"use client";

import { formatMoneyAmount } from "@/lib/format-money";
import { compasApi } from "../api/client";
import type { ActivityEntry, MandateView, Money } from "../api/contracts";
import { useMandateList, useResource } from "../api/hooks";
import { purposeTitle } from "../lib/labels";
import { ActivityList } from "../ui/ActivityList";
import { PlusIcon } from "../ui/icons";
import { MandateCard } from "../ui/MandateCard";
import { Button, DemoModeNote, EmptyState, ErrorState, LoadingState, ScreenHeading, SectionTitle } from "../ui/primitives";

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
  const { resource, reload } = useMandateList(partyId, "payer", active, openCount);
  const mandates = resource.status === "ready" ? [...resource.data].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : undefined;
  const recent = useRecentActivity(partyId, mandates, active);
  const capacity = mandates ? activeCapacity(mandates) : [];
  const activeCount = mandates?.filter((mandate) => mandate.status === "ACTIVE").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <ScreenHeading focusOnMount={focusOnMount}>Tu dinero, tus reglas</ScreenHeading>
        <p className="mt-2 text-[14px] leading-relaxed text-(--cx-muted)">
          Autoriza a alguien de confianza a pagar compras con un propósito. El dinero se queda en tu billetera y
          sale directo al comercio solo si la compra cumple tus reglas.
        </p>
        <div className="mt-4">
          <Button onClick={onCreate}>
            <PlusIcon className="size-5" />
            Crear presupuesto
          </Button>
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="rounded-(--cx-radius) bg-(--cx-card) p-4">
          <p className="text-[13px] text-(--cx-muted)">
            {activeCount === 1 ? "1 presupuesto activo" : `${activeCount} presupuestos activos`}
          </p>
          {capacity.map((amount) => (
            <p key={amount.assetCode} className="text-[20px] font-semibold text-(--cx-ink) tabular-nums">
              {formatMoneyAmount(amount)}
              <span className="ml-1.5 text-[13px] font-normal text-(--cx-muted)">de capacidad autorizada</span>
            </p>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="payer-budgets" className="space-y-3">
        <SectionTitle id="payer-budgets">Mis presupuestos</SectionTitle>
        {resource.status === "loading" ? <LoadingState label="Cargando tus presupuestos" /> : null}
        {resource.status === "error" ? <ErrorState error={resource.error} onRetry={reload} /> : null}
        {mandates && mandates.length === 0 ? (
          <EmptyState title="Aún no tienes presupuestos">
            Crea uno para que alguien de confianza pague compras de un propósito, como medicamentos, sin recibir tu
            dinero.
          </EmptyState>
        ) : null}
        {mandates?.map((mandate) => (
          <MandateCard key={mandate.id} mandate={mandate} onOpen={() => onOpen(mandate.id)} />
        ))}
      </section>

      {recent.resource.status === "ready" && recent.resource.data.length > 0 ? (
        <section aria-labelledby="payer-recent" className="space-y-1">
          <SectionTitle id="payer-recent">Actividad reciente</SectionTitle>
          <ActivityList entries={recent.resource.data.map((item) => item.entry)} />
        </section>
      ) : null}

      <DemoModeNote persistence={persistence} />
    </div>
  );
}
