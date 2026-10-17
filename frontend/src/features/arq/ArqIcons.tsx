import type { ReactNode } from "react";

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

export function ProfileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.2 3.9-5 7-5s5.8 1.8 7 5" />
    </Icon>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v7.5h14V12M12 8v11.5" />
      <path d="M12 8C10.5 5 7 4.5 7 6.8 7 8 9 8 12 8Zm0 0c1.5-3 5-3.5 5-1.2C17 8 15 8 12 8Z" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l1.8 1.8M15.2 15.2 17 17M17 7l-1.8 1.8M8.8 15.2 7 17" />
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
      <path d="m9 6 6 6-6 6" />
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

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ConvertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4 3.5 7.5 7 11M3.5 7.5H16M17 13l3.5 3.5L17 20M20.5 16.5H8" />
    </Icon>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18v2M18 14h2" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
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

export function ArrowDownLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 7 7 17M7 9v8h8" />
    </Icon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Icon>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 14.5h3" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </Icon>
  );
}

export function CreditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 17 3.5-4.5" />
    </Icon>
  );
}

export function TransferIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 20V4M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3" />
    </Icon>
  );
}

export function InvestIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 19.5h16M5.5 15.5l4.5-5 3.5 3L19 8M15 8h4v4" />
    </Icon>
  );
}

export function SavingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M7 19v1.5M17 19v1.5" />
    </Icon>
  );
}

/** Simplified flag drawn with shapes. Decorative. */
export function UsFlag({ className }: IconProps) {
  const stripe = 24 / 13;
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 overflow-hidden rounded-full ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" className="block size-full" focusable="false">
        <rect width="24" height="24" fill="#FFFFFF" />
        {Array.from({ length: 7 }, (_, index) => (
          <rect
            key={index}
            y={index * stripe * 2}
            width="24"
            height={stripe}
            fill="#B22234"
          />
        ))}
        <rect width="11" height={stripe * 7} fill="#3C3B6E" />
      </svg>
    </span>
  );
}

/** Simplified flag drawn with shapes. Decorative. */
export function CoFlag({ className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 overflow-hidden rounded-full ${className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" className="block size-full" focusable="false">
        <rect width="24" height="12" fill="#FCD116" />
        <rect y="12" width="24" height="6" fill="#003893" />
        <rect y="18" width="24" height="6" fill="#CE1126" />
      </svg>
    </span>
  );
}
