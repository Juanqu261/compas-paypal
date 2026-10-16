import Link from "next/link";

const routes = [
  { href: "/demo", label: "Demo", detail: "Three surfaces, one shared state" },
  { href: "/arq", label: "ARQ", detail: "Pedro, payer" },
  { href: "/nequi", label: "Nequi", detail: "Andrea, delegate" },
  {
    href: "/nequi-negocios",
    label: "Nequi Negocios",
    detail: "Pharmacy, merchant",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">COMPAS</h1>
        <p>
          An embedded authorization layer for purpose-restricted spending on
          existing wallets.
        </p>
        <p className="text-neutral-600">
          Money stays where it is. COMPAS moves permission, not money.
        </p>
      </header>
      <ul className="space-y-2">
        {routes.map((route) => (
          <li key={route.href}>
            <Link href={route.href} className="underline">
              {route.label}
            </Link>
            <span className="text-neutral-600"> — {route.detail}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-600">
        Hackathon scaffold. ARQ, Nequi, and Nequi Negocios on these pages are
        simulated surfaces. No payment is executed here.
      </p>
    </main>
  );
}
