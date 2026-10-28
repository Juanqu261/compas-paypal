"use client";

import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import type { MandateStatus } from "../api/contracts";
import { errorCode } from "../api/client";
import { errorText, statusTone } from "../lib/labels";
import { CompasMark } from "@/features/brand/CompasLogo";
import { AlertIcon, InfoIcon } from "./icons";

/**
 * Building blocks for COMPAS screens inside a host app. Colors come from the
 * host through `--cx-*` custom properties, so each host keeps its own look. `--cx-route` is COMPAS's own: the color of granted permission.
 */

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-focus)";

type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  const look: Record<ButtonVariant, string> = {
    primary: "bg-(--cx-accent) text-(--cx-on-accent) hover:opacity-90 active:opacity-80",
    secondary: "border border-(--cx-line-strong) bg-(--cx-surface) text-(--cx-ink) hover:bg-(--cx-card)",
    danger: "border border-(--cx-danger)/40 bg-(--cx-surface) text-(--cx-danger) hover:bg-(--cx-danger)/8",
    quiet: "text-(--cx-ink) underline underline-offset-4 hover:no-underline",
  };
  const size = variant === "quiet" ? "px-1 py-1 text-[14px]" : "h-12 w-full rounded-(--cx-radius) px-4 text-[15px]";
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-[opacity,background-color] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none ${size} ${look[variant]} ${focusRing} ${className}`}
    />
  );
}

export function StatusBadge({ status, label }: { status: MandateStatus; label: string }) {
  const tone = statusTone(status);
  const look = {
    ok: "bg-(--cx-ok)/12 text-(--cx-ok)",
    wait: "bg-(--cx-warn-soft) text-(--cx-warn)",
    draft: "bg-(--cx-card) text-(--cx-muted)",
    off: "bg-(--cx-card) text-(--cx-muted)",
  }[tone];
  const dot = { ok: "bg-(--cx-ok)", wait: "bg-(--cx-warn)", draft: "border border-(--cx-muted)", off: "bg-(--cx-muted)/50" }[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${look}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const look = {
    info: "bg-(--cx-card) text-(--cx-ink)",
    warn: "bg-(--cx-warn-soft) text-(--cx-ink)",
    danger: "bg-(--cx-danger)/8 text-(--cx-ink)",
  }[tone];
  const iconColor = { info: "text-(--cx-muted)", warn: "text-(--cx-warn)", danger: "text-(--cx-danger)" }[tone];
  const Glyph = tone === "info" ? InfoIcon : AlertIcon;
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex gap-2.5 rounded-(--cx-radius) p-3 text-[13px] leading-snug ${look}`}>
      <Glyph className={`mt-px size-[18px] shrink-0 ${iconColor}`} />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

/** A screen heading that takes focus when the person navigates to it. */
export function ScreenHeading({ children, focusOnMount }: { children: ReactNode; focusOnMount: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  return (
    <h3 ref={ref} tabIndex={-1} className="text-[22px] leading-tight font-semibold tracking-tight text-(--cx-ink) outline-none">
      {children}
    </h3>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h4 id={id} className="text-[15px] font-semibold text-(--cx-ink)">
      {children}
    </h4>
  );
}

/** A label/value list. Values are plain text, never inputs. */
export function Facts({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-(--cx-line)">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-[13px] text-(--cx-muted)">{row.label}</dt>
          <dd className="text-right text-[14px] font-medium text-(--cx-ink) tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LoadingState({ label = "Cargando" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-[14px] text-(--cx-muted)">
      <CompasMark className="size-6 animate-spin [animation-duration:2.4s] motion-reduce:animate-none" />
      {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="space-y-3 py-4">
      <Notice tone="danger">{errorText(errorCode(error))}</Notice>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

/** The last good data is still on screen, but refreshing it failed. Says so instead of pretending it is current. */
export function StaleDataNotice({ error }: { error: unknown }) {
  return (
    <Notice tone="warn" title="Mostrando los últimos datos conocidos">
      {errorText(errorCode(error))} Esta pantalla vuelve a intentarlo sola.
    </Notice>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-(--cx-radius) border border-dashed border-(--cx-line-strong) px-4 py-6 text-center">
      <CompasMark className="mx-auto size-10" />
      <p className="mt-3 text-[15px] font-semibold text-(--cx-ink)">{title}</p>
      <div className="mt-1 text-[13px] leading-snug text-(--cx-muted)">{children}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Says, on every COMPAS screen, that this is the demo environment. */
export function DemoModeNote({ persistence }: { persistence?: string }) {
  return (
    <p className="flex items-start gap-1.5 pt-2 text-[11px] leading-snug text-(--cx-muted)">
      <InfoIcon className="mt-px size-3.5 shrink-0" />
      <span>
        Modo demostración: personas de prueba
        {persistence === "IN_MEMORY_DEMO" ? " y datos guardados en la memoria del servidor, que se borran al reiniciarlo" : ""}
        {persistence === "POSTGRES" ? " y datos de prueba guardados en la base de datos de COMPAS" : ""}.
      </span>
    </p>
  );
}

/**
 * Confirmation for a sensitive action, drawn inside the phone. Escape and the
 * cancel button close it. Focus moves to the cancel button when it opens.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // Focus goes to Cancel, and back to whatever opened the dialog when it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // The dialog owns Escape: the screen behind it must not close too.
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onCancel();
      }}
    >
      <div aria-hidden="true" onClick={busy ? undefined : onCancel} className="absolute inset-0 bg-black/40" />
      <section
        role="alertdialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className="relative rounded-t-[1.5rem] bg-(--cx-surface) px-5 pt-5 pb-6 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
      >
        <h4 id={titleId} className="text-[17px] font-semibold text-(--cx-ink)">
          {title}
        </h4>
        <div className="mt-2 text-[14px] leading-snug text-(--cx-muted)">{children}</div>
        <div className="mt-5 space-y-2">
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Procesando…" : confirmLabel}
          </Button>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </section>
    </div>
  );
}
