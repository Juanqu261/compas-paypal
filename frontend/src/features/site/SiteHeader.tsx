"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";
import { CompasMark, CompasWordmark } from "@/features/brand/CompasLogo";
import { StoryLink } from "@/features/site/StoryLink";
import { surfaces } from "@/features/site/story";

const links = [
  { href: "/demo", label: "Demo" },
  ...surfaces.map((surface) => ({ href: surface.href, label: surface.person })),
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header
      style={{ viewTransitionName: "site-header" }}
      className="relative z-10 border-b border-ink/10 bg-paper/85 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-3 sm:px-8">
        <StoryLink
          href="/"
          className="flex items-center gap-2.5 text-ink"
          aria-label="COMPAS home"
        >
          <CompasMark className="size-8" priority />
          <CompasWordmark className="w-[6.5rem]" priority />
        </StoryLink>
        <nav aria-label="Pages" className="-mx-2 flex flex-wrap">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <StoryLink
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-2 py-1.5 text-[0.95rem] transition-colors duration-200 hover:text-ink motion-reduce:transition-none ${
                  active ? "text-ink" : "text-ink-soft"
                }`}
              >
                {link.label}
                {active ? (
                  <ViewTransition name="nav-marker" share="auto" default="none">
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 -bottom-[0.8rem] block h-[3px] rounded-full bg-route"
                    />
                  </ViewTransition>
                ) : null}
              </StoryLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
