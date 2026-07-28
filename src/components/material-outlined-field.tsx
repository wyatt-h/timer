"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type {
  TextFieldType,
} from "@material/web/textfield/outlined-text-field.js";

export type MaterialTextFieldElement = HTMLElement & {
  value: string;
  label: string;
  type: TextFieldType | "date";
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  error: boolean;
  errorText: string;
  supportingText: string;
  prefixText: string;
  suffixText: string;
  inputMode: string;
  min: string;
  max: string;
  step: string;
  noSpinner: boolean;
  autocomplete: string;
  name: string;
};

let materialTextFieldRegistration: Promise<unknown> | undefined;

function registerMaterialTextField() {
  materialTextFieldRegistration ??= import(
    "@material/web/textfield/outlined-text-field.js"
  );
  return materialTextFieldRegistration;
}

export type MaterialOutlinedFieldProps = {
  id?: string;
  label: string;
  value: string;
  type?: TextFieldType | "date";
  className?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaHasPopup?: React.AriaAttributes["aria-haspopup"];
  ariaExpanded?: boolean;
  inputMode?: string;
  min?: string;
  max?: string;
  step?: string;
  autoComplete?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  errorText?: string;
  supportingText?: string;
  prefixText?: string;
  suffixText?: string;
  noSpinner?: boolean;
  children?: React.ReactNode;
  onValueChange?: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  onClick?: () => void;
};

/**
 * Google's Material Web outlined text field.
 *
 * The web component is registered after hydration. That keeps its browser-only
 * implementation out of Next.js server rendering while still rendering a
 * stable, accessible host element immediately.
 */
export const MaterialOutlinedField = React.forwardRef<
  MaterialTextFieldElement,
  MaterialOutlinedFieldProps
>(function MaterialOutlinedField(
  {
    id,
    label,
    value,
    type = "text",
    className,
    name = "",
    placeholder = "",
    ariaLabel,
    ariaDescribedBy,
    ariaHasPopup,
    ariaExpanded,
    inputMode = "",
    min = "",
    max = "",
    step = "",
    autoComplete = "",
    disabled = false,
    readOnly = false,
    required = false,
    invalid = false,
    errorText = "",
    supportingText = "",
    prefixText = "",
    suffixText = "",
    noSpinner = false,
    children,
    onValueChange,
    onBlur,
    onFocus,
    onClick,
  },
  forwardedRef,
) {
  const fieldRef = useRef<MaterialTextFieldElement | null>(null);

  React.useImperativeHandle(forwardedRef, () => fieldRef.current!, []);

  useEffect(() => {
    let active = true;
    void registerMaterialTextField().then(() => {
      if (!active || !fieldRef.current) return;
      Object.assign(fieldRef.current, {
        label,
        value,
        type,
        name,
        placeholder,
        inputMode,
        min,
        max,
        step,
        autocomplete: autoComplete,
        disabled,
        readOnly,
        required,
        error: invalid,
        errorText,
        supportingText,
        prefixText,
        suffixText,
        noSpinner,
      });
    });
    return () => {
      active = false;
    };
  }, [
    autoComplete,
    disabled,
    errorText,
    inputMode,
    invalid,
    label,
    max,
    min,
    name,
    noSpinner,
    placeholder,
    prefixText,
    readOnly,
    required,
    step,
    suffixText,
    supportingText,
    type,
    value,
  ]);

  return React.createElement(
    "md-outlined-text-field",
    {
      ref: fieldRef,
      id,
      className,
      "data-slot": "input",
      label,
      value,
      type,
      name,
      placeholder,
      inputMode,
      min,
      max,
      step,
      autocomplete: autoComplete,
      disabled,
      readOnly,
      required,
      error: invalid,
      errorText,
      supportingText,
      prefixText,
      suffixText,
      noSpinner,
      "aria-label": ariaLabel ?? label,
      "aria-describedby": ariaDescribedBy,
      "aria-haspopup": ariaHasPopup,
      "aria-expanded": ariaExpanded,
      "aria-invalid": invalid ? "true" : undefined,
      onInput: (event: React.FormEvent<MaterialTextFieldElement>) => {
        onValueChange?.(event.currentTarget.value ?? "");
      },
      onBlur,
      onFocus,
      onClick,
    },
    children,
  );
});

type MaterialOutlinedDurationFieldProps = {
  label: string;
  seconds: number | undefined;
  fallbackMinutes?: number;
  minimumMinutes?: number;
  className?: string;
  ariaLabel?: string;
  onSecondsChange: (seconds: number) => void;
};

function minutesValue(
  seconds: number | undefined,
  fallbackMinutes: number,
  minimumMinutes: number,
) {
  return String(
    Math.max(
      minimumMinutes,
      Math.round((seconds ?? fallbackMinutes * 60) / 60),
    ),
  );
}

export function MaterialOutlinedDurationField({
  label,
  seconds,
  fallbackMinutes = 5,
  minimumMinutes = 1,
  className,
  ariaLabel,
  onSecondsChange,
}: MaterialOutlinedDurationFieldProps) {
  const [value, setValue] = useState(() =>
    minutesValue(seconds, fallbackMinutes, minimumMinutes),
  );

  function commit(rawValue: string) {
    const parsed = Number(rawValue);
    const minutes =
      rawValue.trim() && Number.isFinite(parsed)
        ? Math.max(minimumMinutes, parsed)
        : Number(minutesValue(seconds, fallbackMinutes, minimumMinutes));
    const normalized = String(minutes);
    setValue(normalized);
    onSecondsChange(Math.round(minutes * 60));
  }

  return (
    <MaterialOutlinedField
      className={className}
      label={label}
      value={value}
      type="number"
      inputMode="decimal"
      min={String(minimumMinutes)}
      step="1"
      noSpinner
      suffixText="min"
      ariaLabel={ariaLabel}
      onValueChange={(nextValue) => {
        setValue(nextValue);
        if (
          nextValue.trim() &&
          Number.isFinite(Number(nextValue)) &&
          Number(nextValue) >= minimumMinutes
        ) {
          onSecondsChange(Math.round(Number(nextValue) * 60));
        }
      }}
      onBlur={() => commit(value)}
    />
  );
}
