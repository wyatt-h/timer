"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export function AppHeader({ team }: { team: string }) {
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

      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-line bg-[rgba(250,250,251,0.84)] px-5 backdrop-blur-xl backdrop-saturate-150 sm:px-8 lg:px-14">
        <Link href={`/t/${team}`} aria-label="Timer dashboard">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-text-muted">
            <span className="grid size-7 place-items-center rounded-[9px] bg-[#eae4ff] text-[11px] font-bold text-[#5e42ca] uppercase">
              {team.slice(0, 2)}
            </span>
            <span className="max-sm:sr-only">{team}</span>
          </span>
          <Button asChild variant="ghost" size="icon" aria-label="Switch team">
            <Link href="/">
              <LogOut size={15} aria-hidden />
            </Link>
          </Button>
        </div>
      </header>
    </>
  );
}
