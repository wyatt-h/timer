"use client";

import { ArrowRight, Clock3, FileUp, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "@/components/import-dialog";
import { ImportCredentialsPanel } from "@/components/event-access/import-credentials-panel";
import { OpenEventForm } from "@/components/event-access/open-event-form";
import { listRecentEvents, type RecentEvent } from "@/lib/event-auth/local-events";
import type { TimerEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * Two ways in, and deliberately no third.
 *
 * Creating an event asks for nothing up front — no team, no account, no name to
 * belong to. The event password is chosen in the builder, at
 * the point where there is an event for it to protect. Opening an existing event
 * needs its event name and password and nothing else.
 *
 * The list of events below comes from this browser's own localStorage. There is no
 * endpoint that returns a directory of events, so nothing here can enumerate
 * anybody else's, and an entry only opens if this device still holds a live session
 * for it.
 */

type Mode = "create" | "open";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<TimerEvent[] | null>(null);

  useEffect(() => {
    queueMicrotask(() => setRecent(listRecentEvents()));
  }, []);

  if (pendingImport) {
    return (
      <main className="min-h-svh bg-paper px-[5vw] py-12" id="main">
        <div className="mx-auto w-[min(560px,100%)]">
          <ImportCredentialsPanel
            events={pendingImport}
            onCancel={() => setPendingImport(null)}
            onFinished={(created) => {
              setPendingImport(null);
              setRecent(listRecentEvents());
              if (created.length === 1) router.push(`/events/${created[0].eventId}`);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[radial-gradient(circle_at_52%_40%,rgba(255,255,255,0.95),transparent_35%),linear-gradient(180deg,#fbfbfc_0%,#f5f4f8_100%)] px-[5vw]"
      id="main"
    >
      {/* A single soft wash. Two competing gradients read as decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[22vw] -right-[16vw] -z-10 size-[46vw] rounded-full bg-[radial-gradient(circle,rgba(159,134,255,0.2),transparent_68%)] blur-[14px]"
      />

      <nav className="flex h-[88px] w-full items-center" aria-label="Main navigation">
        <BrandMark />
      </nav>

      <section className="mx-auto flex w-[min(100%,620px)] flex-1 flex-col items-center justify-center pt-10 pb-18 text-center">
        <h1 className="mb-9 text-[clamp(3.25rem,7.2vw,5.5rem)] leading-[0.96] font-semibold tracking-[-0.065em] text-[#151519]">
          Every moment,
          <br />
          perfectly <span className="text-violet">timed.</span>
        </h1>

        <div
          className="mb-5 inline-flex rounded-full border border-ink/8 bg-white/70 p-1 backdrop-blur-xl"
          role="tablist"
          aria-label="Create or open an event"
        >
          {(["create", "open"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={mode === candidate}
              className={cn(
                "min-h-9 rounded-full px-4 text-[13px] font-semibold transition-colors duration-150",
                mode === candidate
                  ? "bg-violet text-white"
                  : "text-text-muted hover:text-violet-dark",
              )}
              onClick={() => setMode(candidate)}
            >
              {candidate === "create" ? "Create an event" : "Open an event"}
            </button>
          ))}
        </div>

        <div className="w-[min(100%,470px)]">
          {mode === "create" ? (
            <div className="grid gap-3 rounded-[22px] border border-ink/8 bg-white/80 p-[18px] text-left shadow-[0_22px_70px_rgba(31,26,50,0.08),inset_0_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl">
              <p className="text-[13px] leading-relaxed text-text-muted">
                Build the run of show, then choose a password for the event
                itself. No account, and nothing to sign up for.
              </p>
              <Button asChild variant="primary">
                <Link href="/events/new">
                  <Plus size={16} aria-hidden />
                  New event
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </Button>
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <FileUp size={14} aria-hidden />
                Import from CSV
              </Button>
            </div>
          ) : (
            <OpenEventForm onOpened={(payload) => router.push(`/events/${payload.event.id}`)} />
          )}

          {/*
            * Remembered on this device only, purely so an operator does not have
            * to type their credentials again on the machine running the show.
            */}
          {recent.length > 0 && (
            <section className="mt-5 text-left" aria-labelledby="recent-heading">
              <h2
                id="recent-heading"
                className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-bold tracking-[0.07em] text-text-subtle uppercase"
              >
                <Clock3 size={12} aria-hidden />
                On this device
              </h2>
              <ul className="grid gap-1.5">
                {recent.map((entry) => (
                  <li key={entry.eventId}>
                    <Link
                      href={`/events/${entry.eventId}`}
                      className="flex items-center justify-between gap-3 rounded-control border border-line bg-white/80 px-3.5 py-2.5 transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-violet/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {entry.name}
                        </span>
                      </span>
                      <ArrowRight size={15} aria-hidden className="shrink-0 text-text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </section>

      <footer className="flex min-h-[62px] w-full items-center text-[12px] text-text-subtle">
        <span>Timer</span>
      </footer>

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImport={(events) => setPendingImport(events)}
      />
    </main>
  );
}
