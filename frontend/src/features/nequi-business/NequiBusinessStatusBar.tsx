import { nequiBusinessDemo } from "./nequi-business-demo-content";

/** Decorative device status row. Not a real clock or signal reading. */
export function NequiBusinessStatusBar({ tone }: { tone: "dark" | "light" }) {
  const color = tone === "dark" ? "text-neutral-600" : "text-white";
  return (
    <div
      aria-hidden="true"
      className={`flex h-8 shrink-0 items-center justify-between px-4 text-[12px] font-medium ${color}`}
    >
      <span>{nequiBusinessDemo.statusTime}</span>
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.6" />
          <rect x="4.3" y="5.5" width="3" height="6.5" rx="0.6" />
          <rect x="8.6" y="3" width="3" height="9" rx="0.6" />
          <rect x="12.9" y="0" width="3" height="12" rx="0.6" />
        </svg>
        <span className="flex h-3 items-center rounded-[3px] border border-current px-1 text-[9px] leading-none font-semibold">
          75
        </span>
      </span>
    </div>
  );
}
