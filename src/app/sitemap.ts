import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://orbit-voyages-3d.vercel.app/", changeFrequency: "monthly", priority: 1 }];
}
