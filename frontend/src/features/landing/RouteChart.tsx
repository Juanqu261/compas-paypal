type Point = { x: number; y: number };

type ChartLayout = {
  viewBox: string;
  payer: Point;
  merchant: Point;
  compas: Point;
  delegate: Point;
  /** Where COMPAS's check meets the payment route. */
  checkpoint: Point;
  land: string[];
  contours: string[];
  labels: {
    payer: Point & { anchor: "start" | "middle" | "end" };
    merchant: Point & { anchor: "start" | "middle" | "end" };
    compas: Point;
    delegate: Point;
    route: Point & { rotate?: number };
    check: Point;
    permission: Point;
  };
};

const wide: ChartLayout = {
  viewBox: "0 0 960 420",
  payer: { x: 150, y: 130 },
  merchant: { x: 810, y: 130 },
  compas: { x: 480, y: 262 },
  delegate: { x: 480, y: 372 },
  checkpoint: { x: 480, y: 130 },
  land: [
    "M0 0 H118 C150 40 196 70 186 120 C178 168 120 196 128 250 C136 300 92 360 64 420 H0 Z",
    "M960 0 H842 C812 50 768 78 778 130 C788 176 846 206 838 262 C832 318 872 370 900 420 H960 Z",
  ],
  contours: [
    "M200 40 C320 70 400 20 520 46 C640 72 700 30 770 52",
    "M210 210 C330 190 380 240 470 226 C560 212 640 250 760 214",
    "M170 330 C280 300 360 350 440 330 M520 330 C600 312 700 352 800 320",
  ],
  labels: {
    payer: { x: 150, y: 74, anchor: "middle" },
    merchant: { x: 810, y: 74, anchor: "middle" },
    compas: { x: 512, y: 258 },
    delegate: { x: 512, y: 368 },
    route: { x: 300, y: 114 },
    check: { x: 492, y: 196 },
    permission: { x: 492, y: 322 },
  },
};

const narrow: ChartLayout = {
  viewBox: "0 0 360 640",
  payer: { x: 56, y: 80 },
  merchant: { x: 56, y: 572 },
  compas: { x: 150, y: 318 },
  delegate: { x: 150, y: 452 },
  checkpoint: { x: 56, y: 318 },
  land: [
    "M0 0 H360 V22 C300 40 230 18 170 34 C120 48 100 120 40 128 C24 130 10 126 0 120 Z",
    "M0 640 H360 V618 C300 600 220 626 160 610 C110 596 96 526 40 516 C24 514 10 518 0 524 Z",
  ],
  contours: [
    "M120 170 C180 150 240 190 340 160",
    "M110 400 C170 380 220 410 340 390",
  ],
  labels: {
    payer: { x: 84, y: 76, anchor: "start" },
    merchant: { x: 84, y: 568, anchor: "start" },
    compas: { x: 178, y: 314 },
    delegate: { x: 172, y: 448 },
    route: { x: 40, y: 452, rotate: -90 },
    check: { x: 72, y: 268 },
    permission: { x: 162, y: 392 },
  },
};

