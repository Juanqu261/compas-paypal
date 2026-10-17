import type { ReactNode, RefObject } from "react";
import {
  ChevronRightIcon,
  KeyIcon,
  PeopleIcon,
  SendIcon,
  WalletIcon,
} from "./NequiIcons";
import { NequiScreen } from "./NequiScreen";

function SendOption({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-4 rounded-sm border border-(--nequi-line) bg-white px-5 py-4 text-left shadow-[0_2px_4px_rgba(32,0,32,0.08)] transition-colors hover:bg-(--nequi-lilac)/30 active:bg-(--nequi-lilac)/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--nequi-magenta)"
      >
        <span className="shrink-0 text-(--nequi-ink)">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] text-(--nequi-ink)">{title}</span>
          <span className="block text-[15px] text-(--nequi-muted)">
            {subtitle}
          </span>
        </span>
        <ChevronRightIcon className="size-6 shrink-0 text-(--nequi-ink)" />
      </button>
    </li>
  );
}

/** "Opciones para enviar". The rows are visual only; no transfer happens. */
export function NequiSendOptions({
  open,
  onBack,
  backButtonRef,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <NequiScreen
      open={open}
      title="Opciones para enviar"
      onBack={onBack}
      backButtonRef={backButtonRef}
    >
      <ul className="space-y-2.5">
        <SendOption
          icon={<PeopleIcon className="size-7" />}
          title="Nequi"
          subtitle="A otro número de Nequi"
        />
        <SendOption
          icon={<SendIcon className="size-7" />}
          title="Bancolombia"
          subtitle="Cuenta ahorro o corriente"
        />
        <SendOption
          icon={<KeyIcon className="size-7" />}
          title="Enviar con llaves de Bre-B"
          subtitle="A otros bancos gratis y de una"
        />
        <SendOption
          icon={<WalletIcon className="size-7" />}
          title="Otros bancos"
          subtitle="Montos altos, puede tardar más"
        />
      </ul>

      <section className="mt-auto px-3 pt-10" aria-label="Contactos frecuentes">
        <p className="flex items-center gap-3 border-b border-(--nequi-line) pb-3 text-[17px] text-(--nequi-ink)">
          <PeopleIcon className="size-6" />
          Contactos frecuentes de Nequi
        </p>
        <p className="pt-4 text-[15px] leading-snug text-(--nequi-muted)">
          Aquí van a aparecer los contactos de Nequi a los que más les envíes.
        </p>
      </section>
    </NequiScreen>
  );
}
