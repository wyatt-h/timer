"use client";

import { ArrowRight } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureWorkspace, isValidTeamSlug, sanitizeTeamSlug } from "@/lib/store";

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
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[radial-gradient(circle_at_52%_40%,rgba(255,255,255,0.95),transparent_35%),linear-gradient(180deg,#fbfbfc_0%,#f5f4f8_100%)] px-[5vw]">
      {/* A single soft wash. Two competing gradients read as decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[22vw] -right-[16vw] -z-10 size-[46vw] rounded-full bg-[radial-gradient(circle,rgba(159,134,255,0.2),transparent_68%)] blur-[14px]"
      />

      <nav className="flex h-[88px] w-full items-center" aria-label="Main navigation">
        <BrandMark />
      </nav>

      <section className="mx-auto flex w-[min(100%,620px)] flex-1 flex-col items-center justify-center pt-14 pb-18 text-center">
        <h1 className="mb-10 text-[clamp(3.25rem,7.2vw,5.5rem)] leading-[0.96] font-semibold tracking-[-0.065em] text-[#151519]">
          Every moment,
          <br />
          perfectly <span className="text-violet">timed.</span>
        </h1>

        <form
          onSubmit={submit}
          className="w-[min(100%,470px)] rounded-[22px] border border-ink/8 bg-white/80 p-[18px] text-left shadow-[0_22px_70px_rgba(31,26,50,0.08),inset_0_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl"
        >
          <div className="flex gap-2">
            <Input
              id="team-name"
              className="min-w-0 flex-1"
              label="Team name"
              value={team}
              onValueChange={(value) => {
                setTeam(sanitizeTeamSlug(value));
                setTouched(false);
              }}
              onBlur={() => setTouched(true)}
              placeholder="Your team name"
              autoComplete="organization"
              aria-describedby="team-hint"
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              aria-label="Continue"
              className="size-[49px]"
            >
              <ArrowRight size={20} aria-hidden />
            </Button>
          </div>

          {/* Speaks up only when something is wrong, or when there is a shortcut. */}
          <div id="team-hint" className="mx-1 flex justify-between text-[12px] empty:hidden">
            {touched && !valid && (
              <span className="mt-2 text-over">Lowercase letters only</span>
            )}
            {recentTeam && recentTeam !== team && (
              <button
                type="button"
                onClick={() => {
                  setTeam(recentTeam);
                  setTouched(false);
                }}
                className="mt-2 ml-auto font-semibold text-violet hover:underline"
              >
                Use {recentTeam}
              </button>
            )}
          </div>
        </form>
      </section>

      <footer className="flex min-h-[62px] w-full items-center text-[12px] text-text-subtle">
        <span>Timer</span>
      </footer>
    </main>
  );
}
