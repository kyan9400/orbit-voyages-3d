import type { MetadataRoute } from "next";

// plain static file (also required by the GitHub Pages export)
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://orbit-voyages-3d.vercel.app/", changeFrequency: "monthly", priority: 1 }];
}
