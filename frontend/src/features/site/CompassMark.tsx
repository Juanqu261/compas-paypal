/** The COMPAS mark: a four-point rose whose north point is the route magenta. */
export function CompassMark({ className }: { className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true" className={className}>
      <circle r="10.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M0 -11 L2.6 0 L-2.6 0 Z" fill="var(--color-route)" />
      <path d="M0 11 L2.6 0 L-2.6 0 Z" fill="currentColor" />
      <path d="M-8 0 L0 -1.8 L0 1.8 Z M8 0 L0 -1.8 L0 1.8 Z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
