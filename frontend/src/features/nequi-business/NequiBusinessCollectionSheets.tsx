import { useId } from "react";
import { nequiBusinessDemo } from "./nequi-business-demo-content";
import { NequiBusinessBottomSheet } from "./NequiBusinessBottomSheet";
import { NequiBusinessDecorativeQr } from "./NequiBusinessDecorativeQr";
import { QrIcon, SendIcon } from "./NequiBusinessIcons";

function QrBlock() {
  return (
    <div className="rounded-lg border border-(--nb-line) px-4 pt-4 pb-6">
      <div className="flex items-start gap-3">
        <QrIcon className="size-8 shrink-0" />
        <p className="min-w-0">
          <span className="block text-[15px] leading-snug font-bold">
            Muéstrale este QR a tu cliente
          </span>
          <span className="block text-[13px] text-(--nb-muted)">
            Dile que lo escanee desde su celular.
          </span>
        </p>
      </div>
      <NequiBusinessDecorativeQr className="mx-auto mt-5 block w-[min(11rem,70%)]" />
    </div>
  );
}

/** Shown for `Tarjeta`: card-present collection falls back to link or QR. */
export function NequiBusinessNfcFallbackSheet({
  onClose,
  onSendLink,
}: {
  onClose: () => void;
  onSendLink: () => void;
}) {
  const titleId = useId();
  return (
    <NequiBusinessBottomSheet labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-[17px] font-bold">
        Elige otra opción de cobro
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-(--nb-plum)/75">
        Este dispositivo no tiene NFC compatible para poder realizar tu cobro
        por contacto.
      </p>
      <p className="mt-5 text-[15px] text-(--nb-plum)/75">Puedes cobrar usando:</p>

      <button
        type="button"
        onClick={onSendLink}
        className="mt-3 flex w-full items-center gap-4 rounded-lg border border-(--nb-line) px-4 py-4 text-left transition-colors hover:bg-(--nb-card)/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--nb-blue)"
      >
        <SendIcon className="size-7 shrink-0" />
        <span className="min-w-0">
          <span className="block text-[15px] font-bold">Enviar link de pago</span>
          <span className="block truncate text-[14px] text-(--nb-muted)">
            {nequiBusinessDemo.checkoutLinkText}
          </span>
        </span>
      </button>

      <div className="mt-3">
        <QrBlock />
      </div>
    </NequiBusinessBottomSheet>
  );
}

/** Shown for `QR·Bre-B`. Inferred demo behavior: no reference screenshot. */
export function NequiBusinessQrSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <NequiBusinessBottomSheet labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-[17px] font-bold">
        Cobra con QR·Bre-B
      </h2>
      <div className="mt-4">
        <QrBlock />
      </div>
    </NequiBusinessBottomSheet>
  );
}
