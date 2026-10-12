import type { MetadataRoute } from "next";

// plain static file (also required by the GitHub Pages export)
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://orbit-voyages-3d.vercel.app/sitemap.xml",
  };
}
