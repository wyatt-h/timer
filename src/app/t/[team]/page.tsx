"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CalendarDays, Clock3, MapPin, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { dateLabel, eventDuration, formatDuration } from "@/lib/format";
import { useWorkspace } from "@/lib/store";

export default function DashboardPage() {
  const params = useParams<{ team: string }>();
  const team = params.team;
  const { workspace } = useWorkspace(team);
  const events = workspace?.events ?? [];
  const liveCount = events.filter((event) => event.status === "live").length;
  const totalMinutes = Math.round(events.reduce((sum, event) => sum + eventDuration(event), 0) / 60);

  return (
    <main className="app-shell">
      <AppHeader team={team} />
      <section className="dashboard">
        <div className="page-heading">
          <div>
            <h1>Good afternoon.</h1>
            <p>Plan the room, keep the pace, and let everyone see what matters.</p>
          </div>
          <Link className="primary-button" href={`/t/${team}/events/new`}>
            <Plus size={16} />
            New event
          </Link>
        </div>

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
              <Link className="event-card" href={`/t/${team}/events/${event.id}`} key={event.id}>
                <div className="event-top">
                  <span className={`status-chip ${event.status}`}>
                    {event.status === "live" && <span className="live-dot" />}
                    {event.status}
                  </span>
                  <ArrowRight size={16} color="#aaaab1" />
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
              </Link>
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
      </section>
    </main>
  );
}
