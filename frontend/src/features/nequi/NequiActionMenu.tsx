import { useEffect, useRef } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CloseIcon,
  GridIcon,
  QrIcon,
} from "./NequiIcons";

const actions = [
  { id: "services", label: "+ Servicios", Icon: GridIcon, tone: "sky" },
  { id: "withdraw", label: "Saca", Icon: ArrowDownIcon, tone: "magenta" },
  { id: "request", label: "Pide", Icon: ArrowLeftIcon, tone: "magenta" },
  { id: "send", label: "Envía", Icon: ArrowRightIcon, tone: "magenta" },
  { id: "qr", label: "Código QR", Icon: QrIcon, tone: "magenta" },
  { id: "topup", label: "Recarga Nequi", Icon: ArrowUpIcon, tone: "magenta" },
] as const;

/**
 * The "$" quick-action sheet: a frosted overlay with labeled square buttons
 * stacked above the close button. Only "Envía" leads somewhere in the demo.
 */
export function NequiActionMenu({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  const firstActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) firstActionRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Acciones"
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className={`absolute inset-0 z-30 flex flex-col justify-end bg-white/90 backdrop-blur-[2px] duration-200 motion-reduce:transition-none ${
        // Visibility flips at once on open so focus can land; it waits on close.
        open
          ? "visible opacity-100 transition-opacity"
          : "invisible opacity-0 transition-[opacity,visibility]"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <ul className="relative flex flex-col items-end gap-4 px-3">
        {actions.map(({ id, label, Icon, tone }, index) => (
          <li
            key={id}
            style={{ transitionDelay: open ? `${(actions.length - index) * 25}ms` : "0ms" }}
            className={`transition-[opacity,translate] duration-200 motion-reduce:transition-none ${
              open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <button
              ref={index === 0 ? firstActionRef : undefined}
              type="button"
              onClick={id === "send" ? onSend : undefined}
              className="group flex items-center gap-6 rounded-xl text-[19px] text-(--nequi-ink) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--nequi-plum)"
            >
              {label}
              <span
                className={`grid size-[4.25rem] place-items-center rounded-xl text-white transition-transform group-active:scale-95 motion-reduce:group-active:scale-100 ${
                  tone === "sky" ? "bg-(--nequi-sky)" : "bg-(--nequi-magenta)"
                }`}
              >
                <Icon className="size-8" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="relative flex justify-end px-3 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label="Cerrar acciones"
          onClick={onClose}
          className="grid size-[4.25rem] place-items-center rounded-xl bg-(--nequi-lilac) text-(--nequi-ink) shadow-[0_2px_12px_rgba(32,0,32,0.12)] transition-colors hover:bg-(--nequi-lilac)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nequi-plum)"
        >
          <CloseIcon className="size-8" />
        </button>
      </div>
    </div>
  );
}
