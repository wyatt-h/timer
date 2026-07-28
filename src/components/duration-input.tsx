"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type DurationInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value"
> & {
  seconds: number | undefined;
  onSecondsChange: (seconds: number) => void;
  minimumMinutes?: number;
  fallbackMinutes?: number;
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
  ...inputProps
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
    <input
      {...inputProps}
      className={cn(
        /*
         * Sized here rather than by the caller: this only ever holds two or
         * three digits, and letting it stretch was what left minute fields
         * marooned from their "min" label.
         */
        "tabular h-9 w-[74px] rounded-field border border-line bg-surface-raised px-2 text-center text-[13px] text-ink outline-none",
        "transition-[border-color,box-shadow] duration-150",
        "hover:not-focus:border-violet/30 hover:not-focus:bg-white",
        "focus-visible:border-violet/50 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-violet/20",
        className,
      )}
      inputMode="decimal"
      min={minimumMinutes}
      step={1}
      type="number"
      value={isEditing ? value : toMinutes(seconds, minimumMinutes, fallbackMinutes)}
      onFocus={() => {
        setValue(toMinutes(seconds, minimumMinutes, fallbackMinutes));
        setIsEditing(true);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setValue(nextValue);
        if (nextValue.trim() && Number(nextValue) >= minimumMinutes) {
          onSecondsChange(Math.round(Number(nextValue) * 60));
        }
      }}
      onBlur={(event) => {
        setIsEditing(false);
        commit(event.target.value);
      }}
    />
  );
}
