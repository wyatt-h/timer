import { Sparkles } from "lucide-react";

export function AuraMark({ light = false }: { light?: boolean }) {
  return (
    <span className="aura-mark" style={light ? { color: "#f8f7fc" } : undefined}>
      <i className="aura-glyph">
        <Sparkles size={15} strokeWidth={2.2} />
      </i>
      Aura Timer
    </span>
  );
}
