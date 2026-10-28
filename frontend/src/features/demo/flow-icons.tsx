import type { ReactNode } from "react";

/**
 * Icons for Act 1's flow. Generic shapes, not the vendors' logos, in the same
 * style as `compas/ui/icons.tsx`.
 */

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** A shop front with an awning: the pharmacy. */
export function StoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10v9.5h16V10" />
      <path d="M3 5.5 4.5 3h15L21 5.5v1.8a2.6 2.6 0 0 1-4.5 1.7 2.6 2.6 0 0 1-4.5 0 2.6 2.6 0 0 1-4.5 0A2.6 2.6 0 0 1 3 7.3z" />
      <path d="M10 19.5v-4.5h4v4.5" />
      <path d="M12 11.2v2.6M10.7 12.5h2.6" />
    </Icon>
  );
}

/** A magnifier over a stack of records: search in an index. */
export function IndexSearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="9" cy="5.5" rx="6" ry="2.5" />
      <path d="M3 5.5v9c0 1.4 2.7 2.5 6 2.5" />
      <path d="M3 10c0 1.4 2.7 2.5 6 2.5" />
      <circle cx="16.5" cy="15.5" r="3.5" />
      <path d="m19 18 2.5 2.5" />
    </Icon>
  );
}

/** Sparkles: the AI model that reads the catalog. */
export function ModelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
      <path d="M18 14c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3z" />
    </Icon>
  );
}

/** A shield with a check: the official registry. */
export function RegistryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z" />
      <path d="m8.8 12 2.2 2.2 4.4-4.4" />
    </Icon>
  );
}

export function CheckBadgeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.2 2.5 2.5 4.9-5" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h11l-2.2 3.8 2.2 3.7h-11" />
    </Icon>
  );
}

/** A capsule: a product the model calls a medicine. */
export function PillIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="8.2" width="18.4" height="7.6" rx="3.8" transform="rotate(-35 12 12)" />
      <path d="m9.6 8.6 4.8 6.8" />
    </Icon>
  );
}

/** A box: a product the model calls something else. */
export function BoxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 8 4v10l-8 4-8-4V7z" />
      <path d="m4 7 8 4 8-4M12 11v10" />
    </Icon>
  );
}

export function QuestionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
      <path d="M12 16.6v.1" />
    </Icon>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </Icon>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="m19.5 4.5-8 8" />
      <path d="M17 13.5v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

/** A database cylinder: where COMPAS's records live. */
export function DatabaseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </Icon>
  );
}

/** A person: Andrea, Pedro. */
export function PersonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </Icon>
  );
}

