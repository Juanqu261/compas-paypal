import type { ReactNode } from "react";

type PhoneFrameProps = {
  /** Names the device for assistive technology, e.g. "Pedro's phone, ARQ". */
  label: string;
  /**
   * Gives the child an unpadded, device-height screen. Use it for a surface
   * that draws its own edge-to-edge layout and manages its own scrolling.
   */
  edgeToEdge?: boolean;
  children: ReactNode;
};

export function PhoneFrame({
  label,
  edgeToEdge = false,
  children,
}: PhoneFrameProps) {
  return (
    <section
      aria-label={label}
      className={`shrink-0 rounded-[2.75rem] bg-bezel p-[9px] shadow-[0_2px_0_rgb(255_255_255/0.08)_inset,0_30px_60px_-28px_rgb(14_35_56/0.55),0_12px_20px_-12px_rgb(14_35_56/0.35)] ${
        edgeToEdge ? "w-[22rem]" : "w-72"
      }`}
    >
      {edgeToEdge ? (
        <div
          data-surface
          className="h-[min(46rem,calc(100dvh_-_16rem))] min-h-[32rem] overflow-hidden rounded-[2.2rem] bg-white"
        >
          {children}
        </div>
      ) : (
        <div
          data-surface
          className="min-h-80 rounded-[2.2rem] bg-neutral-50 p-4"
        >
          {children}
        </div>
      )}
    </section>
  );
}
