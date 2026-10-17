"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  defaultMerchantCompasConfig,
  type MerchantCompasConfig,
} from "./nequi-business-compas-demo";
import {
  NequiBusinessBottomNav,
  type NequiBusinessTab,
} from "./NequiBusinessBottomNav";
import {
  NequiBusinessNfcFallbackSheet,
  NequiBusinessQrSheet,
} from "./NequiBusinessCollectionSheets";
import { NequiBusinessCompas } from "./NequiBusinessCompas";
import { NequiBusinessHome } from "./NequiBusinessHome";
import { NequiBusinessLinkPayments } from "./NequiBusinessLinkPayments";
import { NequiBusinessMore } from "./NequiBusinessMore";
import { NequiBusinessPaymentNotice } from "./NequiBusinessPaymentNotice";
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

type NequiBusinessView = "base" | "sales" | "link-payments" | "compas";
type CollectionOverlay = null | "nfc-fallback" | "qr";

/**
 * The merchant's simulated Nequi Negocios app. It fills its container, so the
 * same component works full-screen at /nequi-negocios and inside a PhoneFrame
 * at /demo. Tabs, pushed screens, sheets, and the merchant COMPAS settings are
 * local UI state, not shared demo state and not backend state. It renders
 * inside DemoSessionProvider, so a later phase can read `useDemoSession()`.
 */
export function NequiBusinessExperience() {
  const [tab, setTab] = useState<NequiBusinessTab>("home");
  const [view, setView] = useState<NequiBusinessView>("base");
  const [overlay, setOverlay] = useState<CollectionOverlay>(null);
  // Lives here so it survives leaving and reopening the COMPAS screen.
  const [compasConfig, setCompasConfig] = useState<MerchantCompasConfig>(
    defaultMerchantCompasConfig,
  );
  const hasNavigated = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onBase = view === "base" && overlay === null;

  useEffect(() => {
    if (!hasNavigated.current || !onBase) return;
    const target = returnFocus.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [onBase]);

  function leaveBase() {
    hasNavigated.current = true;
    if (onBase && document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement;
    }
  }

  function openView(next: NequiBusinessView) {
    leaveBase();
    setOverlay(null);
    setView(next);
  }

  function openOverlay(next: CollectionOverlay) {
    leaveBase();
    setOverlay(next);
  }

  function backToBase() {
    setOverlay(null);
    setView("base");
  }

  return (
    <div
      style={nequiBusinessTheme}
      className="@container relative isolate h-full w-full overflow-hidden bg-white font-sans text-(--nb-plum)"
    >
      <div inert={!onBase} className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          {tab === "home" ? (
            <NequiBusinessHome
              onCollectCard={() => openOverlay("nfc-fallback")}
              onCollectLink={() => openView("link-payments")}
              onCollectQr={() => openOverlay("qr")}
              onOpenSales={() => openView("sales")}
            />
          ) : (
            <NequiBusinessMore
              compasConfig={compasConfig}
              onOpenCompas={() => openView("compas")}
              onOpenLinkPayments={() => openView("link-payments")}
            />
          )}
        </div>
        <NequiBusinessBottomNav
          activeTab={tab}
          onSelectTab={setTab}
          onOpenSales={() => openView("sales")}
        />
      </div>

      {view === "sales" ? <NequiBusinessSalesSummary onBack={backToBase} /> : null}
      {view === "link-payments" ? (
        <NequiBusinessLinkPayments onBack={backToBase} />
      ) : null}
      {view === "compas" ? (
        <NequiBusinessCompas
          config={compasConfig}
          onSave={setCompasConfig}
          onBack={backToBase}
        />
      ) : null}

      {overlay === "nfc-fallback" ? (
        <NequiBusinessNfcFallbackSheet
          onClose={backToBase}
          onSendLink={() => openView("link-payments")}
        />
      ) : null}
      {overlay === "qr" ? <NequiBusinessQrSheet onClose={backToBase} /> : null}
      <NequiBusinessPaymentNotice />
    </div>
  );
}
