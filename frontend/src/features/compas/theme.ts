import type { CSSProperties } from "react";

/**
 * How COMPAS screens look inside each host app. The host's own colors drive
 * actions and text. `--cx-route` stays COMPAS blue in every host: it is the
 * color of granted permission, the same one the site uses for the route.
 */
const shared = {
  "--cx-route": "#0172FF",
  "--cx-ok": "#0E7A45",
  "--cx-warn": "#8A5A00",
  "--cx-warn-soft": "#FFF3D6",
  "--cx-danger": "#B42318",
  "--cx-surface": "#FFFFFF",
};

export const COMPAS_THEME = {
  paypal: {
    ...shared,
    "--cx-accent": "#002991",
    "--cx-on-accent": "#FFFFFF",
    "--cx-ink": "#001435",
    "--cx-muted": "#5E6271",
    "--cx-line": "#E8E9ED",
    "--cx-line-strong": "#CDD0D8",
    "--cx-card": "#F1F2F4",
    "--cx-focus": "#0070E0",
    "--cx-radius": "16px",
  },
} satisfies Record<string, Record<`--cx-${string}`, string>>;

export function compasTheme(host: keyof typeof COMPAS_THEME): CSSProperties {
  return COMPAS_THEME[host] as CSSProperties;
}
