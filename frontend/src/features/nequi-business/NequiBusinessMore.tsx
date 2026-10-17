import { useId, type ReactNode } from "react";
import {
  merchantCompasCategoryLabels,
  type MerchantCompasConfig,
} from "./nequi-business-compas-demo";
import { ChevronRightIcon, CompassIcon, LinkIcon } from "./NequiBusinessIcons";
import { NequiBusinessStatusBar } from "./NequiBusinessStatusBar";

function ServiceRow({
  icon,
  title,
  subtitle,
  status,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  status?: ReactNode;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-(--nb-card)/60 active:bg-(--nb-card) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--nb-blue)"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-(--nb-sky)">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{title}</span>
          <span className="block text-[13px] leading-snug text-(--nb-muted)">
            {subtitle}
          </span>
          {status}
        </span>
        <ChevronRightIcon className="size-5 shrink-0 text-(--nb-muted)" />
      </button>
    </li>
  );
}

function CompasStatus({ config }: { config: MerchantCompasConfig }) {
  if (!config.enabled) {
    return (
      <span className="mt-1.5 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] text-(--nb-muted)">
        Inactivo
      </span>
    );
  }
  const labels = merchantCompasCategoryLabels(config.categories).join(", ");
  return (
    <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px]">
      <span className="shrink-0 rounded-full bg-(--nb-mint) px-2 py-0.5 font-semibold text-(--nb-green)">
        Activo
      </span>
      <span className="truncate text-(--nb-muted)">{labels}</span>
    </span>
  );
}

/** `Conoce más` tab: native services list for the business. */
export function NequiBusinessMore({
  compasConfig,
  onOpenCompas,
  onOpenLinkPayments,
}: {
  compasConfig: MerchantCompasConfig;
  onOpenCompas: () => void;
  onOpenLinkPayments: () => void;
}) {
  const servicesId = useId();

  return (
    <div className="h-full overflow-x-hidden overflow-y-auto bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="bg-(--nb-sky) px-5 pb-7 @min-[380px]:px-6">
        <NequiBusinessStatusBar tone="dark" />
        <h2 className="mt-6 text-[23px] leading-tight font-semibold tracking-tight @min-[360px]:text-[25px]">
          Conoce más
        </h2>
        <p className="mt-1 text-[14px]">Herramientas para hacer crecer tu negocio.</p>
      </div>

      <section aria-labelledby={servicesId} className="px-5 pt-7 pb-6 @min-[380px]:px-6">
        <h3 id={servicesId} className="text-[17px] font-bold">
          Servicios para tu negocio
        </h3>
        <ul className="mt-4 divide-y divide-(--nb-line) overflow-hidden rounded-lg border border-(--nb-line) bg-white">
          <ServiceRow
            icon={<LinkIcon className="size-7" />}
            title="Link de pagos"
            subtitle="Crea tu link, envíalo y cobra en línea"
            onClick={onOpenLinkPayments}
          />
          <ServiceRow
            icon={<CompassIcon className="size-7" />}
            title="COMPAS"
            subtitle="Recibe pagos con propósito"
            status={<CompasStatus config={compasConfig} />}
            onClick={onOpenCompas}
          />
        </ul>
      </section>
    </div>
  );
}
