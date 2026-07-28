"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * A quiet surface: hairline border and a very soft shadow. Nesting is shown
 * by tint rather than by stacking more shadows, so the page doesn't read as
 * a pile of independently floating cards.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(24,20,40,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-center gap-3 px-4 py-3", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-4 pb-4", className)} {...props} />
  );
}

export { Card, CardHeader, CardContent };
