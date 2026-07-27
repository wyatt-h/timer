"use client";

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuraMark } from "@/components/aura-mark";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const team = searchParams.get("team") ?? "";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const client = createSupabaseBrowserClient();
    if (!client) {
      setError("Supabase is not configured yet.");
      return;
    }
    const next = team ? `/t/${team}` : "/";
    const { error: authError } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (authError) setError(authError.message);
    else setSent(true);
  }

  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <AuraMark />
        <Link className="ghost-button" href={team ? `/t/${team}` : "/"}>
          <ArrowLeft size={14} />
          Back
        </Link>
      </nav>
      <section className="landing-content">
        <div className="eyebrow">
          <Mail size={15} />
          Secure admin access
        </div>
        <h1 style={{ fontSize: "clamp(44px, 6vw, 72px)" }}>
          Sign in to <span>sync.</span>
        </h1>
        <p className="hero-copy">
          We&apos;ll send you a secure sign-in link. No password to remember.
        </p>
        <form className="team-card" onSubmit={submit}>
          {sent ? (
            <div style={{ textAlign: "center", padding: "18px 10px" }}>
              <strong>Check your inbox</strong>
              <p style={{ color: "#777780", fontSize: 12, lineHeight: 1.5 }}>
                Open the link sent to {email} to finish signing in.
              </p>
            </div>
          ) : (
            <>
              <label htmlFor="email">Email address</label>
              <input
                className="input"
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
              {error && <p className="validation-error" style={{ fontSize: 11 }}>{error}</p>}
              <button className="primary-button full-button" style={{ marginTop: 12 }}>
                Email me a sign-in link
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
