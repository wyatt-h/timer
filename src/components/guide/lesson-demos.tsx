"use client";

import { useState } from "react";
import { Check, Copy, Link2, Monitor, RadioTower, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareDemo() {
  const [choice, setChoice] = useState<"speaker" | "invite" | "login">("speaker");
  const [copied, setCopied] = useState(false);
  const choices = {
    speaker: { label: "Speaker link", icon: Monitor, title: "A read-only countdown", action: "Copy speaker link", result: "The recipient opens the display without a password. They can watch the timer, but cannot edit or control the event.", location: "Control-room header → copy icon beside Speaker view" },
    invite: { label: "Controller invitation", icon: Link2, title: "Access to run the event", action: "Create invitation link", result: "The recipient can control this event. The invitation can be reused for 24 hours; a replacement revokes the previous link.", location: "Event access → Create invitation link" },
    login: { label: "Login details", icon: Copy, title: "Reusable controller credentials", action: "Copy login details", result: "The message contains the event login name and password. Its recipient can open and control the event.", location: "Event access → Copy login details" },
  };
  const current = choices[choice];
  return <section aria-label="Explore sharing options" className="rounded-panel border border-line bg-white p-5 sm:p-6">
    <span className="text-[12px] font-semibold tracking-wide text-violet-dark uppercase">Try it · sharing example</span>
    <h2 className="mt-2 text-[22px] font-semibold tracking-tight">Who needs access?</h2>
    <div className="my-5 flex flex-wrap gap-2" aria-label="Access type">{(Object.keys(choices) as (keyof typeof choices)[]).map(key => { const Icon = choices[key].icon; return <Button key={key} size="sm" aria-pressed={choice === key} variant={choice === key ? "primary" : "secondary"} onClick={() => { setChoice(key); setCopied(false); }}><Icon size={14} aria-hidden />{choices[key].label}</Button>; })}</div>
    <div className="rounded-field bg-surface-sunken p-5"><p className="text-[12px] text-text-subtle">{current.location}</p><h3 className="mt-2 text-[18px] font-semibold">{current.title}</h3><Button className="mt-4" onClick={() => setCopied(true)}>{copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}{copied ? "Example ready" : current.action}</Button><p role="status" className="mt-4 text-[14px] leading-relaxed text-text-muted">{copied ? current.result : "Select the action to see what access the recipient would receive."}</p></div>
    <p className="mt-4 text-[12px] text-text-subtle">Simulation only. No link, invitation, or credentials are created or copied.</p>
  </section>;
}

export function ZoomDemo() {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [running, setRunning] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");
  return <section aria-label="Zoom pairing practice" className="rounded-panel border border-line bg-white p-5 sm:p-6">
    <span className="text-[12px] font-semibold tracking-wide text-violet-dark uppercase">Try it · simulated Zoom connection</span>
    <h2 className="mt-2 text-[22px] font-semibold tracking-tight">Connected is only the first step.</h2>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <div className="rounded-field border border-line bg-surface-sunken p-4"><h3 className="flex items-center gap-2 text-[14px] font-semibold"><Monitor size={16} aria-hidden />Your control room</h3><p className="mt-4 text-[12px] text-text-subtle">Zoom code · example only</p><p className="mt-1 font-mono text-[20px]">DEMO-CODE</p><Button className="mt-3" size="sm" onClick={() => setCopied(true)}><Copy size={14} aria-hidden />{copied ? "Sample code selected" : "Copy Zoom code"}</Button><Button className="mt-3" size="sm" variant={running ? "secondary" : "primary"} onClick={() => { if (!running && connected && sharing) setPublished(true); setRunning(value => !value); }}>{running ? "Pause timer" : "Start timer"}</Button></div>
      <div className="rounded-field border border-line p-4"><h3 className="flex items-center gap-2 text-[14px] font-semibold"><Video size={16} aria-hidden />Timer inside Zoom</h3>{!connected ? <><label className="mt-4 block text-[12px] font-semibold" htmlFor="demo-zoom-code">Zoom code</label><input id="demo-zoom-code" value={code} onChange={e => setCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-control border border-line px-3 text-[16px]" placeholder="DEMO-CODE" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!copied} onClick={() => { setCode("DEMO-CODE"); setError(""); }}>Paste sample code</Button><Button size="sm" variant="primary" onClick={() => { if (code.trim().toUpperCase() !== "DEMO-CODE") { setError("Use DEMO-CODE for this example."); return; } setError(""); setConnected(true); }}>Connect</Button></div>{error && <p role="alert" className="mt-2 text-[12px] text-over">{error}</p>}</> : <><p className="mt-4 text-[14px] font-semibold">Friday showcase · connected</p><Button className="mt-3" size="sm" variant={sharing ? "secondary" : "primary"} onClick={() => { setPublished(!sharing && running); setSharing(value => !value); }}><RadioTower size={14} aria-hidden />{sharing ? published ? "Stop sharing timer" : "Cancel sharing" : "Sync to Zoom"}</Button><Button className="mt-3" size="sm" variant="ghost" onClick={() => { setConnected(false); setSharing(false); setPublished(false); }}>Disconnect</Button></>}</div>
    </div>
    <div aria-live="polite" className="mt-4 rounded-field bg-violet-soft p-4"><p className="text-[12px] font-semibold text-violet-dark">MEETING PREVIEW</p>{connected && sharing && published ? <><p className="mt-2 font-mono text-[32px]">05:00</p><p className="text-[13px]">{running ? "The meeting can see the timer. In a real meeting, it counts down with your event." : "The paused countdown remains visible. Resume from the control room when ready."}</p></> : <p className="mt-2 text-[14px]">{sharing ? "Waiting for the timer to start. Select Start timer in the control room." : connected ? "Connected, but nothing is shared with the meeting. Select Sync to Zoom." : "No timer is shared. Connect the sample event first."}</p>}</div>
    <p className="mt-4 text-[12px] text-text-subtle">This example does not contact Zoom. The preview illustrates visibility; it is not a screenshot of the Zoom client.</p>
  </section>;
}
