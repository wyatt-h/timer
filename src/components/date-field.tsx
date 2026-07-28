"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DateFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month: month - 1, day };
}

/** Monday-first offset for the 1st of a month. */
function leadingBlanks(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function monthLength(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * A date field with its own calendar. The native `type="date"` popover is
 * browser chrome that CSS cannot reach, so on this screen it was the one
 * control that ignored the app's styling entirely.
 */
export function DateField({ id, value, onChange }: DateFieldProps) {
  const parsed = parseIso(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({
    year: parsed?.year ?? new Date().getFullYear(),
    month: parsed?.month ?? new Date().getMonth(),
  }));
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openCalendar() {
    const current = parseIso(value);
    if (current) setView({ year: current.year, month: current.month });
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function select(day: number) {
    onChange(toIso(view.year, view.month, day));
    setOpen(false);
  }

  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const label = parsed
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "Choose a date";

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(view.year, view.month, 1));

  const days = Array.from({ length: monthLength(view.year, view.month) }, (_, index) => index + 1);

  return (
    <div className="relative" ref={wrapper}>
      <Input
        id={id}
        className="cursor-pointer"
        label="Date"
        value={label}
        readOnly
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openCalendar())}
      >
        <CalendarDays
          slot="leading-icon"
          size={17}
          aria-hidden
          className="text-text-subtle"
        />
      </Input>

      {open && (
        <div role="dialog" aria-label="Choose a date" className="absolute top-[calc(100%+0.375rem)] left-0 z-40 w-[268px] rounded-card border border-line bg-white p-3.5 shadow-[0_18px_44px_rgba(20,16,38,0.16)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="grid size-7 place-items-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark"
            >
              <ChevronLeft size={15} aria-hidden />
            </button>
            <strong aria-live="polite" className="text-[13px] font-semibold tracking-[-0.02em]">{monthLabel}</strong>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="grid size-7 place-items-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-violet-dark"
            >
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>

          <div role="grid" className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((weekday, index) => (
              <span className="grid h-[26px] place-items-center text-[12px] font-bold text-text-subtle/80" key={`${weekday}-${index}`} aria-hidden>
                {weekday}
              </span>
            ))}
            {Array.from({ length: leadingBlanks(view.year, view.month) }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {days.map((day) => {
              const iso = toIso(view.year, view.month, day);
              return (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    "tabular grid h-8 place-items-center rounded-[9px] text-[12px] text-ink transition-colors duration-150 hover:bg-surface-hover",
                    /* Today is outlined; the selection is filled. */
                    iso === todayIso && "ring-1 ring-violet/35 ring-inset",
                    iso === value &&
                      "bg-violet font-semibold text-white shadow-[0_4px_12px_rgba(103,69,220,0.28)] hover:bg-violet-dark",
                  )}
                  aria-current={iso === value ? "date" : undefined}
                  onClick={() => select(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex justify-end border-t border-line-soft pt-2.5">
            <button
              className="text-[12px] font-semibold text-violet hover:underline"
              type="button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
