import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Timer — Every moment, perfectly timed",
    template: "%s · Timer",
  },
  description:
    "A focused, realtime event timer for speakers, panels, and whoever is keeping the room on schedule.",
  openGraph: {
    title: "Timer",
    description: "Every moment, perfectly timed.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Timer event countdown" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Timer",
    description: "Every moment, perfectly timed.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
