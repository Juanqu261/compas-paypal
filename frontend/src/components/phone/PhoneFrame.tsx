import type { ReactNode } from "react";

type PhoneFrameProps = {
  title: string;
  /**
   * Gives the child an unpadded, device-height screen. Use it for a surface
   * that draws its own edge-to-edge layout and manages its own scrolling.
   */
  edgeToEdge?: boolean;
  children: ReactNode;
};

export function PhoneFrame({
  title,
  edgeToEdge = false,
  children,
}: PhoneFrameProps) {
  return (
    <section
      className={`shrink-0 rounded-2xl border border-neutral-300 bg-white p-3 ${
        edgeToEdge ? "w-[22rem]" : "w-72"
      }`}
    >
      <p className="mb-2 text-center text-xs text-neutral-500">{title}</p>
      {edgeToEdge ? (
        <div className="h-[min(46rem,calc(100dvh_-_14rem))] min-h-[32rem] overflow-hidden rounded-[1.75rem] border border-neutral-200">
          {children}
        </div>
      ) : (
        <div className="min-h-80 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          {children}
        </div>
      )}
    </section>
  );
}
