import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.03em]",
        light && "text-[#f8f7fc]",
      )}
    >
      <i className="grid size-[30px] place-items-center rounded-[9px] bg-gradient-to-br from-[#8b71f4] to-[#6040d6] text-white shadow-[0_8px_20px_rgba(100,65,218,0.2),inset_0_1px_rgba(255,255,255,0.35)]">
        <Sparkles size={15} strokeWidth={2.2} aria-hidden />
      </i>
      Timer
    </span>
  );
}
