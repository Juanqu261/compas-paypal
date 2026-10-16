/**
 * QR-like decoration. It has finder squares and seeded noise only: no format
 * information, no error correction, and no payload. It cannot be scanned as
 * a payment code, and it encodes no URL, wallet address, or personal data.
 */
const GRID = 25;
const FINDER = 7;

function inFinderZone(row: number, col: number): boolean {
  const zone = FINDER + 1;
  return (
    (row < zone && col < zone) ||
    (row < zone && col >= GRID - zone) ||
    (row >= GRID - zone && col < zone)
  );
}

function buildNoisePath(): string {
  let seed = 0x2f6b;
  let path = "";
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      if (!inFinderZone(row, col) && ((seed >>> 16) & 1) === 1) {
        path += `M${col} ${row}h1v1h-1z`;
      }
    }
  }
  return path;
}

const noisePath = buildNoisePath();
const finderOrigins = [
  [0, 0],
  [GRID - FINDER, 0],
  [0, GRID - FINDER],
] as const;

export function NequiBusinessDecorativeQr({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`-1 -1 ${GRID + 2} ${GRID + 2}`}
      role="img"
      aria-label="Código QR"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x="-1" y="-1" width={GRID + 2} height={GRID + 2} fill="#FFFFFF" />
      {finderOrigins.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={FINDER} height={FINDER} fill="#000000" />
          <rect x={x + 1} y={y + 1} width={FINDER - 2} height={FINDER - 2} fill="#FFFFFF" />
          <rect x={x + 2} y={y + 2} width={FINDER - 4} height={FINDER - 4} fill="#000000" />
        </g>
      ))}
      <path d={noisePath} fill="#000000" />
    </svg>
  );
}
