"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  NequiBusinessNfcFallbackSheet,
  NequiBusinessQrSheet,
} from "./NequiBusinessCollectionSheets";
import { NequiBusinessHome } from "./NequiBusinessHome";
import { NequiBusinessLinkPayments } from "./NequiBusinessLinkPayments";
import { NequiBusinessSalesSummary } from "./NequiBusinessSalesSummary";

/** Nequi Negocios simulation palette, scoped to this surface. */
const nequiBusinessTheme = {
  "--nb-plum": "#2B002B",
  "--nb-sky": "#B9D5F8",
  "--nb-tile": "#A3C6F5",
  "--nb-card": "#EEF5FE",
  "--nb-blue": "#3F80CF",
  "--nb-cta": "#5C9DF8",
  "--nb-navy": "#2C5A96",
  "--nb-muted": "#757075",
  "--nb-line": "#E3E2E7",
  "--nb-cyan": "#E1F7FC",
  "--nb-mint": "#CBF3DF",
  "--nb-sand": "#F6D8B4",
  "--nb-green": "#23874D",
  "--nb-amber": "#DB8A16",
  "--nb-alert": "#C94A14",
} as CSSProperties;

type NequiBusinessView = "home" | "sales" | "link-payments";
type CollectionOverlay = null | "nfc-fallback" | "qr";

/**
 * The merchant's simulated Nequi Negocios app. It fills its container, so the
 * same component works full-screen at /nequi-negocios and inside a PhoneFrame
 * at /demo. Screen and sheet state is local UI state, not shared demo state.
 * It renders inside DemoSessionProvider, so a later phase can read
 * `useDemoSession()` here.
 */
export function NequiBusinessExperience() {
  const [view, setView] = useState<NequiBusinessView>("home");
  const [overlay, setOverlay] = useState<CollectionOverlay>(null);
  const hasNavigated = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onHome = view === "home" && overlay === null;

  useEffect(() => {
    if (!hasNavigated.current || !onHome) return;
    const target = returnFocus.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [onHome]);

  function leaveHome() {
    hasNavigated.current = true;
    if (onHome && document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement;
    }
  }

  function openView(next: NequiBusinessView) {
    leaveHome();
    setOverlay(null);
    setView(next);
  }

  function openOverlay(next: CollectionOverlay) {
    leaveHome();
    setOverlay(next);
  }

  function backToHome() {
    setOverlay(null);
    setView("home");
  }

  return (
    <div
      style={nequiBusinessTheme}
      className="@container relative isolate h-full w-full overflow-hidden bg-white font-sans text-(--nb-plum)"
    >
      <div inert={!onHome} className="h-full">
        <NequiBusinessHome
          onCollectCard={() => openOverlay("nfc-fallback")}
          onCollectLink={() => openView("link-payments")}
          onCollectQr={() => openOverlay("qr")}
          onOpenSales={() => openView("sales")}
        />
      </div>

      {view === "sales" ? <NequiBusinessSalesSummary onBack={backToHome} /> : null}
      {view === "link-payments" ? (
        <NequiBusinessLinkPayments onBack={backToHome} />
      ) : null}

      {overlay === "nfc-fallback" ? (
        <NequiBusinessNfcFallbackSheet
          onClose={backToHome}
          onSendLink={() => openView("link-payments")}
        />
      ) : null}
      {overlay === "qr" ? <NequiBusinessQrSheet onClose={backToHome} /> : null}
    </div>
  );
}
