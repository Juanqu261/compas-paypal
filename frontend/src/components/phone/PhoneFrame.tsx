"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { DEVICE_HEIGHT, DEVICE_WIDTH, deviceScale } from "./device-scale";

type PhoneFrameProps = {
  /** Names the device for assistive technology, e.g. "Pedro's phone, PayPal". */
  label: string;
  /**
   * Gives the child an unpadded, device-sized screen. Use it for a surface
   * that draws its own edge-to-edge layout and manages its own scrolling. The
   * screen has a phone's proportions (about 9:19.5) and is scaled to the
   * window, so it never turns squat in a short one nor huge in a tall one.
   */
  edgeToEdge?: boolean;
  children: ReactNode;
};

/** Assumed while rendering on the server, where there is no window. */
const SERVER_WINDOW_HEIGHT = 1000;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useDeviceScale(): number {
  const height = useSyncExternalStore(
    subscribe,
    () => window.innerHeight,
    () => SERVER_WINDOW_HEIGHT,
  );
  return deviceScale(height);
}

const BODY =
  "rounded-[2.75rem] bg-bezel p-[9px] shadow-[0_2px_0_rgb(255_255_255/0.08)_inset,0_30px_60px_-28px_rgb(14_35_56/0.55),0_12px_20px_-12px_rgb(14_35_56/0.35)]";

export function PhoneFrame({ label, edgeToEdge = false, children }: PhoneFrameProps) {
  const scale = useDeviceScale();

  if (!edgeToEdge) {
    return (
      <section aria-label={label} className={`w-72 shrink-0 ${BODY}`}>
        <div data-surface className="min-h-80 rounded-[2.2rem] bg-neutral-50 p-4">
          {children}
        </div>
      </section>
    );
  }

  return (
    // The outer box takes the scaled size in the layout. The device inside is drawn at its logical size and scaled.
    <section
      aria-label={label}
      className="shrink-0"
      style={{ width: DEVICE_WIDTH * scale, height: DEVICE_HEIGHT * scale }}
    >
      <div
        className={BODY}
        style={{
          width: DEVICE_WIDTH,
          height: DEVICE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div data-surface className="h-full overflow-hidden rounded-[2.2rem] bg-white">
          {children}
        </div>
      </div>
    </section>
  );
}
