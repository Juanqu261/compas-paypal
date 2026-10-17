import type { CSSProperties } from "react";

/**
 * How COMPAS screens look inside each host app. The host's own colors drive
 * actions and text. `--cx-route` stays COMPAS magenta in every host: it is the
 * color of granted permission, the same one the site uses for the route.
 */
const shared = {
  "--cx-route": "#C2187A",
  "--cx-ok": "#0E7A45",
  "--cx-warn": "#8A5A00",
  "--cx-warn-soft": "#FFF3D6",
  "--cx-danger": "#B42318",
  "--cx-surface": "#FFFFFF",
};

export const COMPAS_THEME = {
  arq: {
    ...shared,
    "--cx-accent": "#09482D",
    "--cx-on-accent": "#FFFFFF",
    "--cx-ink": "#17201B",
    "--cx-muted": "#5F6662",
    "--cx-line": "#E4E6E1",
    "--cx-line-strong": "#C9CDC6",
    "--cx-card": "#F0F1EE",
    "--cx-focus": "#09482D",
    "--cx-radius": "14px",
  },
  nequi: {
    ...shared,
    "--cx-accent": "#200020",
    "--cx-on-accent": "#FFFFFF",
    "--cx-ink": "#200020",
    "--cx-muted": "#5C5262",
    "--cx-line": "#E4E0E8",
    "--cx-line-strong": "#CFC6D6",
    "--cx-card": "#F3F0F6",
    "--cx-focus": "#DA0081",
    "--cx-radius": "12px",
  },
} satisfies Record<string, Record<`--cx-${string}`, string>>;

export function compasTheme(host: keyof typeof COMPAS_THEME): CSSProperties {
  return COMPAS_THEME[host] as CSSProperties;
}
