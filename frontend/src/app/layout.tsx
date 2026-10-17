import type { Metadata } from "next";
import { Familjen_Grotesk, Young_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "@/features/site/SiteHeader";
import "./globals.css";

const heading = Young_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
});

const body = Familjen_Grotesk({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "COMPAS",
  description:
    "Embedded authorization and policy layer for purpose-restricted payments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-dvh font-site antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
