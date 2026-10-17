/**
 * Decorative content for the simulated ARQ home screen. demo/test data.
 *
 * None of these values is Pedro's real balance, a live exchange rate, a real
 * payment card, or a real transaction. The COMPAS story fixtures live in
 * `data/fixtures/demo/` and are not used for this wallet decoration.
 */

export const arqDemoBalance = {
  amount: "$0.00",
  asset: "USDc",
} as const;

export const arqDemoRewardPill = "$25 USDc";

export type ArqDemoCard = {
  id: string;
  label: string;
  suffix: string;
  tone: "forest" | "mint";
};

export const arqDemoCards: readonly ArqDemoCard[] = [
  { id: "virtual", label: "Tarjeta virtual", suffix: "4821", tone: "forest" },
  { id: "physical", label: "Tarjeta física", suffix: "7305", tone: "mint" },
];

export type ArqDemoTransaction = {
  id: string;
  kind: "incoming" | "outgoing" | "card";
  title: string;
  date: string;
  amount: string;
  detail: string;
};

export const arqDemoTransactions: readonly ArqDemoTransaction[] = [
  {
    id: "topup",
    kind: "incoming",
    title: "Recarga",
    date: "12 oct",
    amount: "+$50.00",
    detail: "USDc",
  },
  {
    id: "convert",
    kind: "outgoing",
    title: "Conversión a COP",
    date: "10 oct",
    amount: "−$35.00",
    detail: "USDc",
  },
  {
    id: "card",
    kind: "card",
    title: "Compra con tarjeta",
    date: "08 oct",
    amount: "−$15.00",
    detail: "•• 4821",
  },
];

/** Display values only. Not a quote and not a live rate. */
export const arqDemoRate = {
  pair: "USDc/COP",
  change: "+0,31 %",
  buy: "$3.915,40",
  sell: "$3.861,10",
} as const;
