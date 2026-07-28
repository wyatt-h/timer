"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-field border border-line bg-surface-raised px-3 text-[13px] text-ink outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-[var(--ease-snap)]",
        "placeholder:text-text-subtle/75",
        "hover:not-focus:border-violet/30 hover:not-focus:bg-white",
        "focus-visible:border-violet/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-violet/20",
        /* Invalid state is carried by border, tint and an adjacent message —
           never by colour alone. */
        "aria-invalid:border-over/55 aria-invalid:bg-over-soft aria-invalid:focus-visible:ring-over/20",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
