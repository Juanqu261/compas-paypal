/**
 * Decorative content for the simulated PayPal app home. demo/test data.
 *
 * None of these values is read from PayPal: not Pedro's sandbox balance, not
 * a real card or bank, not a real transaction. The only real PayPal step in
 * the demo is the order approval, which opens the PayPal sandbox itself. The
 * COMPAS story fixtures live in `data/fixtures/demo/` and are not used here.
 */

export const paypalDemoPayer = {
  greeting: "Hola, Pedro",
  initials: "PR",
} as const;

export const paypalDemoBalance = {
  label: "Saldo de PayPal",
  amount: "$250.00",
  currency: "USD",
} as const;

export type PayPalDemoAccount = {
  id: string;
  kind: "card" | "bank";
  title: string;
  detail: string;
};

export const paypalDemoAccounts: readonly PayPalDemoAccount[] = [
  { id: "debit", kind: "card", title: "Tarjeta de débito", detail: "Visa ••4821" },
  { id: "bank", kind: "bank", title: "Cuenta bancaria", detail: "Corriente ••7305" },
];

export type PayPalDemoTransaction = {
  id: string;
  initials: string;
  /** Avatar fill. Decorative. */
  tone: "blue" | "orange" | "teal" | "ink";
  title: string;
  detail: string;
  amount: string;
  incoming: boolean;
};

export const paypalDemoTransactions: readonly PayPalDemoTransaction[] = [
  {
    id: "received",
    initials: "LG",
    tone: "teal",
    title: "Laura Gómez",
    detail: "23 oct · Dinero recibido",
    amount: "+$75.00",
    incoming: true,
  },
  {
    id: "music",
    initials: "M",
    tone: "orange",
    title: "Suscripción de música",
    detail: "20 oct · Pago automático",
    amount: "−$9.99",
    incoming: false,
  },
  {
    id: "store",
    initials: "T",
    tone: "ink",
    title: "Tienda en línea",
    detail: "14 oct · Compra en línea",
    amount: "−$42.30",
    incoming: false,
  },
  {
    id: "sent",
    initials: "CM",
    tone: "blue",
    title: "Carlos Mejía",
    detail: "09 oct · Dinero enviado",
    amount: "−$20.00",
    incoming: false,
  },
];
