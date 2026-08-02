"use client";

import {
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  Link2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Users,
  Video,
  Volume2,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TourStage = "prepare" | "run" | "share";

const tourStages = [
  {
    id: "prepare" as const,
    step: "01",
    eyebrow: "Prepare",
    title: "Build a run of show everyone can trust.",
    description:
      "Add individual speakers or multi-person panels, set durations, and reorder the agenda before the room goes live.",
  },
  {
    id: "run" as const,
    step: "02",
    eyebrow: "Run",
    title: "Keep the room moving without losing the plan.",
    description:
      "Start, pause, reset, skip, or adjust time from one calm control room. Projected finish updates as the programme changes.",
  },
  {
    id: "share" as const,
    step: "03",
    eyebrow: "Share",
    title: "Put the same clock everywhere it matters.",
    description:
      "Open the fullscreen audience display, invite another controller, or publish the countdown in a Zoom meeting.",
  },
];

const faqs = [
  {
    question: "Does the audience need an account?",
    answer:
      "No. The audience link is anonymous and read-only. Anyone with the link can open the synchronized display, but they cannot change the event.",
  },
  {
    question: "Can another person help control the event?",
    answer:
      "Yes. Create a reusable 24-hour invitation link from Event access. It signs the recipient into this event without revealing its password and can be revoked whenever you want.",
  },
  {
    question: "What happens if two controllers edit at once?",
    answer:
      "Every save carries an event version. If two edits conflict, Timer keeps both versions visible and asks which one to use instead of silently overwriting somebody's work.",
  },
  {
    question: "Does everyone in Zoom need to install Timer?",
    answer:
      "No. Only the operator opens the Timer Zoom App. Once the operator selects Sync to Zoom, the Dynamic Indicator is visible to everyone in that meeting.",
  },
  {
    question: "Will the timer survive a temporary network problem?",
    answer:
      "The controller keeps a local working copy and clearly shows its save state. Pending changes retry when connectivity returns, while audience displays keep deriving the countdown from its deadline.",
  },
];

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[620px]" aria-hidden>
      <div className="guide-glow absolute inset-[8%_12%] rounded-full bg-violet/25 blur-[70px]" />
      <div className="guide-float relative overflow-hidden rounded-[30px] border border-white/70 bg-white/74 p-3 shadow-[0_40px_110px_rgba(45,35,82,0.18)] backdrop-blur-2xl sm:p-4">
        <div className="rounded-[22px] border border-ink/8 bg-[#f8f8fa] p-3.5 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#ff6b67]" />
              <span className="size-2 rounded-full bg-[#f4bd4f]" />
              <span className="size-2 rounded-full bg-[#62c554]" />
            </div>
            <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold text-success">
              Live · synced
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[0.86fr_1.14fr]">
            <div className="rounded-[18px] border border-ink/8 bg-white p-4 shadow-[0_12px_35px_rgba(24,20,40,0.06)]">
              <div className="mb-4 flex items-center justify-between text-[10px] font-bold tracking-[0.1em] text-text-subtle uppercase">
                <span>Now speaking</span>
                <span>2 of 5</span>
              </div>
              <p className="text-[15px] font-semibold tracking-[-0.025em]">Avery Chen</p>
              <div className="mt-3 rounded-[14px] border border-success/20 bg-success-soft p-4 text-center">
                <span className="text-[10px] font-bold tracking-[0.12em] text-success uppercase">
                  Running
                </span>
                <p className="tabular mt-1 font-mono text-[clamp(2rem,7vw,3.5rem)] leading-none font-semibold tracking-[-0.08em] text-success">
                  09:48
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-success/12">
                  <span className="guide-timer-bar block h-full w-[62%] rounded-full bg-success" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {[
                  ["−15s", null],
                  ["Pause", Pause],
                  ["+15s", null],
                ].map(([label, Icon]) => (
                  <span
                    key={String(label)}
                    className="flex h-8 items-center justify-center gap-1 rounded-[9px] bg-surface-sunken text-[10px] font-semibold text-text-muted"
                  >
                    {Icon && <Icon size={10} fill="currentColor" />}
                    {String(label)}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-ink/8 bg-white p-4 shadow-[0_12px_35px_rgba(24,20,40,0.06)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold tracking-[-0.025em]">Up next</p>
                  <p className="text-[10px] text-text-subtle">3 remaining</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2 py-1 text-[9px] font-bold text-violet-dark">
                  <Save size={9} /> Saved
                </span>
              </div>
              <div className="grid gap-2">
                {["Product story", "Customer panel", "Closing remarks"].map(
                  (name, index) => (
                    <div
                      key={name}
                      className={cn(
                        "flex items-center justify-between rounded-[12px] border px-3 py-3",
                        index === 0
                          ? "border-violet/25 bg-violet-soft/45"
                          : "border-line bg-surface-raised",
                      )}
                    >
                      <span>
                        <span className="block text-[11px] font-semibold text-ink">{name}</span>
                        <span className="mt-0.5 block text-[9px] text-text-subtle">
                          {index === 1 ? "3 speakers · 25 min" : `${8 - index} min`}
                        </span>
                      </span>
                      <ChevronRight size={12} className="text-text-subtle" />
                    </div>
                  ),
                )}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-[12px] bg-[#17171c] px-3 py-2.5 text-white">
                <span className="text-[9px] font-semibold text-white/58">Projected finish</span>
                <span className="tabular text-[13px] font-semibold">5:42 PM</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="guide-float-delayed absolute -right-2 -bottom-7 flex items-center gap-2 rounded-full border border-white/70 bg-[#242429] py-2 pr-2.5 pl-2 text-white shadow-[0_18px_45px_rgba(24,20,40,0.25)] sm:right-[-6%]">
        <span className="grid size-7 place-items-center rounded-[8px] bg-[#1477ed]">
          <Clock3 size={14} />
        </span>
        <span className="tabular font-mono text-[13px] font-semibold">09:48</span>
        <ChevronRight size={12} className="text-white/55" />
      </div>
    </div>
  );
}

function StagePreview({ stage }: { stage: TourStage }) {
  return (
    <div
      key={stage}
      className="guide-stage-enter min-h-[450px] overflow-hidden rounded-[26px] border border-ink/8 bg-white p-3 shadow-[0_25px_80px_rgba(31,25,55,0.1)] sm:p-5"
    >
      {stage === "prepare" && (
        <div className="h-full rounded-[19px] bg-[#f7f7fa] p-4 sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold tracking-[0.12em] text-violet uppercase">
                Event builder
              </span>
              <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.045em]">Friday showcase</h3>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-text-muted shadow-sm">
              42 min total
            </span>
          </div>
          <div className="grid gap-2.5">
            <div className="rounded-[15px] border border-violet/25 bg-white p-3.5 shadow-[0_8px_25px_rgba(42,30,84,0.06)]">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-violet-soft text-[11px] font-bold text-violet-dark">1</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold">Opening story · Avery Chen</span>
                  <span className="text-[10px] text-text-subtle">Single speaker</span>
                </span>
                <span className="tabular text-[11px] font-semibold">10 min</span>
              </div>
            </div>
            <div className="rounded-[15px] border border-line bg-white p-3.5">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-sunken text-[11px] font-bold text-text-muted">2</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    Customer panel
                    <span className="rounded-full bg-violet-soft px-1.5 py-0.5 text-[8px] font-bold text-violet-dark">PANEL</span>
                  </span>
                  <span className="mt-2 grid gap-1.5">
                    {["Mina · 8 min", "Theo · 8 min", "Sam · 8 min"].map((speaker) => (
                      <span key={speaker} className="rounded-[8px] bg-surface-sunken px-2.5 py-1.5 text-[9px] text-text-muted">
                        {speaker}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="tabular text-[11px] font-semibold">24 min</span>
              </div>
            </div>
            <div className="rounded-[15px] border border-dashed border-violet/25 bg-violet-soft/30 py-3 text-center text-[11px] font-semibold text-violet-dark">
              + Add speaker or panel
            </div>
          </div>
        </div>
      )}

      {stage === "run" && (
        <div className="h-full rounded-[19px] bg-[#f7f7fa] p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold tracking-[0.12em] text-success uppercase">Live control room</span>
              <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.045em]">Customer panel</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1.5 text-[10px] font-bold text-success">
              <Wifi size={10} /> Up to date
            </span>
          </div>
          <div className="rounded-[18px] border border-success/20 bg-success-soft p-5 text-center">
            <span className="text-[10px] font-bold tracking-[0.12em] text-success uppercase">Now speaking · Mina</span>
            <p className="tabular mt-2 font-mono text-[clamp(3.5rem,11vw,6rem)] leading-none font-semibold tracking-[-0.09em] text-success">07:36</p>
            <div className="mx-auto mt-4 h-1.5 max-w-[320px] overflow-hidden rounded-full bg-success/12">
              <span className="block h-full w-[72%] rounded-full bg-success" />
            </div>
            <span className="mt-4 inline-flex h-9 items-center gap-2 rounded-[10px] bg-violet px-5 text-[11px] font-semibold text-white">
              <Pause size={12} fill="currentColor" /> Pause timer
            </span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {["−1m", "−15s", "Reset", "+15s", "+1m"].map((label) => (
              <span key={label} className="flex h-9 items-center justify-center rounded-[10px] border border-line bg-white text-[10px] font-semibold text-text-muted">
                {label === "Reset" && <RotateCcw size={10} className="mr-1" />}
                {label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[14px] border border-line bg-white px-4 py-3">
            <span>
              <span className="block text-[9px] font-bold tracking-[0.1em] text-text-subtle uppercase">Projected finish</span>
              <span className="text-[10px] text-text-muted">18 min of programme left</span>
            </span>
            <span className="tabular text-[18px] font-semibold tracking-[-0.04em]">5:42 PM</span>
          </div>
        </div>
      )}

      {stage === "share" && (
        <div className="relative flex h-full min-h-[410px] items-center justify-center overflow-hidden rounded-[19px] bg-[#0c0c10] p-4 text-white sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(119,87,237,0.24),transparent_37%)]" />
          <div className="relative text-center">
            <span className="text-[10px] font-bold tracking-[0.14em] text-[#9b83f5] uppercase">Now speaking</span>
            <h3 className="mt-3 text-[clamp(1.6rem,5vw,2.6rem)] font-semibold tracking-[-0.04em]">Avery Chen</h3>
            <p className="tabular mt-5 font-mono text-[clamp(4.5rem,15vw,8rem)] leading-none font-semibold tracking-[-0.1em] text-[#f8f7fc]">09:48</p>
            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[10px] text-white/65">
              <Volume2 size={11} /> Audience sound is local to this display
            </div>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full border border-[#ffb000] bg-[#242429] py-1.5 pr-2.5 pl-1.5 shadow-lg">
            <span className="grid size-6 place-items-center rounded-[7px] bg-[#1477ed]"><Clock3 size={12} /></span>
            <span className="tabular font-mono text-[11px] font-semibold">09:48</span>
          </div>
          <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between rounded-[13px] border border-white/10 bg-white/6 px-3 py-2.5 text-[9px] text-white/60 backdrop-blur-md">
            <span className="inline-flex items-center gap-1.5"><Monitor size={10} /> Fullscreen audience</span>
            <span className="inline-flex items-center gap-1.5"><Video size={10} /> Zoom synced</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductGuide() {
  const [stage, setStage] = useState<TourStage>("prepare");

  return (
    <main className="guide-page min-h-svh overflow-hidden bg-[#f8f8fa] text-ink" id="main">
      <a
        href="#guide-content"
        className="fixed top-2.5 left-2.5 z-[100] -translate-y-[160%] rounded-[10px] bg-violet-dark px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-transform duration-150 focus-visible:translate-y-0"
      >
        Skip to guide
      </a>

      <nav className="sticky top-0 z-50 border-b border-ink/7 bg-[rgba(248,248,250,0.82)] backdrop-blur-2xl backdrop-saturate-150" aria-label="Guide navigation">
        <div className="mx-auto flex h-[72px] w-[min(1180px,90vw)] items-center justify-between gap-4">
          <Link href="/" aria-label="Timer home"><BrandMark /></Link>
          <div className="hidden items-center gap-6 text-[12px] font-semibold text-text-muted md:flex">
            <a href="#workflow" className="transition-colors hover:text-violet-dark">Workflow</a>
            <a href="#surfaces" className="transition-colors hover:text-violet-dark">Experiences</a>
            <a href="#zoom" className="transition-colors hover:text-violet-dark">Zoom</a>
            <a href="#faq" className="transition-colors hover:text-violet-dark">FAQ</a>
          </div>
          <Button asChild variant="primary" size="sm">
            <Link href="/events/new">Create event <ArrowRight size={14} /></Link>
          </Button>
        </div>
      </nav>

      <div id="guide-content">
        <section className="relative isolate px-[5vw] pt-[clamp(5rem,10vw,8.5rem)] pb-[clamp(6rem,11vw,10rem)]">
          <div aria-hidden className="pointer-events-none absolute top-[-18%] left-[40%] -z-10 size-[52vw] rounded-full bg-[radial-gradient(circle,rgba(139,113,244,0.2),transparent_66%)] blur-2xl" />
          <div className="mx-auto grid w-[min(1180px,100%)] items-center gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <div className="max-w-[590px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet/15 bg-violet-soft/65 px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-violet-dark uppercase">
                <span className="guide-status-dot size-1.5 rounded-full bg-violet" /> Guided product tour
              </span>
              <h1
                aria-label="One clock. Every room."
                className="mt-6 text-[clamp(3.6rem,7.8vw,6.7rem)] leading-[0.88] font-semibold tracking-[-0.075em] text-[#151519]"
              >
                One clock.
                <br />
                <span className="text-violet">Every room.</span>
              </h1>
              <p className="mt-7 max-w-[540px] text-[clamp(1rem,1.7vw,1.25rem)] leading-[1.65] text-text-muted">
                Build the run of show, control every transition, and keep the audience and Zoom meeting perfectly in step.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="primary" className="h-12 px-5">
                  <a href="#workflow"><Play size={15} fill="currentColor" /> Start the tour</a>
                </Button>
                <Button asChild variant="secondary" className="h-12 px-5">
                  <Link href="/">Open Timer <ArrowRight size={15} /></Link>
                </Button>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-text-subtle">
                {["No user account", "Per-event access", "Audience stays read-only"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5"><Check size={12} className="text-success" />{item}</span>
                ))}
              </div>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section className="border-y border-ink/7 bg-white px-[5vw] py-6">
          <div className="mx-auto grid w-[min(1080px,100%)] gap-5 sm:grid-cols-3">
            {[
              [Users, "For the operator", "A focused live control room"],
              [Monitor, "For the audience", "A fullscreen synchronized clock"],
              [Video, "For the meeting", "A native Zoom indicator"],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="flex items-center gap-3 sm:justify-center">
                <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-violet-soft text-violet-dark"><Icon size={15} /></span>
                <span><strong className="block text-[12px]">{String(title)}</strong><span className="text-[10px] text-text-subtle">{String(text)}</span></span>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 px-[5vw] py-[clamp(6rem,11vw,10rem)]">
          <div className="mx-auto w-[min(1180px,100%)]">
            <div className="mb-12 max-w-[700px]">
              <span className="text-[11px] font-bold tracking-[0.12em] text-violet uppercase">The core workflow</span>
              <h2 className="mt-3 text-[clamp(2.6rem,5.3vw,4.8rem)] leading-[0.98] font-semibold tracking-[-0.065em]">From an empty agenda to a room in sync.</h2>
              <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-text-muted">Timer is organized around the way an event actually happens: prepare the plan, run it with confidence, then share only the views each person needs.</p>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
              <div className="grid gap-2" role="tablist" aria-label="Product tour stages">
                {tourStages.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-label={`${item.eyebrow}: ${item.title}`}
                    aria-selected={stage === item.id}
                    aria-controls="tour-stage-preview"
                    className={cn(
                      "group grid grid-cols-[2.5rem_minmax(0,1fr)_1.5rem] gap-3 rounded-[18px] border p-4 text-left transition-all duration-200",
                      stage === item.id
                        ? "border-violet/25 bg-white shadow-[0_14px_38px_rgba(40,30,78,0.08)]"
                        : "border-transparent hover:border-line hover:bg-white/55",
                    )}
                    onClick={() => setStage(item.id)}
                  >
                    <span className={cn("grid size-9 place-items-center rounded-[11px] text-[11px] font-bold", stage === item.id ? "bg-violet text-white" : "bg-surface-sunken text-text-subtle")}>{item.step}</span>
                    <span>
                      <span className="text-[10px] font-bold tracking-[0.1em] text-violet uppercase">{item.eyebrow}</span>
                      <span className="mt-1 block text-[17px] leading-snug font-semibold tracking-[-0.03em]">{item.title}</span>
                      <span className={cn("mt-2 block overflow-hidden text-[12px] leading-relaxed text-text-muted transition-all", stage === item.id ? "max-h-24 opacity-100" : "max-h-0 opacity-0 lg:group-hover:max-h-24 lg:group-hover:opacity-100")}>{item.description}</span>
                    </span>
                    <ChevronRight size={16} className={cn("mt-2 transition-transform", stage === item.id ? "translate-x-1 text-violet" : "text-text-subtle")} />
                  </button>
                ))}
              </div>
              <div id="tour-stage-preview" role="tabpanel"><StagePreview stage={stage} /></div>
            </div>
          </div>
        </section>

        <section id="surfaces" className="scroll-mt-24 bg-[#15151a] px-[5vw] py-[clamp(6rem,11vw,10rem)] text-white">
          <div className="mx-auto w-[min(1180px,100%)]">
            <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <div>
                <span className="text-[11px] font-bold tracking-[0.12em] text-[#9b83f5] uppercase">Three experiences</span>
                <h2 className="mt-3 text-[clamp(2.8rem,5.5vw,5rem)] leading-[0.95] font-semibold tracking-[-0.065em]">Everyone sees exactly what they need.</h2>
              </div>
              <p className="max-w-[560px] text-[14px] leading-relaxed text-white/55 lg:justify-self-end">The controller can change the event. The audience receives a clean read-only display. Zoom participants see the shared countdown without opening another window.</p>
            </div>

            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {[
                { icon: Users, number: "01", title: "Event controller", copy: "Run the clock, edit what is coming next, share access, and watch every save reach the cloud.", chips: ["Start · pause · reset", "Draft and save", "Projected finish"] },
                { icon: Monitor, number: "02", title: "Audience display", copy: "A high-contrast fullscreen countdown with local alarm choice and a clear overtime state.", chips: ["Anonymous link", "Read-only", "Local sound"] },
                { icon: Video, number: "03", title: "Zoom indicator", copy: "Pair the event in a meeting and publish the live speaker countdown to every participant.", chips: ["Operator installs", "Meeting-wide", "Opt-in sharing"] },
              ].map((item, index) => (
                <article key={item.title} className={cn("group relative overflow-hidden rounded-[24px] border border-white/10 p-6 transition-transform duration-200 hover:-translate-y-1", index === 1 ? "bg-[linear-gradient(145deg,rgba(119,87,237,0.24),rgba(255,255,255,0.04))]" : "bg-white/[0.04]")}> 
                  <div className="absolute top-0 right-0 p-5 font-mono text-[11px] text-white/25">{item.number}</div>
                  <span className="grid size-11 place-items-center rounded-[14px] border border-white/10 bg-white/[0.07] text-[#b5a5fa]"><item.icon size={18} /></span>
                  <h3 className="mt-8 text-[22px] font-semibold tracking-[-0.04em]">{item.title}</h3>
                  <p className="mt-3 min-h-[66px] text-[12px] leading-relaxed text-white/55">{item.copy}</p>
                  <div className="mt-8 flex flex-wrap gap-2">{item.chips.map((chip) => <span key={chip} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[9px] font-semibold text-white/62">{chip}</span>)}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-[5vw] py-[clamp(6rem,11vw,10rem)]">
          <div className="mx-auto w-[min(1180px,100%)]">
            <div className="text-center">
              <span className="text-[11px] font-bold tracking-[0.12em] text-violet uppercase">Built for live work</span>
              <h2 className="mx-auto mt-3 max-w-[760px] text-[clamp(2.6rem,5.2vw,4.7rem)] leading-[0.98] font-semibold tracking-[-0.065em]">Powerful when needed. Quiet when it matters.</h2>
            </div>
            <div className="mt-14 grid auto-rows-[minmax(190px,auto)] gap-4 md:grid-cols-2 lg:grid-cols-3">
              <article className="rounded-[24px] border border-line bg-white p-6 lg:col-span-2">
                <div className="flex items-start justify-between gap-4"><span className="grid size-10 place-items-center rounded-[13px] bg-violet-soft text-violet-dark"><Clock3 size={17} /></span><span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[9px] font-bold text-text-subtle">LIVE</span></div>
                <h3 className="mt-10 text-[23px] font-semibold tracking-[-0.04em]">Control the clock without interrupting the room.</h3>
                <p className="mt-3 max-w-[560px] text-[12px] leading-relaxed text-text-muted">Start, pause, reset, skip, and make precise time adjustments. The projected finish moves with every decision, so the operator always knows where the programme is heading.</p>
              </article>
              <article className="rounded-[24px] border border-line bg-[linear-gradient(145deg,#7757ed,#5d3fd2)] p-6 text-white">
                <Save size={19} />
                <h3 className="mt-12 text-[22px] font-semibold tracking-[-0.04em]">Edit safely during the show.</h3>
                <p className="mt-3 text-[12px] leading-relaxed text-white/68">Upcoming changes stay in draft until Save Changes. Undo them instantly, and navigation pauses until the decision is resolved.</p>
              </article>
              <article className="rounded-[24px] border border-line bg-white p-6">
                <ShieldCheck size={19} className="text-success" />
                <h3 className="mt-12 text-[22px] font-semibold tracking-[-0.04em]">Conflicts stay visible.</h3>
                <p className="mt-3 text-[12px] leading-relaxed text-text-muted">When two controllers edit at once, Timer asks which version to keep. Nothing is silently overwritten.</p>
              </article>
              <article className="rounded-[24px] border border-line bg-white p-6 lg:col-span-2">
                <div className="flex items-center gap-2 text-success"><Wifi size={18} /><span className="text-[10px] font-bold tracking-[0.1em] uppercase">Cloud + local resilience</span></div>
                <h3 className="mt-10 text-[23px] font-semibold tracking-[-0.04em]">A weak connection does not erase the plan.</h3>
                <p className="mt-3 max-w-[570px] text-[12px] leading-relaxed text-text-muted">The controller keeps a local working copy, clearly reports its save state, and retries pending changes when the connection returns.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="zoom" className="scroll-mt-24 border-y border-line bg-white px-[5vw] py-[clamp(6rem,11vw,10rem)]">
          <div className="mx-auto grid w-[min(1120px,100%)] items-center gap-14 lg:grid-cols-2">
            <div aria-hidden className="relative mx-auto w-full max-w-[500px] rounded-[28px] bg-[#26262b] p-4 shadow-[0_35px_90px_rgba(27,24,40,0.22)]">
              <div className="mb-4 flex items-center justify-between text-white"><span className="text-[13px] font-semibold">Zoom meeting</span><span className="flex gap-1"><i className="size-1 rounded-full bg-white/30" /><i className="size-1 rounded-full bg-white/30" /><i className="size-1 rounded-full bg-white/30" /></span></div>
              <div className="rounded-[19px] bg-white p-5">
                <div className="flex items-center justify-between"><BrandMark /><span className="rounded-full bg-success-soft px-2.5 py-1 text-[9px] font-bold text-success">In meeting</span></div>
                <div className="mt-5 rounded-[15px] border border-line bg-surface-sunken p-4"><span className="text-[9px] font-bold tracking-[0.1em] text-text-subtle uppercase">Timer</span><p className="mt-2 text-[14px] font-semibold">Friday showcase</p><p className="mt-1 text-[10px] text-text-muted">Connected · X7R4Q–Y90H9</p></div>
                <span className="mt-3 block w-full rounded-[12px] bg-violet py-3 text-center text-[11px] font-semibold text-white">Sync to Zoom</span>
              </div>
              <div className="guide-float-delayed absolute -top-6 right-6 flex items-center gap-2 rounded-full border border-[#ffb000] bg-[#242429] py-2 pr-3 pl-2 text-white shadow-xl"><span className="grid size-7 place-items-center rounded-[8px] bg-[#1477ed]"><Clock3 size={14} /></span><span className="tabular font-mono text-[13px] font-semibold">00:28</span><ChevronRight size={12} /></div>
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-[0.12em] text-violet uppercase">Zoom integration</span>
              <h2 className="mt-3 text-[clamp(2.7rem,5vw,4.7rem)] leading-[0.96] font-semibold tracking-[-0.065em]">The countdown joins the meeting.</h2>
              <p className="mt-5 max-w-[540px] text-[14px] leading-relaxed text-text-muted">Only the operator opens Timer. Once sharing is enabled, everyone sees the Dynamic Indicator—including its neutral, yellow, red, and overtime states.</p>
              <ol className="mt-8 grid gap-3">
                {["Create a Zoom code in the live control room.", "Open Timer inside the Zoom meeting.", "Enter the code to connect the event.", "Select Sync to Zoom when you are ready to publish."].map((item, index) => (
                  <li key={item} className="flex items-center gap-3 rounded-[14px] border border-line bg-[#fafafd] px-3.5 py-3"><span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-violet-soft text-[10px] font-bold text-violet-dark">{index + 1}</span><span className="text-[12px] font-medium text-text-muted">{item}</span></li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="px-[5vw] py-[clamp(6rem,11vw,10rem)]">
          <div className="mx-auto grid w-[min(1100px,100%)] items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <span className="text-[11px] font-bold tracking-[0.12em] text-violet uppercase">Share control responsibly</span>
              <h2 className="mt-3 text-[clamp(2.7rem,5vw,4.7rem)] leading-[0.96] font-semibold tracking-[-0.065em]">An event is its own secure workspace.</h2>
              <p className="mt-5 max-w-[570px] text-[14px] leading-relaxed text-text-muted">There are no teams or user directories to manage. Each event has its own login and password, while temporary invitation links make it easy to bring another controller into the room.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {["Audience links can never edit", "Invitations expire after 24 hours", "Sessions are remembered per device", "Invitation access can be revoked"].map((item) => <span key={item} className="flex items-center gap-2 text-[11px] font-semibold text-text-muted"><Check size={13} className="text-success" />{item}</span>)}
              </div>
            </div>
            <div className="rounded-[26px] border border-line bg-white p-5 shadow-[0_25px_70px_rgba(35,28,65,0.1)]">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] bg-violet-soft text-violet-dark"><ShieldCheck size={17} /></span><span><strong className="block text-[13px]">Event access</strong><span className="text-[10px] text-text-subtle">Friday showcase</span></span></div>
              <div className="mt-5 rounded-[14px] bg-surface-sunken p-3.5"><span className="text-[9px] font-bold tracking-[0.1em] text-text-subtle uppercase">Controller invitation</span><div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5"><span className="truncate font-mono text-[9px] text-text-muted">timer.app/invite/7nh4…</span><Link2 size={13} className="shrink-0 text-violet" /></div><span className="mt-2 block text-[9px] text-text-subtle">Reusable · expires in 23h 58m</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><span className="rounded-[11px] bg-violet py-2.5 text-center text-[10px] font-semibold text-white">Copy link</span><span className="rounded-[11px] border border-line py-2.5 text-center text-[10px] font-semibold text-text-muted">Revoke</span></div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 bg-white px-[5vw] py-[clamp(6rem,10vw,9rem)]">
          <div className="mx-auto grid w-[min(1050px,100%)] gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div><span className="text-[11px] font-bold tracking-[0.12em] text-violet uppercase">Good to know</span><h2 className="mt-3 text-[clamp(2.7rem,5vw,4.6rem)] leading-[0.96] font-semibold tracking-[-0.065em]">A few common questions.</h2></div>
            <div className="divide-y divide-line border-y border-line">
              {faqs.map((item) => (
                <details key={item.question} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[14px] font-semibold tracking-[-0.02em] marker:hidden"><span>{item.question}</span><span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-subtle transition-transform group-open:rotate-90"><ChevronRight size={13} /></span></summary>
                  <p className="max-w-[650px] pb-5 text-[12px] leading-relaxed text-text-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-[#15151a] px-[5vw] py-[clamp(6rem,10vw,9rem)] text-center text-white">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_110%,rgba(119,87,237,0.42),transparent_45%)]" />
          <div className="mx-auto max-w-[760px]">
            <BellRing size={24} className="mx-auto text-[#a995ff]" />
            <h2 className="mt-6 text-[clamp(3rem,6.5vw,5.8rem)] leading-[0.92] font-semibold tracking-[-0.07em]">Ready when the room is.</h2>
            <p className="mx-auto mt-5 max-w-[520px] text-[14px] leading-relaxed text-white/55">Create the event, share the right view, and let every screen follow one authoritative clock.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3"><Button asChild variant="primary" className="h-12 px-6"><Link href="/events/new">Create an event <ArrowRight size={15} /></Link></Button><Button asChild className="h-12 border-white/15 bg-white/7 px-6 text-white hover:bg-white/12 hover:text-white"><Link href="/">Open an event</Link></Button></div>
          </div>
        </section>
      </div>

      <footer className="border-t border-line bg-white px-[5vw]">
        <div className="mx-auto flex min-h-[88px] w-[min(1180px,100%)] flex-wrap items-center justify-between gap-4 py-5"><Link href="/"><BrandMark /></Link><span className="text-[11px] text-text-subtle">Every moment, perfectly timed.</span></div>
      </footer>
    </main>
  );
}
