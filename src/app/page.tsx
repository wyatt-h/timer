"use client";

import { ArrowRight, Check, TimerReset } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuraMark } from "@/components/aura-mark";
import { ensureWorkspace, isValidTeamSlug, sanitizeTeamSlug } from "@/lib/store";

const features = ["Realtime audience display", "Built for every screen", "No viewer sign-in"];

export default function Home() {
  const router = useRouter();
  const [team, setTeam] = useState("");
  const [touched, setTouched] = useState(false);
  const [recentTeam, setRecentTeam] = useState<string | null>(null);
  const valid = isValidTeamSlug(team);

  useEffect(() => {
    queueMicrotask(() => setRecentTeam(window.localStorage.getItem("aura:last-team")));
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    ensureWorkspace(team);
    window.localStorage.setItem("aura:last-team", team);
    router.push(`/t/${team}`);
  }

  return (
    <main className="landing-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="landing-nav" aria-label="Main navigation">
        <AuraMark />
        <div className="live-pill">
          <span className="live-dot" />
          Realtime ready
        </div>
      </nav>

      <section className="landing-content">
        <div className="eyebrow">
          <TimerReset size={15} strokeWidth={2.2} />
          Time, beautifully managed
        </div>
        <h1>
          Every moment,
          <br />
          perfectly <span>timed.</span>
        </h1>
        <p className="hero-copy">
          A focused event timer for teams who care about staying on schedule
          without getting in the way of the room.
        </p>

        <form className="team-card" onSubmit={submit}>
          <label htmlFor="team-name">Enter your team name</label>
          <div className="team-input-row">
            <div className="team-input-wrap">
              <span>aura.app/</span>
              <input
                id="team-name"
                value={team}
                onChange={(event) => {
                  setTeam(sanitizeTeamSlug(event.target.value));
                  setTouched(false);
                }}
                onBlur={() => setTouched(true)}
                placeholder="yourteam"
                autoComplete="organization"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="team-hint"
              />
            </div>
            <button className="primary-button icon-button" type="submit" aria-label="Continue">
              <ArrowRight size={20} />
            </button>
          </div>
          <div className="team-meta" id="team-hint">
            <span className={touched && !valid ? "validation-error" : ""}>
              {touched && !valid
                ? "Use lowercase letters only"
                : "Lowercase letters, no spaces"}
            </span>
            {recentTeam && recentTeam !== team && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setTeam(recentTeam);
                  setTouched(false);
                }}
              >
                Use {recentTeam}
              </button>
            )}
          </div>
        </form>

        <div className="feature-row" aria-label="Product features">
          {features.map((feature) => (
            <span key={feature}>
              <i>
                <Check size={12} strokeWidth={3} />
              </i>
              {feature}
            </span>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>Aura Timer</span>
        <span>Made for moments that matter</span>
      </footer>
    </main>
  );
}
