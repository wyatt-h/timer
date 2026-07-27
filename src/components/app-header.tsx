"use client";

import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import { AuraMark } from "@/components/aura-mark";
import { CloudStatus } from "@/components/cloud-status";

export function AppHeader({ team }: { team: string }) {
  return (
    <header className="topbar">
      <Link href={`/t/${team}`} aria-label="Aura Timer dashboard">
        <AuraMark />
      </Link>
      <div className="topbar-actions">
        <CloudStatus team={team} />
        <div className="team-switcher">
          <span className="team-avatar">{team.slice(0, 2)}</span>
          <span>{team}</span>
          <ChevronDown size={14} />
        </div>
        <Link className="ghost-button" href="/">
          <LogOut size={15} />
          Switch team
        </Link>
      </div>
    </header>
  );
}
