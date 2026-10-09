import type { Metadata, Viewport } from "next";
import { Playfair_Display, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const display = Playfair_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--nf-display",
  display: "swap",
});
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--nf-sans", display: "swap" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--nf-mono", display: "swap", preload: false });

const SITE_URL = "https://orbit-voyages-3d.vercel.app";
const DESCRIPTION =
  "Orbit Voyages flies twelve passengers at a time from low Earth orbit to Mars. Scroll the seven-month flight in real-time 3D.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Orbit Voyages — Passenger flights to Mars", template: "%s · Orbit Voyages" },
  description: DESCRIPTION,
  applicationName: "Orbit Voyages",
  authors: [{ name: "Alhassan Alfarran", url: "https://alhassan-portfolio-sigma.vercel.app" }],
  creator: "Alhassan Alfarran",
  keywords: ["space tourism", "Mars", "WebGL", "three.js", "React Three Fiber", "portfolio", "concept"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
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
