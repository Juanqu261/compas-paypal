import type { ReactNode } from "react";
import { ArrowRightIcon } from "./ArqIcons";

function PromoCard({
  title,
  body,
  action,
  illustration,
}: {
  title: string;
  body?: string;
  action: string;
  illustration: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-(--arq-card) p-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug font-semibold text-neutral-900">
          {title}
        </p>
        {body ? (
          <p className="mt-1 text-[13px] leading-snug text-(--arq-muted)">
            {body}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 rounded text-[13px] font-semibold text-(--arq-forest) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--arq-forest)"
        >
          {action}
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
      <div className="w-20 shrink-0">{illustration}</div>
    </div>
  );
}

function BuildingIllustration() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false" className="block w-full">
      <circle cx="44" cy="42" r="30" className="fill-(--arq-mint)/45" />
      <rect x="22" y="22" width="30" height="46" rx="2" className="fill-(--arq-forest)" />
      <rect x="52" y="38" width="16" height="30" rx="2" className="fill-(--arq-ink)" />
      {[28, 38, 48].flatMap((y) =>
        [27, 39].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="8" height="6" rx="1" className="fill-(--arq-mint)" />
        )),
      )}
      <rect x="56" y="44" width="8" height="5" rx="1" className="fill-(--arq-mint)/70" />
      <rect x="56" y="53" width="8" height="5" rx="1" className="fill-(--arq-mint)/70" />
      <rect x="33" y="58" width="8" height="10" rx="1" className="fill-(--arq-mint)" />
      <rect x="14" y="67" width="60" height="3" rx="1.5" className="fill-(--arq-forest)" />
    </svg>
  );
}

function GroupIllustration() {
  const people = [
    { cx: 22, tone: "fill-(--arq-mint)" },
    { cx: 58, tone: "fill-(--arq-sage)" },
    { cx: 40, tone: "fill-(--arq-forest)" },
  ];
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false" className="block w-full">
      <circle cx="40" cy="40" r="30" className="fill-(--arq-mint)/35" />
      {people.map(({ cx, tone }) => (
        <g key={cx}>
          <circle cx={cx} cy={cx === 40 ? 34 : 40} r="8" className={tone} />
          <path
            d={`M${cx - 13} ${cx === 40 ? 64 : 68}a13 13 0 0 1 26 0z`}
            className={tone}
          />
        </g>
      ))}
      <circle cx="62" cy="20" r="7" className="fill-white" />
      <path d="M62 16.5v7M59.8 18.3h3.6a1.4 1.4 0 0 1 0 2.8h-2.6a1.4 1.4 0 0 0 0 2.8h3.4" className="stroke-(--arq-forest)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function BusinessPromo() {
  return (
    <PromoCard
      title="Cobra de EE. UU. con tu empresa"
      body="Recibe pagos de clientes en el exterior con una cuenta para tu negocio."
      action="Registra tu empresa"
      illustration={<BuildingIllustration />}
    />
  );
}

export function GroupsPromo() {
  return (
    <PromoCard
      title="Divide gastos con amigos y familiares"
      action="Crear un grupo"
      illustration={<GroupIllustration />}
    />
  );
}
