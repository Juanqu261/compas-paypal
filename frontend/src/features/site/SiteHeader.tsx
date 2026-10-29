"use client";

import { usePathname } from "next/navigation";
import { CompasMark, CompasWordmark } from "@/features/brand/CompasLogo";
import { StoryLink } from "@/features/site/StoryLink";

export function SiteHeader() {
  const pathname = usePathname();
  const onDemo = pathname === "/demo";

  return (
    <header
      style={{ viewTransitionName: "site-header" }}
      className="relative z-10 border-b border-ink/10 bg-paper/85 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <StoryLink
            href="/"
            className="flex items-center gap-2.5 text-ink"
            aria-label="COMPAS home"
          >
            <CompasMark className="size-8" priority />
            <CompasWordmark className="w-[6.5rem]" priority />
          </StoryLink>
          <span aria-hidden="true" className="hidden h-6 w-px bg-ink/15 sm:block" />
          <p className="hidden text-sm text-ink-soft sm:block">
            Permission, not money
          </p>
        </div>
        <nav aria-label="Pages" className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-ink/15 px-2.5 py-1 text-xs text-ink-soft md:inline-flex">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-buff" />
            PayPal sandbox
          </span>
          <StoryLink
            href="/demo"
            aria-current={onDemo ? "page" : undefined}
            className={`inline-flex items-center rounded-md px-4 py-2 text-[0.95rem] font-medium transition-colors duration-200 motion-reduce:transition-none ${
              onDemo
                ? "border border-route/40 text-route-deep"
                : "bg-route text-paper hover:bg-route-deep"
            }`}
          >
            Demo
          </StoryLink>
        </nav>
      </div>
    </header>
  );
}
