import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "COMPAS",
  description:
    "Embedded authorization and policy layer for purpose-restricted payments.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="bg-neutral-100 text-neutral-900 antialiased">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold">
              COMPAS
            </Link>
            <nav className="flex flex-wrap gap-3 text-neutral-600">
              <Link href="/demo">Demo</Link>
              <Link href="/arq">ARQ</Link>
              <Link href="/nequi">Nequi</Link>
              <Link href="/nequi-negocios">Nequi Negocios</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
