/**
 * Decorative content for the simulated PayPal app home. demo/test data.
 *
 * None of these values is read from PayPal: not a sandbox balance, not a real
 * card or bank, not a real transaction. The only real PayPal step in the demo
 * is the order approval, which opens the PayPal sandbox itself. The COMPAS
 * story fixtures live in `data/fixtures/demo/` and are not used here.
 *
 * The same app shows two people: Pedro (payer) and Andrea (delegate). Each has
 * a profile; the home renders whichever one it is given.
 */

export type PayPalDemoAccount = {
  id: string;
  kind: "card" | "bank";
  title: string;
  detail: string;
};

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

export type PayPalDemoProfile = {
  greeting: string;
  initials: string;
  profileLabel: string;
  balance: { label: string; amount: string; currency: string };
  accounts: readonly PayPalDemoAccount[];
  transactions: readonly PayPalDemoTransaction[];
  /** The line under COMPAS's entry on the home. */
  compasBlurb: string;
};

export const paypalDemoPayer: PayPalDemoProfile = {
  greeting: "Hola, Pedro",
  initials: "PR",
  profileLabel: "Perfil de Pedro",
  balance: { label: "Saldo de PayPal", amount: "$250.00", currency: "USD" },
  accounts: [
    { id: "debit", kind: "card", title: "Tarjeta de débito", detail: "Visa ••4821" },
    { id: "bank", kind: "bank", title: "Cuenta bancaria", detail: "Corriente ••7305" },
  ],
  transactions: [
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
  ],
  compasBlurb: "Presupuestos con propósito para tu familia. Apruebas cada pago en PayPal.",
};

export const paypalDemoDelegate: PayPalDemoProfile = {
  greeting: "Hola, Andrea",
  initials: "AN",
  profileLabel: "Perfil de Andrea",
  balance: { label: "Saldo de PayPal", amount: "$24.60", currency: "USD" },
  accounts: [{ id: "debit", kind: "card", title: "Tarjeta de débito", detail: "Mastercard ••0316" }],
  transactions: [
    {
      id: "received",
      initials: "ML",
      tone: "teal",
      title: "Lucía Restrepo",
      detail: "22 oct · Dinero recibido",
      amount: "+$15.00",
      incoming: true,
    },
    {
      id: "market",
      initials: "S",
      tone: "orange",
      title: "Supermercado",
      detail: "19 oct · Compra en línea",
      amount: "−$31.80",
      incoming: false,
    },
    {
      id: "ride",
      initials: "T",
      tone: "ink",
      title: "Transporte",
      detail: "12 oct · Pago automático",
      amount: "−$6.40",
      incoming: false,
    },
  ],
  compasBlurb: "Compras con propósito que te autorizó tu familia. Quien te autorizó aprueba cada pago en PayPal.",
};
