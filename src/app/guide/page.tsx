import type { Metadata } from "next";
import { ProductGuide } from "@/components/product-guide";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "A guided tour of Timer: build an event, run the show, share a speaker view, and publish the countdown in Zoom.",
};

export default function GuidePage() {
  return <ProductGuide />;
}
