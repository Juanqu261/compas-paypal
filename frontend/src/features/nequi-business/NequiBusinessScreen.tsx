import { useEffect, useRef, type ReactNode } from "react";

/**
 * A pushed screen inside the phone. It is positioned against the
 * experience root, so it never covers anything outside the simulated device.
 * The element marked `data-initial-focus` receives focus on open.
 */
export function NequiBusinessScreen({
  labelledBy,
  onBack,
  children,
}: {
  labelledBy: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const screenRef = useRef<HTMLElement>(null);

  useEffect(() => {
    screenRef.current
      ?.querySelector<HTMLElement>("[data-initial-focus]")
      ?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={screenRef}
      aria-labelledby={labelledBy}
      onKeyDown={(event) => {
        if (event.key === "Escape") onBack();
      }}
      className="absolute inset-0 z-20 flex flex-col bg-white transition-transform duration-300 ease-out starting:translate-x-full motion-reduce:transition-none"
    >
      {children}
    </section>
  );
}
