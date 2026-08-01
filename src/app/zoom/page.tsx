import type { Metadata } from "next";
import { ZoomTimer } from "@/components/zoom/zoom-timer";

export const metadata: Metadata = {
  title: "Zoom",
  description: "Publish the live speaker countdown to a Zoom meeting.",
  robots: { index: false, follow: false },
};

export default function ZoomAppPage() {
  return <ZoomTimer />;
}
