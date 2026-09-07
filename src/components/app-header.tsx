"use client";

import Link from "next/link";
import { BookOpen, House } from "lucide-react";
import { ContextHelp } from "@/components/context-help";
import type { HelpContext } from "@/lib/guide";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

/*
 * There is no team and no workspace to name, so the header carries only the mark
 * and a way home. An event is reached by its own address and its own credentials.
 */
export function AppHeader({ helpContext }: { helpContext?: HelpContext } = {}) {
  return (
    <>
      {/*
        * Keyboard users would otherwise tab the whole header on every page
        * before reaching anything they came for.
        */}
      <a
        href="#main"
        className="fixed top-2.5 left-2.5 z-[100] -translate-y-[160%] rounded-[10px] bg-violet-dark px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-transform duration-150 ease-[var(--ease-out-quart)] focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center justify-between gap-2 py-3 border-b border-line bg-[rgba(250,250,251,0.84)] px-5 backdrop-blur-xl backdrop-saturate-150 sm:px-8 lg:px-14">
        <Link href="/" aria-label="Timer home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1">
          {helpContext && <ContextHelp context={helpContext} />}
          <Button asChild variant="ghost" size="sm">
            <Link href="/guide">
              <BookOpen size={15} aria-hidden />
              Guide
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <House size={15} aria-hidden />
              Home
            </Link>
          </Button>
        </div>
      </header>
    </>
  );
}
