import { ViewTransition } from "react";
import type { SurfaceId } from "@/features/site/story";

/** A person's name that morphs between the home page and their surface page. */
export function PersonaName({
  surface,
  name,
  className,
}: {
  surface: SurfaceId;
  name: string;
  className?: string;
}) {
  return (
    <ViewTransition name={`persona-${surface}`} share="morph" default="none">
      <span className={`inline-block ${className ?? ""}`}>{name}</span>
    </ViewTransition>
  );
}
