import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Aura Timer — Every moment, perfectly timed",
    template: "%s · Aura Timer",
  },
  description:
    "A focused, realtime event timer for speakers, panels, and the teams keeping the room on schedule.",
  openGraph: {
    title: "Aura Timer",
    description: "Every moment, perfectly timed.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Aura Timer event countdown" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aura Timer",
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