function Chart({ layout, className }: { layout: ChartLayout; className: string }) {
  const { payer, merchant, compas, delegate, checkpoint, labels } = layout;
  const vertical = payer.x === merchant.x;

  return (
    <svg
      viewBox={layout.viewBox}
      className={className}
      role="img"
      aria-label="The payment goes from Pedro’s PayPal straight to the pharmacy’s PayPal. COMPAS sits off that route: it checks the purchase before the payment and gives Andrea permission, never money."
    >
      <defs>
        <marker
          id={`route-arrow-${vertical ? "v" : "h"}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--color-route)" />
        </marker>
      </defs>

      <rect width="100%" height="100%" fill="var(--color-shoal)" fillOpacity="0.45" />
      {layout.contours.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--color-shoal-deep)" strokeWidth="1" strokeDasharray="1 5" strokeLinecap="round" />
      ))}
      {layout.land.map((d) => (
        <path key={d} d={d} fill="var(--color-buff)" stroke="var(--color-ink)" strokeOpacity="0.35" strokeWidth="0.75" />
      ))}

      {/* The payment route. COMPAS never sits on it. */}
      <line
        x1={payer.x}
        y1={payer.y}
        x2={vertical ? merchant.x : merchant.x - 18}
        y2={vertical ? merchant.y - 18 : merchant.y}
        stroke="var(--color-route)"
        strokeWidth="3"
        markerEnd={`url(#route-arrow-${vertical ? "v" : "h"})`}
      />

      {/* The check happens before the payment, across the water. */}
      <line
        x1={compas.x}
        y1={compas.y}
        x2={checkpoint.x}
        y2={checkpoint.y}
        stroke="var(--color-ink)"
        strokeWidth="1.25"
        strokeDasharray="5 5"
      />
      <circle cx={checkpoint.x} cy={checkpoint.y} r="6" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="1.5" />

      {/* Permission, not money, goes to Andrea. */}
      <line
        x1={compas.x}
        y1={compas.y}
        x2={delegate.x}
        y2={delegate.y}
        stroke="var(--color-route)"
        strokeWidth="1.5"
        strokeDasharray="2 5"
        strokeLinecap="round"
      />

      {[payer, merchant].map((node) => (
        <g key={`${node.x}-${node.y}`}>
          <circle cx={node.x} cy={node.y} r="14" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2" />
          <circle cx={node.x} cy={node.y} r="5" fill="var(--color-ink)" />
        </g>
      ))}
      <g transform={`translate(${compas.x} ${compas.y})`}>
        <circle r="20" fill="var(--color-paper)" stroke="var(--color-route)" strokeWidth="1.5" />
        <path d="M0 -17 L4 0 L-4 0 Z" fill="var(--color-route)" />
        <path d="M0 17 L4 0 L-4 0 Z" fill="var(--color-ink)" />
      </g>
      <circle cx={delegate.x} cy={delegate.y} r="9" fill="var(--color-paper)" stroke="var(--color-route)" strokeWidth="2" />

      <g className="font-site" fill="var(--color-ink)">
        <text x={labels.payer.x} y={labels.payer.y} textAnchor={labels.payer.anchor}>
          <tspan className="font-display" fontSize="20">Pedro’s PayPal</tspan>
          <tspan x={labels.payer.x} dy="22" fontSize="14" fill="var(--color-ink-soft)">PayPal app, simulated</tspan>
        </text>
        <text x={labels.merchant.x} y={labels.merchant.y} textAnchor={labels.merchant.anchor}>
          <tspan className="font-display" fontSize="20">Pharmacy’s PayPal</tspan>
          <tspan x={labels.merchant.x} dy="22" fontSize="14" fill="var(--color-ink-soft)">Nequi Negocios, simulated</tspan>
        </text>
        <text x={labels.compas.x} y={labels.compas.y}>
          <tspan className="font-display" fontSize="20">COMPAS</tspan>
          <tspan x={labels.compas.x} dy="20" fontSize="14" fill="var(--color-ink-soft)">holds no money</tspan>
        </text>
        <text x={labels.delegate.x} y={labels.delegate.y}>
          <tspan fontSize="16" fontWeight="600">Andrea, with Gladys</tspan>
          <tspan x={labels.delegate.x} dy="20" fontSize="14" fill="var(--color-ink-soft)">Nequi, simulated</tspan>
        </text>
        <text
          x={labels.route.x}
          y={labels.route.y}
          fontSize="15"
          fill="var(--color-route-deep)"
          className="italic"
          transform={
            labels.route.rotate
              ? `rotate(${labels.route.rotate} ${labels.route.x} ${labels.route.y})`
              : undefined
          }
        >
          The payment, straight from payer to merchant
        </text>
        <text x={labels.check.x} y={labels.check.y} fontSize="14" className="italic">
          <tspan>Allow or deny,</tspan>
          <tspan x={labels.check.x} dy="18">before any payment</tspan>
        </text>
        <text x={labels.permission.x} y={labels.permission.y} fontSize="14" fill="var(--color-route-deep)" className="italic">
          Permission only
        </text>
      </g>
    </svg>
  );
}

export function RouteChart() {
  return (
    <div className="self-center overflow-hidden rounded-lg border border-ink/15">
      <Chart layout={wide} className="hidden h-auto w-full md:block" />
      <Chart layout={narrow} className="block h-auto w-full md:hidden" />
    </div>
  );
}
