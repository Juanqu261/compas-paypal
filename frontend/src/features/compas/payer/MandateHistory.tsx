"use client";

import { formatMoneyAmount } from "@/lib/format-money";
import { useSpending } from "../api/hooks";
import { ActivityList } from "../ui/ActivityList";
import { EmptyState, ErrorState, Facts, LoadingState, ScreenHeading } from "../ui/primitives";

/** Every attempt under one budget, with paid and in-process totals kept apart. */
export function MandateHistory({
  partyId,
  id,
  active,
  focusOnMount,
}: {
  partyId: string;
  id: string;
  active: boolean;
  focusOnMount: boolean;
}) {
  const { resource, reload } = useSpending(partyId, id, active);
  return (
    <div className="space-y-5">
      <ScreenHeading focusOnMount={focusOnMount}>Movimientos</ScreenHeading>
      {resource.status === "loading" ? <LoadingState label="Cargando movimientos" /> : null}
      {resource.status === "error" ? <ErrorState error={resource.error} onRetry={reload} /> : null}
      {resource.status === "ready" ? (
        <>
          <Facts
            rows={[
              { label: "Pagado y confirmado", value: formatMoneyAmount(resource.data.activity.totals.completed) },
              { label: "En proceso", value: formatMoneyAmount(resource.data.activity.totals.inProgress) },
              { label: "Intentos de compra", value: String(resource.data.activity.totals.attempts) },
              { label: "Rechazadas o retenidas", value: String(resource.data.activity.totals.deniedCount + resource.data.activity.totals.reviewCount) },
              { label: "Pagadas bajo supervisión", value: String(resource.data.activity.totals.monitoredExceptions) },
            ]}
          />
          <p className="text-[12px] leading-snug text-(--cx-muted)">
            Un pago por aprobar o en proceso aún no está cobrado. Un intento rechazado, cancelado o fallido no cobró nada. Por privacidad, no
            mostramos los productos de cada compra.
          </p>
          {resource.data.activity.entries.length === 0 ? (
            <EmptyState title="Sin movimientos">Cuando alguien use este presupuesto, verás aquí cada intento.</EmptyState>
          ) : (
            <ActivityList entries={resource.data.activity.entries} />
          )}
        </>
      ) : null}
    </div>
  );
}
