"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { BookOpen, HelpCircle, LocateFixed, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { helpTopics, type HelpContext, type HelpTopic } from "@/lib/guide";

export function ContextHelp({ context }: { context: HelpContext }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<HelpTopic | null>(null);
  const [notice, setNotice] = useState("");
  const [located, setLocated] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement>(null);
  const id = useId();

  function clearHighlight() {
    highlighted.current?.removeAttribute("data-help-highlight");
    highlighted.current = null;
  }

  function close() {
    clearHighlight();
    setOpen(false);
    setLocated(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      highlighted.current?.removeAttribute("data-help-highlight");
      highlighted.current = null;
      setOpen(false);
      setLocated(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      highlighted.current?.removeAttribute("data-help-highlight");
    };
  }, [open]);

  function locate(topic: HelpTopic) {
    clearHighlight();
    setLocated(false);
    const target = document.querySelector<HTMLElement>(`[data-help="${topic.target}"]`);
    if (!target) {
      setNotice("This control is not shown in the current view. Open the relevant section or leave Focus mode, then try again.");
      return;
    }
    let ancestor: HTMLElement | null = target;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    target.setAttribute("data-help-highlight", "true");
    target.scrollIntoView?.({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    highlighted.current = target;
    setLocated(true);
    setNotice("The control is outlined in purple. Using it will affect this event.");
  }

  return <>
    <Button ref={trigger} size="sm" aria-expanded={open} aria-controls={id} onClick={() => open ? close() : setOpen(true)}>
      <HelpCircle size={15} aria-hidden /> Help
    </Button>
    {open && createPortal(<aside ref={panel} id={id} aria-label="Page help" className="fixed right-3 bottom-3 z-50 max-h-[min(540px,70dvh)] w-[min(370px,calc(100vw-1.5rem))] overflow-y-auto rounded-panel border border-violet/25 bg-white p-4 text-ink shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-[16px] font-semibold">Help with this screen</h2><Button size="iconSm" variant="ghost" aria-label="Close help" onClick={close}><X size={16} /></Button></div>
      {located && selected ? <div className="grid gap-2">
        <h3 className="text-[13px] font-semibold">{selected.label}</h3>
        <p role="status" className="text-[12px] text-text-muted">{notice}</p>
        <Button size="sm" onClick={() => { clearHighlight(); setLocated(false); setNotice(""); }}>Back to instructions</Button>
      </div> : selected ? <div className="grid gap-3">
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => { clearHighlight(); setSelected(null); setNotice(""); }}>All controls</Button>
        <h3 className="text-[15px] font-semibold">{selected.label}</h3>
        <p className="text-[13px] leading-relaxed text-text-muted">{selected.description}</p>
        {selected.target && <Button onClick={() => locate(selected)}><LocateFixed size={15} aria-hidden />Show me where</Button>}
        <p role="status" className="text-[12px] text-text-muted">{notice}</p>
        <Link className="text-[13px] font-semibold text-violet-dark underline" href={`/guide/${selected.lesson}`} target="_blank" rel="noopener noreferrer">Read the lesson in a new tab</Link>
      </div> : <div className="grid gap-1">
        {helpTopics.filter(topic => topic.context === context && topic.target).map(topic => <button key={topic.label} className="min-h-11 rounded-control px-3 py-2 text-left text-[13px] hover:bg-violet-soft" onClick={() => { setSelected(topic); setNotice(""); }}>{topic.label}</button>)}
      </div>}
      {!located && <Link className="mt-4 flex min-h-11 items-center gap-2 border-t border-line pt-3 text-[13px] font-semibold text-violet-dark" href="/guide" target="_blank" rel="noopener noreferrer"><BookOpen size={15} aria-hidden />All lessons & practice (new tab)</Link>}
    </aside>, document.body)}
  </>;
}
