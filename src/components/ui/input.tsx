"use client";

import * as React from "react";
import {
  MaterialOutlinedField,
  type MaterialOutlinedFieldProps,
  type MaterialTextFieldElement,
} from "@/components/material-outlined-field";
import { cn } from "@/lib/utils";

export type InputProps = Omit<
  MaterialOutlinedFieldProps,
  "ariaLabel" | "ariaDescribedBy" | "ariaHasPopup" | "ariaExpanded" | "invalid"
> & {
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  "aria-expanded"?: boolean;
  "aria-invalid"?: boolean;
};

export const Input = React.forwardRef<MaterialTextFieldElement, InputProps>(
  function Input(
    {
      className,
      label,
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
      "aria-haspopup": ariaHasPopup,
      "aria-expanded": ariaExpanded,
      "aria-invalid": invalid,
      ...props
    },
    ref,
  ) {
    return (
      <MaterialOutlinedField
        ref={ref}
        className={cn("material-outlined-field", className)}
        label={label}
        ariaLabel={ariaLabel}
        ariaDescribedBy={ariaDescribedBy}
        ariaHasPopup={ariaHasPopup}
        ariaExpanded={ariaExpanded}
        invalid={Boolean(invalid)}
        {...props}
      />
    );
  },
);
