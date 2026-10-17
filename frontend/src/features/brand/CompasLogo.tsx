import Image from "next/image";

/**
 * The official COMPAS logo, cut from `public/compas_logo.jpg` into transparent
 * PNGs under `public/brand/`: the mark (the C and its needle) and the
 * wordmark. The traced SVG paints letter counters in white, so it can't sit
 * on a colored button; these cuts can. Every use sits next to a text label or
 * inside a labeled control, so the images are decorative unless `alt` is given.
 */
export function CompasMark({ className, alt = "", priority }: { className?: string; alt?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/compas-mark.png"
      width={503}
      height={503}
      alt={alt}
      priority={priority}
      draggable={false}
      className={`select-none ${className ?? ""}`}
    />
  );
}

export function CompasWordmark({ className, alt = "", priority }: { className?: string; alt?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/compas-wordmark.png"
      width={898}
      height={187}
      alt={alt}
      priority={priority}
      draggable={false}
      className={`h-auto select-none ${className ?? ""}`}
    />
  );
}
