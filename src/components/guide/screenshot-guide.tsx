"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Expand, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GuideScreenshot } from "@/lib/guide-screenshots";

export function ScreenshotGuide({ screenshot }: { screenshot: GuideScreenshot }) {
  const [selected, setSelected] = useState(0);
  const [markers, setMarkers] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = screenshot.hotspots[selected];
  return <figure className="overflow-hidden rounded-panel border border-line bg-white">
    <div className="relative">
      <Image unoptimized src={screenshot.src} alt={screenshot.alt} width={screenshot.width} height={screenshot.height} className="h-auto w-full" />
      {markers && screenshot.hotspots.map((hotspot, i) => <button key={hotspot.label} type="button" aria-label={`Locate ${hotspot.label}`} aria-pressed={selected === i} style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }} className={`absolute hidden size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-semibold shadow-md sm:flex ${selected === i ? "bg-violet-dark text-white" : "bg-white text-violet-dark"}`} onClick={() => setSelected(i)}>{i + 1}</button>)}
    </div>
    <figcaption className="border-t border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[13px] text-text-muted">{screenshot.caption}</p><Button size="sm" onClick={() => dialog.current?.showModal()}><Expand size={14} aria-hidden />Enlarge screenshot</Button></div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-text-muted"><label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={markers} onChange={event => setMarkers(event.target.checked)} />Show button markers</label><a className="font-semibold text-violet-dark underline" href={screenshot.src} target="_blank" rel="noopener noreferrer">Open original image</a></div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Screenshot controls">{screenshot.hotspots.map((hotspot, i) => <Button key={hotspot.label} size="sm" aria-pressed={selected === i} variant={selected === i ? "primary" : "secondary"} onClick={() => setSelected(i)}>{i + 1}. {hotspot.label}</Button>)}</div>
      {active && <p className="mt-3 text-[14px] leading-relaxed" aria-live="polite"><strong>{active.label}: </strong>{active.description}</p>}
    </figcaption>
    <dialog ref={dialog} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(1400px,calc(100vw-2rem))] overflow-auto rounded-panel border border-line bg-white p-4 backdrop:bg-black/60" aria-label={screenshot.caption}>
      <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => dialog.current?.close()}><X size={15} aria-hidden />Close screenshot</Button></div>
      <Image unoptimized src={screenshot.src} alt={screenshot.alt} width={screenshot.width} height={screenshot.height} className="h-auto w-full" />
    </dialog>
  </figure>;
}

export function ScreenshotGallery({ screenshots, initialIndex = 0 }: { screenshots: GuideScreenshot[]; initialIndex?: number }) {
  const [index, setIndex] = useState(Math.min(initialIndex, screenshots.length - 1));
  const screenshot = screenshots[index];
  if (!screenshot) return null;
  return <section aria-label="Screenshots of the actual website">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-[22px] font-semibold tracking-tight">Find it on the screen.</h2><span className="text-[12px] text-text-muted">Actual interface · unedited captures</span></div>
    {screenshots.length > 1 && <div className="mb-4 flex flex-wrap gap-2" aria-label="Choose a screenshot">{screenshots.map((shot, i) => <Button key={shot.src} size="sm" variant={index === i ? "primary" : "secondary"} aria-pressed={index === i} onClick={() => setIndex(i)}>{shot.title ?? `Screen ${i + 1}`}</Button>)}</div>}
    <ScreenshotGuide key={screenshot.src} screenshot={screenshot} />
  </section>;
}
