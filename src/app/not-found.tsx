import Link from "next/link";
import { ArrowLeft, BookOpen, Clock3 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="relative isolate min-h-svh overflow-hidden bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.98),transparent_31%),linear-gradient(180deg,#fbfbfc_0%,#f3f1f9_100%)]"
    >
      <AppHeader />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[14%] left-1/2 -z-10 size-[min(66vw,680px)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(142,113,244,0.2),transparent_68%)] blur-2xl"
      />

      <section className="mx-auto grid min-h-[calc(100svh-72px)] w-[min(620px,calc(100%-2.5rem))] place-items-center py-16 text-center">
        <div>
          <div className="mx-auto mb-7 grid size-16 place-items-center rounded-[20px] border border-violet/15 bg-white/80 text-violet shadow-[0_18px_50px_rgba(80,56,165,0.14)] backdrop-blur-xl">
            <Clock3 size={28} aria-hidden />
          </div>
          <p className="mb-3 text-[12px] font-bold tracking-[0.16em] text-violet-dark uppercase">
            404 · Time out
          </p>
          <h1
            aria-label="This page isn't on the run of show."
            className="text-[clamp(2.4rem,7vw,4.6rem)] leading-[0.98] font-semibold tracking-[-0.065em] text-ink"
          >
            This page isn&apos;t
            <br />
            on the run of show.
          </h1>
          <p className="mx-auto mt-5 max-w-[470px] text-[14px] leading-relaxed text-text-muted">
            The address may be incomplete, expired, or moved. Your events are still safe—return
            home to create or open one.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <Button asChild variant="primary">
              <Link href="/">
                <ArrowLeft size={15} aria-hidden />
                Return home
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/guide">
                <BookOpen size={15} aria-hidden />
                View product guide
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
