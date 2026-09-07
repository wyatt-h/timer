"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Play } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { lessons, type LessonId } from "@/lib/guide";
import { guideScreenshots } from "@/lib/guide-screenshots";
import { ScreenshotGallery } from "@/components/guide/screenshot-guide";
import { ShareDemo, ZoomDemo } from "@/components/guide/lesson-demos";

export function LessonPage({ lessonId }: { lessonId: LessonId }) {
  const lesson = lessons.find(item => item.id === lessonId)!;
  const [step, setStep] = useState(0);
  const [complete, setComplete] = useState(false);
  const current = lesson.steps[step];
  const next = lessons[lessons.indexOf(lesson) + 1];
  const practice = lesson.id === "build" || lesson.id === "create" ? "/guide/practice?mode=build" : "/guide/practice";

  return <main id="main" className="min-h-svh bg-paper"><AppHeader /><div className="mx-auto w-[min(1080px,calc(100%-2.5rem))] py-9 sm:py-12">
    <Link href="/guide" className="inline-flex items-center gap-2 text-[13px] font-semibold text-violet-dark"><ArrowLeft size={15} aria-hidden />All lessons</Link>
    <p className="mt-8 text-[12px] font-semibold tracking-widest text-violet-dark uppercase">{lesson.label} · {lesson.minutes}</p><h1 className="mt-3 text-[clamp(2.25rem,5vw,3.5rem)] leading-tight font-semibold tracking-[-0.05em]">{lesson.title}</h1><p className="mt-3 max-w-[700px] text-[16px] leading-relaxed text-text-muted">{lesson.description}</p>
    <div className="mt-9 grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Lesson steps" className="grid gap-1">{lesson.steps.map(([title], i) => <button key={title} aria-current={step === i ? "step" : undefined} className={`flex min-h-12 items-center gap-3 rounded-control px-3 py-3 text-left text-[13px] transition-colors ${step === i ? "bg-violet-soft font-semibold text-violet-dark" : "text-text-muted hover:bg-white"}`} onClick={() => { setStep(i); setComplete(false); }}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-current/20 text-[12px]">{i + 1}</span>{title}</button>)}</nav>
      <section aria-label="Current instruction" className="rounded-panel border border-line bg-white p-6 sm:p-8"><div aria-live="polite"><span className="text-[12px] font-semibold text-text-subtle">{complete ? "Lesson read" : `STEP ${step + 1} OF ${lesson.steps.length}`}</span><h2 className="mt-4 text-[25px] font-semibold tracking-tight">{complete ? "Try it for yourself." : current[0]}</h2><p className="mt-4 text-[15px] leading-7 text-text-muted">{complete ? "Replay any step, open the practice event, or continue to the next lesson. Help is available on the event screens whenever you need to find a control." : current[1]}</p></div>
        {lesson.id === "create" && step === 3 && <a className="mt-4 inline-block text-[14px] font-semibold text-violet-dark underline" href="/event-import-template.csv" download>Download the CSV template</a>}
        <div className="mt-8 flex flex-wrap justify-between gap-3"><Button size="sm" disabled={step === 0 && !complete} onClick={() => { if (complete) setComplete(false); else setStep(value => value - 1); }}><ArrowLeft size={14} aria-hidden />Back</Button>{!complete ? <Button size="sm" variant="primary" onClick={() => step < lesson.steps.length - 1 ? setStep(value => value + 1) : setComplete(true)}>{step === lesson.steps.length - 1 ? "Finish lesson" : "Next step"}{step === lesson.steps.length - 1 ? <Check size={14} aria-hidden /> : <ArrowRight size={14} aria-hidden />}</Button> : <Button size="sm" onClick={() => { setStep(0); setComplete(false); }}>Replay lesson</Button>}</div>
      </section>
    </div>
    <div className="mt-8">{lesson.id === "share" ? <ShareDemo /> : lesson.id === "zoom" ? <ZoomDemo /> : <section className="flex flex-wrap items-center justify-between gap-5 rounded-panel border border-violet/15 bg-violet-soft/60 p-6"><div><h2 className="text-[21px] font-semibold">{lesson.id === "run" ? "Feel what each button does." : "Build it. Then run it."}</h2><p className="mt-2 max-w-[580px] text-[14px] leading-relaxed text-text-muted">Use the actual {lesson.id === "run" ? "control room" : "agenda editor"} with sample data. Changes stay in the practice tab.</p></div><Button asChild variant="primary"><Link href={practice}><Play size={15} aria-hidden />Open practice event</Link></Button></section>}</div>
    {lesson.id === "run" && <Link className="mt-4 inline-block text-[14px] font-semibold text-violet-dark underline" href="/guide/practice?mode=panel">Practise independent speaker and panel clocks</Link>}
    <div className="mt-8"><ScreenshotGallery key={`${lesson.id}-${step}`} screenshots={guideScreenshots[lesson.id] ?? []} initialIndex={lesson.id === "create" ? [0, 1, 2, 3, 0][step] : lesson.id === "run" ? (step === 3 ? 1 : 0) : lesson.id === "zoom" ? (step === 0 ? 0 : 1) : 0} /></div>
    <details className="mt-8 border-y border-line py-4"><summary className="cursor-pointer text-[14px] font-semibold">Read the whole lesson</summary><ol className="mt-5 grid gap-5">{lesson.steps.map(([title, body]) => <li key={title}><h3 className="text-[15px] font-semibold">{title}</h3><p className="mt-1 text-[14px] leading-relaxed text-text-muted">{body}</p></li>)}</ol></details>
    <div className="mt-8 flex flex-wrap justify-between gap-3"><Link className="text-[14px] font-semibold text-violet-dark underline" href="/guide#button-reference">Find a button in the reference</Link>{next && <Link className="inline-flex items-center gap-2 text-[14px] font-semibold text-violet-dark" href={`/guide/${next.id}`}>Next: {next.title}<ArrowRight size={15} aria-hidden /></Link>}</div>
  </div></main>;
}
