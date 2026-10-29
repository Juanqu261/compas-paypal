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
      <ScreenHeading focusOnMount={focusOnMount}>Activity</ScreenHeading>
      {resource.status === "loading" ? <LoadingState label="Loading activity" /> : null}
      {resource.status === "error" ? <ErrorState error={resource.error} onRetry={reload} /> : null}
      {resource.status === "ready" ? (
        <>
          <Facts
            rows={[
              { label: "Paid and confirmed", value: formatMoneyAmount(resource.data.activity.totals.completed) },
              { label: "In progress", value: formatMoneyAmount(resource.data.activity.totals.inProgress) },
              { label: "Purchase attempts", value: String(resource.data.activity.totals.attempts) },
              { label: "Denied or held", value: String(resource.data.activity.totals.deniedCount + resource.data.activity.totals.reviewCount) },
              { label: "Paid with a notice", value: String(resource.data.activity.totals.monitoredExceptions) },
            ]}
          />
          <p className="text-[12px] leading-snug text-(--cx-muted)">
            A payment awaiting approval or in progress hasn&apos;t been charged yet. A denied, cancelled, or failed attempt charged nothing.
            For privacy, we don&apos;t show the products in each purchase.
          </p>
          {resource.data.activity.entries.length === 0 ? (
            <EmptyState title="No activity">When someone uses this budget, every attempt will show up here.</EmptyState>
          ) : (
            <ActivityList entries={resource.data.activity.entries} />
          )}
        </>
      ) : null}
    </div>
  );
}
