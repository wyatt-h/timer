"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { minutesFromSeconds } from "@/lib/format";

type DurationInputProps = {
  seconds: number | undefined;
  onSecondsChange: (seconds: number) => void;
  minimumMinutes?: number;
  maximumMinutes?: number;
  fallbackMinutes?: number;
  className?: string;
  label?: string;
  "aria-label"?: string;
};

function clampMinutes(value: number, minimumMinutes: number, maximumMinutes?: number) {
  return Math.min(maximumMinutes ?? Number.POSITIVE_INFINITY, Math.max(minimumMinutes, value));
}

function toMinutes(
  seconds: number | undefined,
  minimumMinutes: number,
  fallbackMinutes: number,
  maximumMinutes?: number,
) {
  return String(
    clampMinutes(
      minutesFromSeconds(seconds ?? fallbackMinutes * 60),
      minimumMinutes,
      maximumMinutes,
    ),
  );
}

export function DurationInput({
  seconds,
  onSecondsChange,
  minimumMinutes = 1,
  maximumMinutes,
  fallbackMinutes = minimumMinutes,
  className,
  label = "Minutes",
  "aria-label": ariaLabel,
}: DurationInputProps) {
  const [value, setValue] = useState(() =>
    toMinutes(seconds, minimumMinutes, fallbackMinutes, maximumMinutes),
  );
  const [isEditing, setIsEditing] = useState(false);

  function commit(rawValue: string) {
    const parsed = Number(rawValue);
    const minutes =
      rawValue.trim() && Number.isFinite(parsed)
        ? clampMinutes(parsed, minimumMinutes, maximumMinutes)
        : clampMinutes(
            minutesFromSeconds(seconds ?? fallbackMinutes * 60),
            minimumMinutes,
            maximumMinutes,
          );
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
      max={maximumMinutes === undefined ? undefined : String(maximumMinutes)}
      step="any"
      type="number"
      noSpinner
      suffixText="min"
      value={
        isEditing ? value : toMinutes(seconds, minimumMinutes, fallbackMinutes, maximumMinutes)
      }
      onFocus={() => {
        setValue(toMinutes(seconds, minimumMinutes, fallbackMinutes, maximumMinutes));
        setIsEditing(true);
      }}
      onValueChange={(nextValue) => {
        setValue(nextValue);
        if (
          nextValue.trim() &&
          Number(nextValue) >= minimumMinutes &&
          (maximumMinutes === undefined || Number(nextValue) <= maximumMinutes)
        ) {
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
