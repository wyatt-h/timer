"use client";

import { Label } from "@/components/ui/label";
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
    <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <Label htmlFor={nameId}>Speaker</Label>
        <Input
          id={nameId}
          className="mt-1 h-10"
          placeholder="Who is speaking"
          value={name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={onBlur}
        />
        <FieldError id={`${nameId}-error`}>{nameError}</FieldError>
      </div>

      <div>
        <Label htmlFor={durationId}>Duration</Label>
        <div className="mt-1 flex items-center gap-2">
          <DurationField
            id={durationId}
            className="h-10 w-[86px]"
            value={durationMinutes}
            invalid={Boolean(durationError)}
            aria-describedby={durationError ? `${durationId}-error` : undefined}
            onChange={onDurationChange}
            onBlur={onBlur}
          />
          <span className="text-[12px] text-text-subtle">min</span>
        </div>
        <FieldError id={`${durationId}-error`}>{durationError}</FieldError>
      </div>
    </div>
  );
}
