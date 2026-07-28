"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";

/**
 * Whole-minute input.
 *
 * Kept as a string while focused so a half-typed value like "1" on the way to
 * "15" isn't clamped out from under the cursor, then committed as a number on
 * blur. Without this, typing over a value fights the user on every keystroke.
 */
export function DurationField({
  value,
  onChange,
  onBlur,
  invalid,
  className,
  ...props
}: Omit<InputProps, "value" | "onValueChange" | "type"> & {
  value: number;
  onChange: (minutes: number) => void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min="1"
      step="1"
      aria-invalid={invalid || undefined}
      className={cn("material-outlined-field--minutes tabular", className)}
      value={draft ?? String(Number.isFinite(value) ? value : "")}
      onFocus={() => {
        setDraft(String(Number.isFinite(value) ? value : ""));
        props.onFocus?.();
      }}
      onValueChange={(next) => {
        setDraft(next);
        const parsed = Number(next);
        if (next.trim() && Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = Number(draft);
        onChange(draft?.trim() && Number.isFinite(parsed) ? Math.round(parsed) : value);
        setDraft(null);
        onBlur?.();
      }}
    />
  );
}

/**
 * Field-level message. Rendered in the flow beneath its input rather than in
 * a tooltip, so it is announced with the field and cannot be missed on touch.
 */
export function FieldError({
  id,
  children,
  className,
}: {
  id?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p id={id} className={cn("mt-1.5 text-[12px] font-medium text-over", className)}>
      {children}
    </p>
  );
}

/**
 * Drag affordance. Dragging is bound to this control alone so text selection
 * and normal input interaction keep working everywhere else in the row.
 */
export const DragHandle = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { label: string }
>(function DragHandle({ label, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Reorder ${label}. Press space, then use the arrow keys.`}
      className={cn(
        "grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-[9px] text-text-subtle/70",
        "transition-[color,background-color] duration-150 ease-[var(--ease-snap)]",
        "hover:bg-surface-hover hover:text-violet-dark",
        "active:cursor-grabbing",
        "focus-visible:bg-surface-hover focus-visible:text-violet-dark",
        className,
      )}
      {...props}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
});
