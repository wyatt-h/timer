"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

export function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    queueMicrotask(update);
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <span className={compact ? "wall-clock compact" : "wall-clock"}>
      <Clock3 size={compact ? 13 : 15} />
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
