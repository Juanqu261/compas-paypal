"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { storyDirection } from "@/features/site/story";

type StoryLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

/** A link that slides the page forward or back along the story order. */
export function StoryLink({ href, ...props }: StoryLinkProps) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      transitionTypes={storyDirection(pathname, href)}
      {...props}
    />
  );
}
