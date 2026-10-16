"use client";

import { formatMoneyAmount } from "@/compas/domain/money";
import { useDemoSession } from "@/features/demo/DemoSession";

type ExperienceCardProps = {
  surface: string;
  person: string;
  role: string;
};

export function ExperienceCard({ surface, person, role }: ExperienceCardProps) {
  const { scenario } = useDemoSession();
  const merchant = scenario.purchaseIntent.merchant.displayName;
  const purpose = scenario.mandate.purposePolicy.allowedPurposes.join(", ");

  return (
    <article className="space-y-3 text-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Simulated surface
      </p>
      <h2 className="text-lg font-semibold">{surface}</h2>
      <dl className="space-y-1">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Person</dt>
          <dd>{person}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Role</dt>
          <dd>{role}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Shared scenario</dt>
          <dd className="text-right">{scenario.title}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Purpose</dt>
          <dd>{purpose}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Authorization</dt>
          <dd>{formatMoneyAmount(scenario.mandate.budget)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Merchant</dt>
          <dd className="text-right">{merchant}</dd>
        </div>
      </dl>
      <p className="text-xs text-neutral-500">
        {scenario.dataLabel}. Not a live payment and not an Open Payments
        response. Authorization capacity is not a balance held by COMPAS.
      </p>
    </article>
  );
}
