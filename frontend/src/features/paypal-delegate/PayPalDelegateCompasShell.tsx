import { useId, useState, type RefObject } from "react";
import {
  DELEGATE_ROUTE_TITLE,
  DelegateCompas,
  type DelegateRoute,
} from "@/features/compas/delegate/DelegateCompas";
import { compasTheme } from "@/features/compas/theme";
import { useDemoSession } from "@/features/demo/DemoSession";
import { ArrowLeftIcon } from "@/features/paypal/PayPalIcons";
import { PayPalStatusBar } from "@/features/paypal/PayPalTopBar";

/**
 * COMPAS inside the simulated PayPal app, for Andrea (delegate): the
 * authorizations she received, read from the backend. She can read them, not
 * revoke or change them. A charge from the merchant's phone opens a checkout
 * under one of them. The back arrow steps from a detail to the list, then
 * closes COMPAS.
 */
export function PayPalDelegateCompasShell({
  open,
  onBack,
  backButtonRef,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  // A stack, so the back arrow returns to where Andrea came from (list, detail, payment).
  const [stack, setStack] = useState<readonly DelegateRoute[]>([{ name: "list" }]);
  const route = stack[stack.length - 1];
  // A simulated charge from the merchant's phone, in the same browser. Not stored by the backend.
  const { charge, recordChargeResult } = useDemoSession();
  const [moves, setMoves] = useState(0);

  const go = (next: DelegateRoute) => {
    setStack((current) => [...current, next]);
    setMoves((n) => n + 1);
  };
  const back = () => {
    if (stack.length === 1) return onBack();
    setStack((current) => current.slice(0, -1));
    setMoves((n) => n + 1);
  };

  return (
    <section
      aria-labelledby={titleId}
      inert={!open}
      style={compasTheme("paypal")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) back();
      }}
      className={`absolute inset-0 z-20 flex flex-col bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.12)] duration-300 ease-out motion-reduce:transition-none ${
        // Visibility flips at once on open so focus can land; it waits on close.
        open
          ? "visible translate-x-0 transition-transform"
          : "invisible translate-x-full transition-[transform,visibility]"
      }`}
    >
      <PayPalStatusBar />
      <header className="flex items-center gap-2 px-3 pb-2">
        <button
          ref={backButtonRef}
          type="button"
          onClick={back}
          aria-label={stack.length > 1 ? "Back" : "Back to home"}
          className="grid size-10 place-items-center rounded-full bg-(--pp-chip) text-(--pp-ink) transition-colors hover:bg-(--pp-chip-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pp-blue)"
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h2 id={titleId} className="text-[20px] font-extrabold tracking-[-0.01em] text-(--pp-ink)">
          {DELEGATE_ROUTE_TITLE[route.name]}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DelegateCompas
          route={route}
          onOpen={(id) => go({ name: "detail", id })}
          onPay={(id) => go({ name: "pay", id })}
          active={open}
          openCount={0}
          focusOnMount={moves > 0}
          checkout={{ charge, onResult: recordChargeResult }}
        />
      </div>
    </section>
  );
}
