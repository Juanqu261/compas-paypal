import { useState, type RefObject } from "react";
import {
  DELEGATE_ROUTE_TITLE,
  DelegateCompas,
  type DelegateRoute,
} from "@/features/compas/delegate/DelegateCompas";
import { compasTheme } from "@/features/compas/theme";
import { NequiScreen } from "./NequiScreen";

/**
 * COMPAS inside the Nequi host, for Andrea (delegate): the authorizations she
 * received, read from the backend. She can read them, not revoke or change
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
  const [route, setRoute] = useState<DelegateRoute>({ name: "list" });
  const [moves, setMoves] = useState(0);

  const go = (next: DelegateRoute) => {
    setRoute(next);
    setMoves((n) => n + 1);
  };

  return (
    <NequiScreen
      open={open}
      title={DELEGATE_ROUTE_TITLE[route.name]}
      onBack={() => (route.name === "detail" ? go({ name: "list" }) : onBack())}
      backButtonRef={backButtonRef}
    >
      <div style={compasTheme("nequi")} className="px-2">
        <DelegateCompas
          route={route}
          onOpen={(id) => go({ name: "detail", id })}
          active={open}
          openCount={0}
          focusOnMount={moves > 0}
        />
      </div>
    </NequiScreen>
  );
}
