"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-label font-semibold text-text-muted select-none",
        "group-data-[disabled=true]:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
