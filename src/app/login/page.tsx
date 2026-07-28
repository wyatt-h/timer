"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[linear-gradient(180deg,#fbfbfc_0%,#f5f4f8_100%)] px-[5vw]">
      <nav className="flex h-[88px] w-full items-center justify-between">
        <BrandMark />
        <Button asChild variant="ghost" size="sm">
          <Link href={team ? `/t/${team}` : "/"}>
            <ArrowLeft size={14} aria-hidden />
            Back
          </Link>
        </Button>
      </nav>
      <section className="mx-auto flex w-[min(100%,620px)] flex-1 flex-col items-center justify-center pb-18 text-center">
        <h1 className="mb-10 text-[clamp(2.75rem,6vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.06em]">
          Sign in to <span className="text-violet">sync.</span>
        </h1>
        <form onSubmit={submit} className="w-[min(100%,470px)] rounded-[22px] border border-ink/8 bg-white/80 p-[18px] text-left shadow-[0_22px_70px_rgba(31,26,50,0.08)] backdrop-blur-2xl">
          {sent ? (
            <div className="px-2 py-4 text-center">
              <strong className="text-[15px] font-semibold">Check your inbox</strong>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
                Open the link sent to {email} to finish signing in.
              </p>
            </div>
          ) : (
            <>
              <Label htmlFor="email" className="mb-1.5 block">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                aria-label="Email address"
              />
              {error && (
                <p className="mt-2.5 text-[12px] font-medium text-over">{error}</p>
              )}
              <Button variant="primary" className="mt-3 w-full">
                Email me a link
              </Button>
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
