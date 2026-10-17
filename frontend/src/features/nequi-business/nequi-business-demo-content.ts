/**
 * Decorative content for the simulated Nequi Negocios merchant app.
 * demo/test data.
 *
 * None of these values is real merchant data, a live balance, or a working
 * checkout link. The COMPAS story fixtures live in `data/fixtures/demo/` and
 * are not used for this wallet decoration.
 */
export const nequiBusinessDemo = {
  statusTime: "4:00 PM",
  ownerName: "Daniel Ossa",
  salesToday: "$0,00",
  salesTodayLabel: "Ventas del 16/Oct/2026",
  balanceUpdatedAt: "4:00 pm",
  summaryDate: "16 de octubre",
  available: "$0,00",
  inProcess: "$0,00",
  qrSales: "$0,00",
  cardAndLinkSales: "$0,00",
  /** Display text only. It is not rendered as a link and goes nowhere. */
  checkoutLinkText: "checkout.nequi.wompi.co/l/VPOS_0000",
} as const;
