"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    queueMicrotask(update);
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span
      className={cn(
        /* Must not wrap: the time is wider than it looks in a mono face. */
        "tabular inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap",
        "rounded-field border border-line font-mono text-[12px] text-text-muted",
        compact ? "bg-white px-2.5 py-[7px]" : "bg-white/80 px-[11px] py-[9px]",
      )}
    >
      <Clock3 size={compact ? 13 : 15} aria-hidden />
      {now
        ? new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: compact ? undefined : "2-digit",
          }).format(now)
        : "--:--"}
    </span>
  );
}
