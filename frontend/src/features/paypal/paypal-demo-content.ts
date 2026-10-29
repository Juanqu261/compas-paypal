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
  greeting: "Hi, Pedro",
  initials: "PR",
  profileLabel: "Pedro’s profile",
  balance: { label: "PayPal balance", amount: "$250.00", currency: "USD" },
  accounts: [
    { id: "debit", kind: "card", title: "Debit card", detail: "Visa ••4821" },
    { id: "bank", kind: "bank", title: "Bank account", detail: "Checking ••7305" },
  ],
  transactions: [
    {
      id: "received",
      initials: "LG",
      tone: "teal",
      title: "Laura Gómez",
      detail: "Oct 23 · Money received",
      amount: "+$75.00",
      incoming: true,
    },
    {
      id: "music",
      initials: "M",
      tone: "orange",
      title: "Music subscription",
      detail: "Oct 20 · Automatic payment",
      amount: "−$9.99",
      incoming: false,
    },
    {
      id: "store",
      initials: "T",
      tone: "ink",
      title: "Online store",
      detail: "Oct 14 · Online purchase",
      amount: "−$42.30",
      incoming: false,
    },
    {
      id: "sent",
      initials: "CM",
      tone: "blue",
      title: "Carlos Mejía",
      detail: "Oct 9 · Money sent",
      amount: "−$20.00",
      incoming: false,
    },
  ],
  compasBlurb: "Purpose-bound budgets.",
};

export const paypalDemoDelegate: PayPalDemoProfile = {
  greeting: "Hi, Andrea",
  initials: "AN",
  profileLabel: "Andrea’s profile",
  balance: { label: "PayPal balance", amount: "$24.60", currency: "USD" },
  accounts: [{ id: "debit", kind: "card", title: "Debit card", detail: "Mastercard ••0316" }],
  transactions: [
    {
      id: "received",
      initials: "ML",
      tone: "teal",
      title: "Lucía Restrepo",
      detail: "Oct 22 · Money received",
      amount: "+$15.00",
      incoming: true,
    },
    {
      id: "market",
      initials: "S",
      tone: "orange",
      title: "Grocery store",
      detail: "Oct 19 · Online purchase",
      amount: "−$31.80",
      incoming: false,
    },
    {
      id: "ride",
      initials: "T",
      tone: "ink",
      title: "Rideshare",
      detail: "Oct 12 · Automatic payment",
      amount: "−$6.40",
      incoming: false,
    },
  ],
  compasBlurb: "Purpose-bound purchases.",
};
