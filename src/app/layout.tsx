import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

/* Font budget: only the hero face (the h1 is the LCP) is preloaded — its two files.
   The other faces swap in over metric-adjusted fallbacks, so there is no layout shift. */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--nf-display",
  display: "swap",
  preload: true,
});
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--nf-sans", display: "swap", preload: false });
const mono = Space_Mono({ subsets: ["latin"], weight: "400", variable: "--nf-mono", display: "swap", preload: false });

const SITE_URL = "https://orbit-voyages-3d.vercel.app";
/* the GitHub Pages mirror serves its own OG images (vercel.app is blocked in some regions);
   canonical always points at the main site */
const PAGES_ORIGIN = "https://kyan9400.github.io";
const METADATA_BASE = process.env.GH_PAGES === "1" ? PAGES_ORIGIN : SITE_URL;
const DESCRIPTION =
  "Orbit Voyages flies twelve passengers at a time from low Earth orbit to Mars. Scroll the seven-month flight in real-time 3D.";

export const metadata: Metadata = {
  metadataBase: new URL(METADATA_BASE),
  title: { default: "Orbit Voyages — Passenger flights to Mars", template: "%s · Orbit Voyages" },
  description: DESCRIPTION,
  applicationName: "Orbit Voyages",
  authors: [{ name: "Alhassan Alfarran", url: "https://alhassan-portfolio-sigma.vercel.app" }],
  creator: "Alhassan Alfarran",
  keywords: ["space tourism", "Mars", "WebGL", "three.js", "React Three Fiber", "portfolio", "concept"],
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/`,
    siteName: "Orbit Voyages",
    title: "Orbit Voyages — Leave the planet. Keep the view.",
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orbit Voyages — Leave the planet. Keep the view.",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#04050a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
