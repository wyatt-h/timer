"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Control heights are shared with Input and the segmented control so rows
 * align on a single baseline. 44px is the comfortable touch target; 36px is
 * for dense rows where a control sits beside a text field.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-[13px] font-semibold tracking-[-0.015em] transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-snap)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-violet text-white shadow-[0_6px_16px_-4px_rgba(103,69,220,0.45)] hover:bg-violet-dark",
        secondary:
          "border border-line bg-white text-ink hover:border-violet/30 hover:bg-surface-hover hover:text-violet-dark",
        ghost: "text-text-muted hover:bg-surface-hover hover:text-violet-dark",
        danger: "bg-over text-white hover:bg-[#b62d2d]",
        /* Sits inside a section rather than competing with primary actions. */
        dashed:
          "w-full border border-dashed border-violet/25 bg-violet-soft/40 text-violet-dark hover:border-violet/45 hover:bg-violet-soft/70",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-[12px]",
        icon: "size-11 px-0",
        iconSm: "size-9 px-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(!asChild ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}

export { Button, buttonVariants };
