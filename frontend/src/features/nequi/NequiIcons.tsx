import type { ReactNode } from "react";

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
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

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6z" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 8.5a3.5 3.5 0 1 1 5.2 3c-1.1.6-1.7 1.4-1.7 2.6v.9" />
      <path d="M12 19.5h.01" strokeWidth={2.4} />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
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
      <path d="M6.6 7.1C3.9 8.8 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5M10 5.7c.6-.1 1.3-.2 2-.2 6 0 9.5 6.5 9.5 6.5s-.7 1.4-2 2.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 5.5 6.5 6.5L9 18.5" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5v15M6 13.5l6 6 6-6" />
    </Icon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19.5v-15M6 10.5l6-6 6 6" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={props.className}
    >
      <path d="M12 3.2 3.5 10v10.3c0 .4.3.7.7.7H9.5v-5.5a2.5 2.5 0 0 1 5 0V21h5.3c.4 0 .7-.3.7-.7V10z" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h7" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </Icon>
  );
}

export function DollarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M16.5 7.5c-.7-1.4-2.4-2.3-4.5-2.3-2.6 0-4.4 1.4-4.4 3.3 0 4.6 9.2 2.4 9.2 7 0 2-2 3.4-4.8 3.4-2.2 0-3.9-.9-4.6-2.4" />
    </Icon>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <path d="M13.5 13.5h3v3h-3zM17.5 17.5H20V20h-2.5zM13.5 19.5V20M19.5 13.5h.5" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
    </Icon>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V12" />
      <path d="M17.5 3.5 20.5 6.5 12 15l-3.5.5.5-3.5z" />
    </Icon>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 18.5c.4-2.8 2.6-4.5 5.5-4.5s5.1 1.7 5.5 4.5z" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M16 14c2.5 0 4.2 1.4 4.5 3.8h-4" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 3.5 3.5 10.5l7 3 3 7z" />
      <path d="m10.5 13.5 4-4" />
    </Icon>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="15.5" cy="8.5" r="4.5" />
      <circle cx="16.5" cy="7.5" r="1" />
      <path d="M12.3 11.7 4 20M6.5 17.5 8.5 19.5M9 15l1.5 1.5" />
    </Icon>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.5h14.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M4 7.5 15.5 4.5V7.5M15.5 13.5h1.5" />
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

export function PhoneCardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="3" width="11" height="18" rx="2" />
      <path d="M11 6h2v2.5h-2zM9 13v5" />
    </Icon>
  );
}

export function SmileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2 2" />
      <path d="M9 10h.01M15 10h.01" strokeWidth={2.4} />
      <path d="M8.5 14c1.8 2 5.2 2 7 0" />
    </Icon>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5 5.5 4.5h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5.5 12v7.5h13V12M10 19.5v-4h4v4" />
    </Icon>
  );
}

export function MobileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="3" width="11" height="18" rx="2" />
      <path d="M10 6h4M11 18h2" />
    </Icon>
  );
}

export function PiggyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 11.5a6 5 0 0 1 6-5h2a6 5 0 0 1 5.5 3h1.5v4h-1.7a6 5 0 0 1-2.3 2.4V19h-2.5v-2h-3v2H8v-3a5 5 0 0 1-3-4.5Z" />
      <path d="M15 9.5h.01" strokeWidth={2.4} />
    </Icon>
  );
}
