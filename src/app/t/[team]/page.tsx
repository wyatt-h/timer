"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  FileUp,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImportDialog } from "@/components/import-dialog";
import { LiveClock } from "@/components/live-clock";
import { dateLabel, eventDuration, formatDuration } from "@/lib/format";
import { useWorkspace } from "@/lib/store";
import type { TimerEvent } from "@/lib/types";

const STATUS_ORDER = { live: 0, draft: 1, completed: 2 } as const;

export default function DashboardPage() {
  const params = useParams<{ team: string }>();
  const team = params.team;
  const { workspace, update } = useWorkspace(team);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const events = useMemo(() => workspace?.events ?? [], [workspace]);

  /** Live events first — during a show that is the only card that matters. */
  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events
      .filter((event) => !needle || event.name.toLowerCase().includes(needle))
      .sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt,
      );
  }, [events, query]);

  const deleteTarget = events.find((event) => event.id === pendingDelete);

  function commitImport(imported: TimerEvent[]) {
    update((current) => ({ ...current, events: [...imported, ...current.events] }));
    setNotice({
      tone: "success",
      text: `${imported.length} event${imported.length === 1 ? "" : "s"} imported.`,
    });
    window.setTimeout(() => setNotice(null), 6000);
  }

  function deleteEvent(eventId: string) {
    setPendingDelete(null);
    update((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== eventId),
    }));
    setNotice({ tone: "success", text: "Event deleted." });
    window.setTimeout(() => setNotice(null), 5000);
  }

  return (
    <main className="min-h-svh bg-paper" id="main">
      <AppHeader team={team} />
      <section className="mx-auto w-[min(1180px,calc(100%-2.5rem))] pt-9 pb-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-[clamp(2rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.05em]">Events</h1>
            <LiveClock compact />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <FileUp size={15} aria-hidden />
              Import CSV
            </Button>
            <Button asChild variant="primary"><Link href={`/t/${team}/events/new`}>
              <Plus size={16} aria-hidden />
              New event
            </Link></Button>
          </div>
        </div>

        <div aria-live="polite">
          {notice && <div className={cn("mb-7 rounded-control border px-3.5 py-2.5 text-[13px]", notice.tone === "success" ? "border-success/20 bg-success-soft text-success" : "border-over/20 bg-over-soft text-over")}>{notice.text}</div>}
        </div>

        {events.length > 3 && (
          <div className="mb-4 flex items-center justify-end">
            <Input
              className="material-outlined-field--search"
              type="search"
              label="Search events"
              value={query}
              placeholder="Search events"
              aria-label="Search events by name"
              onValueChange={setQuery}
            >
              <Search slot="leading-icon" size={17} aria-hidden />
            </Input>
          </div>
        )}

        {!events.length ? (
          <div className="grid min-h-[230px] place-items-center rounded-panel border border-dashed border-ink/14 text-center text-text-subtle">
            <div>
              <Clock3 size={26} aria-hidden />
              <h2 className="mt-3.5 text-[17px] font-semibold text-ink">No events yet</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="primary"><Link href={`/t/${team}/events/new`}>
                  <Plus size={15} />
                  New event
                </Link></Button>
                <Button variant="secondary" onClick={() => setImporting(true)}>
                  <FileUp size={14} aria-hidden />
                  Import from CSV
                </Button>
              </div>
            </div>
          </div>
        ) : !visibleEvents.length ? (
          <div className="grid min-h-[230px] place-items-center rounded-panel border border-dashed border-ink/14 text-center text-text-subtle">
            <div>
              <Search size={22} aria-hidden />
              <p className="mt-3 mb-4 text-[13px]">
                No events match <strong className="font-semibold text-ink">{query}</strong>.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleEvents.map((event) => (
              <article key={event.id} className={cn("group flex min-h-[190px] flex-col rounded-card border border-line bg-white p-5 shadow-[0_1px_2px_rgba(24,20,40,0.04)] transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-violet/20 hover:shadow-[0_14px_34px_-12px_rgba(24,20,40,0.2)]", event.status === "live" && "border-success/30")}>
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold capitalize", event.status === "live" ? "bg-success-soft text-success" : event.status === "completed" ? "bg-violet-soft text-violet-dark" : "bg-surface-sunken text-text-muted")}>
                    {event.status === "live" && <span aria-hidden className="size-1.5 rounded-full bg-success" />}
                    {event.status}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-text-subtle">{event.agenda.length} items</span>
                    <button
                      className="grid size-9 place-items-center rounded-[9px] text-text-subtle/60 opacity-0 transition-colors duration-150 group-hover:opacity-100 hover:bg-surface-hover hover:text-over focus-visible:opacity-100 max-sm:opacity-100"
                      onClick={() => setPendingDelete(event.id)}
                      aria-label={`Delete ${event.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <h2 className="mt-5 text-[20px] font-semibold tracking-[-0.035em]">
                  <Link href={`/t/${team}/events/${event.id}`}>{event.name}</Link>
                </h2>
                <p className="mt-1.5 text-[13px] text-text-muted">{formatDuration(eventDuration(event))}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 text-[12px] text-text-subtle">
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarDays size={12} aria-hidden />
                    {dateLabel(event.date)}
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-line-soft pt-3.5">
                  <Button asChild variant="secondary" size="sm"><Link href={`/t/${team}/events/${event.id}/edit`}>
                    <Pencil size={13} aria-hidden />
                    Edit
                  </Link></Button>
                  <Button asChild variant="primary" size="sm"><Link href={`/t/${team}/events/${event.id}`}>
                    <Play size={13} fill="currentColor" />
                    {event.status === "completed"
                      ? "Restart"
                      : event.status === "live"
                        ? "Resume"
                        : "Control"}
                  </Link></Button>
                </div>
              </article>
            ))}
          </div>
        )}

      </section>

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImport={commitImport}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "this event"}?`}
        body="The run of show and its audience link are removed for everyone. This cannot be undone."
        confirmLabel="Delete event"
        onConfirm={() => pendingDelete && deleteEvent(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
