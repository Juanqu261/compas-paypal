import type { ReactNode } from "react";

type IconProps = { className?: string };

function Icon({
  className,
  strokeWidth = 1.8,
  children,
}: IconProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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

export function StoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5 5.5 4.5h13L20 9.5" />
      <path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5" />
      <path d="M5.5 12v7.5h13V12M8 19.5V15h3.5v4.5M14 15h2.5v2.5H14z" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8M12 17.2h.01" />
    </Icon>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M6.5 14.5h3" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2.2}>
      <path d="M9.5 15.5h-2a3.5 3.5 0 0 1 0-7h2M14.5 8.5h2a3.5 3.5 0 0 1 0 7h-2M8.5 12h7" />
    </Icon>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <path d="M6.5 6.5h1.5v1.5H6.5zM16 6.5h1.5v1.5H16zM6.5 16h1.5v1.5H6.5z" fill="currentColor" />
      <path d="M13.5 13.5h3v3h-3zM18 18h2v2h-2zM18 13.5h2" fill="currentColor" />
    </Icon>
  );
}

export function DollarSquareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 6.5v11M14.8 9.2c-.4-1-1.5-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2.1 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.4 0-2.5-.6-2.9-1.7" />
    </Icon>
  );
}

export function MoneyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5.5" width="19" height="11" rx="1.5" />
      <circle cx="12" cy="11" r="2.5" />
      <path d="M5.5 8.5h.01M18.5 13.5h.01M4 19h16" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M17.5 3.5v4h-4" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.5}>
      <path d="M20.5 12h-17M9.5 5.5 3.5 12l6 6.5" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="M21 3 3 10.5l7.5 3L21 3Zm0 0-7.5 18-3-7.5" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </Icon>
  );
}

export function HomeIcon({ className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Icon className={className}>
      <path
        d="M4 10.2 12 3.8l8 6.4V20h-5.5v-5h-5v5H4z"
        fill={filled ? "currentColor" : "none"}
      />
    </Icon>
  );
}

export function SalesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h12v15.5a1.5 1.5 0 0 1-1.5 1.5H6z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.5}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="m5 9 7 7 7-7" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <path d="m8.7 10.7 6.6-3.9M8.7 13.3l6.6 3.9" />
    </Icon>
  );
}

export function InstantMoneyIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="M19.8 10a8 8 0 1 1-4.6-5.4" />
      <path d="M14.5 2.5 15.6 5l-2.6.9" />
      <path d="M12 7.5v9M14 9.4c-.3-.7-1.1-1.1-2-1.1-1.1 0-2 .6-2 1.4s.9 1.2 2 1.5 2 .7 2 1.5-.9 1.4-2 1.4c-1 0-1.8-.4-2.1-1.2" />
    </Icon>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </Icon>
  );
}

/** Neutral geometric stand-ins for provider marks. Not logos. */
export function ZigzagMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M3 5l3.6 14L10.2 9l3.6 10L18 5M18 5l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LetterMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <rect x="1" y="2" width="3" height="3" rx="0.6" fill="#E9A3C9" />
      <path
        d="M7 20V5l10 15V5"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
