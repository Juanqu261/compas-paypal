import Image from "next/image";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ExternalIcon } from "./flow-icons";

export function EvidenceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-semibold text-route-deep underline-offset-2 hover:underline"
    >
      {children}
      <ExternalIcon className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export type Step = {
  icon: (props: { className?: string }) => ReactNode;
  /**
   * A real party's own logo, in color in every state, in place of the icon. A
   * square mark sits in a white circle; a wide wordmark stands on its own.
   */
  logo?: { src: string; alt: string; width: number; height: number; wide?: boolean };
  title: ReactNode;
  caption: string;
  metric?: string;
  detail?: string;
  tone: "neutral" | "model" | "ok" | "flag";
  /** Overrides the diagram's state for this step, so a live run can light steps one by one. */
  state?: "idle" | "running" | "done";
  links?: readonly { href: string; text: string }[];
};

const RING_TONE: Record<Step["tone"], string> = {
  neutral: "bg-shoal text-ink",
  model: "bg-route/10 text-route",
  ok: "bg-route text-paper",
  flag: "bg-buff text-ink",
};

export function Connector() {
  return (
    <li aria-hidden className="flex shrink-0 items-center justify-center text-ink/35">
      <svg viewBox="0 0 40 12" className="hidden h-3 w-10 lg:block">
        <path className="flow-line" d="M1 6h32" stroke="currentColor" strokeWidth="2" />
        <path d="m32 1.5 6 4.5-6 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 12 32" className="h-8 w-3 lg:hidden">
        <path className="flow-line" d="M6 1v24" stroke="currentColor" strokeWidth="2" />
        <path d="m1.5 24 4.5 6 4.5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </li>
  );
}

/** The process as a diagram. Before a run it explains the steps; after one, each step shows what it found. */
export function FlowDiagram({ steps, state, startAt = 1 }: { steps: readonly Step[]; state: "idle" | "running" | "done"; startAt?: number }) {
  return (
    <ol className={`flex flex-col items-stretch lg:flex-row ${state === "running" ? "flow-running" : ""}`}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const style = { "--step": index } as CSSProperties;
        const stepState = step.state ?? state;
        return (
          <Fragment key={index}>
          {index > 0 ? <Connector /> : null}
          <li
            className="flex flex-1 flex-col items-center rounded-2xl border border-ink/10 bg-paper px-3 py-5 text-center lg:min-w-0"
          >
            {step.logo?.wide ? (
              <span style={style} className="flow-ring grid h-16 place-items-center rounded-xl px-1">
                <Image
                  src={step.logo.src}
                  alt={step.logo.alt}
                  width={step.logo.width}
                  height={step.logo.height}
                  className="h-12 w-auto"
                />
              </span>
            ) : (
              <span
                style={style}
                className={`flow-ring grid size-16 place-items-center rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                  step.logo
                    ? "bg-white ring-1 ring-ink/10"
                    : stepState === "idle"
                      ? "bg-ink/[0.06] text-ink-soft"
                      : stepState === "running"
                        ? "bg-paper text-ink ring-1 ring-ink/15"
                        : RING_TONE[step.tone]
                }`}
              >
                {step.logo ? (
                  <Image src={step.logo.src} alt={step.logo.alt} width={step.logo.width} height={step.logo.height} className="size-9" />
                ) : (
                  <Icon className="size-8" />
                )}
              </span>
            )}
            <span className="mt-3 text-xs font-semibold text-ink-soft">{index + startAt}</span>
            <span className="font-semibold text-ink">{step.title}</span>
            <span className="mt-0.5 text-sm leading-snug text-ink-soft lg:min-h-[2.5rem]">{step.caption}</span>
            {step.metric ? (
              <span style={style} className="flow-reveal mt-3 font-display text-2xl leading-tight text-ink">
                {step.metric}
              </span>
            ) : null}
            {step.detail ? <span className="text-xs text-ink-soft">{step.detail}</span> : null}
            {step.links && step.links.length > 0 ? (
              <span className="mt-auto flex flex-col items-center gap-0.5 pt-3">
                {step.links.map((link) => (
                  <EvidenceLink key={link.href} href={link.href}>
                    {link.text}
                  </EvidenceLink>
                ))}
              </span>
            ) : null}
          </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
