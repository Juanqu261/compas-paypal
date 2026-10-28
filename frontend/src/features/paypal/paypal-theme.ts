import type { CSSProperties } from "react";

/**
 * PayPal app simulation palette, shared by the payer's app and the merchant's
 * PayPal Business app. Scoped to each surface's root.
 */
export const paypalTheme = {
  "--pp-ink": "#001435",
  "--pp-navy": "#002991",
  "--pp-blue": "#0070E0",
  "--pp-sky": "#60CDFF",
  "--pp-chip": "#F1F2F4",
  "--pp-chip-strong": "#E3E5E9",
  "--pp-line": "#E8E9ED",
  "--pp-muted": "#5E6271",
  "--pp-green": "#0D8040",
  "--pp-mint": "#DDF3E6",
  "--pp-sand": "#FFF1D6",
  "--pp-info": "#E6F1FC",
  "--pp-alert": "#B42318",
  "--pp-alert-soft": "#FCE4E1",
} as CSSProperties;
