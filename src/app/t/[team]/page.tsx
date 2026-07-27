"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, Clock3, FileUp, MapPin, Pencil, Play, Plus } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { LiveClock } from "@/components/live-clock";
import { parseEventCsv } from "@/lib/csv";
import { dateLabel, eventDuration, formatDuration } from "@/lib/format";
import { useWorkspace } from "@/lib/store";

export default function DashboardPage() {
  const params = useParams<{ team: string }>();
  const team = params.team;
  const { workspace, update } = useWorkspace(team);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const events = workspace?.events ?? [];
  const liveCount = events.filter((event) => event.status === "live").length;
  const totalMinutes = Math.round(events.reduce((sum, event) => sum + eventDuration(event), 0) / 60);

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseEventCsv(await file.text());
      update((current) => ({ ...current, events: [...imported, ...current.events] }));
      setImportMessage(`${imported.length} event${imported.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "The CSV could not be imported.");
    } finally {
      event.target.value = "";
      window.setTimeout(() => setImportMessage(""), 5000);
    }
  }

  return (
    <main className="app-shell">
      <AppHeader team={team} />
      <section className="dashboard">
        <div className="page-heading">
          <div>
            <div className="heading-clock">
              <h1>Good afternoon.</h1>
              <LiveClock compact />
            </div>
            <p>Plan the room, keep the pace, and let everyone see what matters.</p>
          </div>
          <div className="button-row">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={importCsv}
            />
            <button className="secondary-button" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} />
              Import CSV
            </button>
            <Link className="primary-button" href={`/t/${team}/events/new`}>
              <Plus size={16} />
              New event
            </Link>
          </div>
        </div>
        {importMessage && <div className="import-message">{importMessage}</div>}

        <div className="stat-grid">
          <div className="stat-card">
            <span>Total events</span>
            <strong>{events.length}</strong>
          </div>
          <div className="stat-card">
            <span>Live now</span>
            <strong>{liveCount}</strong>
          </div>
          <div className="stat-card">
            <span>Time programmed</span>
            <strong>{totalMinutes} min</strong>
          </div>
        </div>

        <div className="section-heading">
          <h2>Your events</h2>
          <span className="event-count">{events.length} total</span>
        </div>

        {events.length ? (
          <div className="event-grid">
            {events.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-top">
                  <span className={`status-chip ${event.status}`}>
                    {event.status === "live" && <span className="live-dot" />}
                    {event.status}
                  </span>
                  <span className="event-count">{event.agenda.length} items</span>
                </div>
                <h3>{event.name}</h3>
                <p>{event.agenda.length} agenda items · {formatDuration(eventDuration(event))}</p>
                <div className="event-bottom">
                  <p>
                    <CalendarDays size={12} style={{ display: "inline", marginRight: 5 }} />
                    {dateLabel(event.date)}
                  </p>
                  <p>
                    <MapPin size={12} style={{ display: "inline", marginRight: 5 }} />
                    {event.location || "Location TBD"}
                  </p>
                </div>
                <div className="event-actions">
                  <Link className="secondary-button" href={`/t/${team}/events/${event.id}/edit`}>
                    <Pencil size={13} />
                    Edit
                  </Link>
                  <Link className="primary-button" href={`/t/${team}/events/${event.id}`}>
                    <Play size={13} fill="currentColor" />
                    {event.status === "completed" ? "Restart" : "Control"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <div>
              <Clock3 size={24} />
              <p>Your first perfectly timed event starts here.</p>
            </div>
          </div>
        )}
        <p className="csv-help">
          Need a starting format?{" "}
          <a href="/event-import-template.csv" download>
            Download the CSV template
          </a>
        </p>
      </section>
    </main>
  );
}
