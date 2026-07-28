"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type DurationInputProps = {
  seconds: number | undefined;
  onSecondsChange: (seconds: number) => void;
  minimumMinutes?: number;
  fallbackMinutes?: number;
  className?: string;
  label?: string;
  "aria-label"?: string;
};

function toMinutes(seconds: number | undefined, minimumMinutes: number, fallbackMinutes: number) {
  return String(Math.max(minimumMinutes, Math.round((seconds ?? fallbackMinutes * 60) / 60)));
}

export function DurationInput({
  seconds,
  onSecondsChange,
  minimumMinutes = 1,
  fallbackMinutes = minimumMinutes,
  className,
  label = "Minutes",
  "aria-label": ariaLabel,
}: DurationInputProps) {
  const [value, setValue] = useState(() =>
    toMinutes(seconds, minimumMinutes, fallbackMinutes),
  );
  const [isEditing, setIsEditing] = useState(false);

  function commit(rawValue: string) {
    const parsed = Number(rawValue);
    const minutes =
      rawValue.trim() && Number.isFinite(parsed)
        ? Math.max(minimumMinutes, parsed)
        : Math.max(minimumMinutes, Math.round((seconds ?? fallbackMinutes * 60) / 60));
    setValue(String(minutes));
    onSecondsChange(Math.round(minutes * 60));
  }

  return (
    <Input
      className={className ?? "material-outlined-field--minutes"}
      label={label}
      aria-label={ariaLabel}
      inputMode="decimal"
      min={String(minimumMinutes)}
      step="1"
      type="number"
      noSpinner
      suffixText="min"
      value={isEditing ? value : toMinutes(seconds, minimumMinutes, fallbackMinutes)}
      onFocus={() => {
        setValue(toMinutes(seconds, minimumMinutes, fallbackMinutes));
        setIsEditing(true);
      }}
      onValueChange={(nextValue) => {
        setValue(nextValue);
        if (nextValue.trim() && Number(nextValue) >= minimumMinutes) {
          onSecondsChange(Math.round(Number(nextValue) * 60));
        }
      }}
      onBlur={() => {
        setIsEditing(false);
        commit(value);
      }}
    />
  );
}
