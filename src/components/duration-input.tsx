"use client";

import { useState } from "react";

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
  className = "input",
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
      className={className}
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
