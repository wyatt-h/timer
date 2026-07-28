"use client";

import { Input } from "@/components/ui/input";
import { DurationField, FieldError } from "@/components/agenda/fields";

export type SpeakerFieldsProps = {
  itemId: string;
  name: string;
  durationMinutes: number;
  nameError?: string;
  durationError?: string;
  onNameChange: (name: string) => void;
  onDurationChange: (minutes: number) => void;
  onBlur: () => void;
};

/**
 * A single speaker: who is talking and for how long.
 *
 * The speaker's duration *is* the item's duration, so there is one control
 * rather than two that must be kept in agreement — the schema rule about them
 * matching is satisfied structurally instead of being validated after the
 * fact.
 */
export function SpeakerFields({
  itemId,
  name,
  durationMinutes,
  nameError,
  durationError,
  onNameChange,
  onDurationChange,
  onBlur,
}: SpeakerFieldsProps) {
  const nameId = `${itemId}-speaker-name`;
  const durationId = `${itemId}-speaker-duration`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 rounded-card border border-line-soft bg-surface-sunken p-3">
      <div className="min-w-0 max-w-[360px]">
        <Input
          id={nameId}
          className="material-outlined-field--compact"
          label="Speaker"
          placeholder="Who is speaking"
          value={name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          onValueChange={onNameChange}
          onBlur={onBlur}
        />
        <FieldError id={`${nameId}-error`}>{nameError}</FieldError>
      </div>

      <div className="justify-self-end">
        <DurationField
          id={durationId}
          label="Duration"
          suffixText="min"
          value={durationMinutes}
          invalid={Boolean(durationError)}
          aria-describedby={durationError ? `${durationId}-error` : undefined}
          onChange={onDurationChange}
          onBlur={onBlur}
        />
        <FieldError id={`${durationId}-error`}>{durationError}</FieldError>
      </div>
    </div>
  );
}
