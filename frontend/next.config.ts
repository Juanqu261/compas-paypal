import type { NextConfig } from "next";

/**
 * The COMPAS backend. The browser calls `/compas-api/*` on this app and Next
 * proxies it, so the backend needs no CORS and no public URL. Server-side
 * only: never a NEXT_PUBLIC_* variable.
 */
const compasBackendUrl = (process.env.COMPAS_BACKEND_URL?.trim() || "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/compas-api/:path*", destination: `${compasBackendUrl}/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
