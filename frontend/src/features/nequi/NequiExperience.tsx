"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NequiActionMenu } from "./NequiActionMenu";
import { NequiCompasShell } from "./NequiCompasShell";
import { NequiHome } from "./NequiHome";
import { NequiSendOptions } from "./NequiSendOptions";

/** Nequi simulation palette, scoped to this surface. */
const nequiTheme = {
  "--nequi-plum": "#200020",
  "--nequi-ink": "#200020",
  "--nequi-magenta": "#DA0081",
  "--nequi-lilac": "#ECE6F4",
  "--nequi-card": "#ECEBF1",
  "--nequi-line": "#E4E0E8",
  "--nequi-muted": "#5C5262",
  "--nequi-sky": "#5BA4F7",
  "--nequi-violet": "#3B1A8F",
  "--nequi-coral": "#FF5A5F",
  "--nequi-compas": "#0E8A55",
} as CSSProperties;

type NequiView = "home" | "send" | "compas";

/**
 * Andrea's simulated Nequi wallet (delegate). It fills its container, so the
 * same component works full-screen at /nequi and inside a PhoneFrame at
 * /demo. View and menu state are local UI state, not shared demo state.
 */
export function NequiExperience() {
  const [view, setView] = useState<NequiView>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const hasNavigated = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const compasTileRef = useRef<HTMLButtonElement>(null);
  const sendBackRef = useRef<HTMLButtonElement>(null);
  const compasBackRef = useRef<HTMLButtonElement>(null);
  const homeFocusRef = useRef(menuButtonRef);

  useEffect(() => {
    if (!hasNavigated.current || menuOpen) return;
    const target =
      view === "send"
        ? sendBackRef
        : view === "compas"
          ? compasBackRef
          : homeFocusRef.current;
    target.current?.focus({ preventScroll: true });
  }, [view, menuOpen]);

  function navigate(next: NequiView) {
    hasNavigated.current = true;
    if (next === "compas") homeFocusRef.current = compasTileRef;
    if (next === "send") homeFocusRef.current = menuButtonRef;
    setMenuOpen(false);
    setView(next);
  }

  function closeMenu() {
    hasNavigated.current = true;
    homeFocusRef.current = menuButtonRef;
    setMenuOpen(false);
  }

  const covered = view !== "home";

  return (
    <div
      style={nequiTheme}
      className="@container relative isolate h-full w-full overflow-hidden bg-white font-sans text-(--nequi-ink)"
    >
      <div
        inert={covered || menuOpen}
        className={`h-full transition-transform duration-300 ease-out motion-reduce:transition-none ${
          covered ? "-translate-x-1/4" : "translate-x-0"
        }`}
      >
        <NequiHome
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenCompas={() => navigate("compas")}
          menuButtonRef={menuButtonRef}
          compasTileRef={compasTileRef}
        />
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 bg-black/25 transition-opacity duration-300 motion-reduce:transition-none ${
          covered ? "opacity-100" : "opacity-0"
        }`}
      />
      <NequiActionMenu
        open={menuOpen}
        onClose={closeMenu}
        onSend={() => navigate("send")}
      />
      <NequiSendOptions
        open={view === "send"}
        onBack={() => navigate("home")}
        backButtonRef={sendBackRef}
      />
      <NequiCompasShell
        open={view === "compas"}
        onBack={() => navigate("home")}
        backButtonRef={compasBackRef}
      />
    </div>
  );
}
