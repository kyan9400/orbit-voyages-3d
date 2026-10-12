import type { NextConfig } from "next";

/* GH_PAGES=1 builds a static mirror for GitHub Pages (npm run build:pages).
   The default build (Vercel) is unchanged. */
const pages = process.env.GH_PAGES === "1";
const basePath = pages ? "/orbit-voyages-3d" : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // lets client code prefix plain asset URLs (CSS-style backgrounds) with the base path
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(pages && {
    output: "export",
    basePath,
    assetPrefix: basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
