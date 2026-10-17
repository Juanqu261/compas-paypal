import { useState, type RefObject } from "react";
import {
  DELEGATE_ROUTE_TITLE,
  DelegateCompas,
  type DelegateRoute,
} from "@/features/compas/delegate/DelegateCompas";
import { compasTheme } from "@/features/compas/theme";
import { useDemoSession } from "@/features/demo/DemoSession";
import { NequiScreen } from "./NequiScreen";

/**
 * COMPAS inside the Nequi host, for Andrea (delegate): the authorizations she
 * received, read from the backend. She can read them, not revoke or change
 * them. A charge from the merchant's phone opens a checkout under one of
 * them. The back arrow steps from a detail to the list, then closes COMPAS.
 */
export function NequiCompasShell({
  open,
  onBack,
  backButtonRef,
}: {
  open: boolean;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
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
    <NequiScreen
      open={open}
      title={DELEGATE_ROUTE_TITLE[route.name]}
      onBack={back}
      backButtonRef={backButtonRef}
    >
      <div style={compasTheme("nequi")} className="px-2">
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
    </NequiScreen>
  );
}
