"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DragHandle, DurationField, FieldError } from "@/components/agenda/fields";

export type PanelistRowProps = {
  id: string;
  index: number;
  name: string;
  durationMinutes: number;
  nameError?: string;
  durationError?: string;
  canDelete: boolean;
  onNameChange: (name: string) => void;
  onDurationChange: (minutes: number) => void;
  onBlur: () => void;
  onDelete: () => void;
};

/**
 * One panelist.
 *
 * The row is a grid rather than a flex line so the handle, duration, unit and
 * delete columns line up across every row regardless of name length. On
 * narrow screens the name takes its own line and the remaining controls sit
 * beneath it, which avoids a horizontal scrollbar inside the card.
 */
export function SortablePanelistRow({
  id,
  index,
  name,
  durationMinutes,
  nameError,
  durationError,
  canDelete,
  onNameChange,
  onDurationChange,
  onBlur,
  onDelete,
}: PanelistRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const label = name.trim() || `panelist ${index + 1}`;
  const nameErrorId = nameError ? `${id}-name-error` : undefined;
  const durationErrorId = durationError ? `${id}-duration-error` : undefined;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/row rounded-[13px] border border-transparent bg-white/70 px-1.5 py-1.5",
        "transition-[border-color,background-color,opacity] duration-150 ease-[var(--ease-snap)]",
        "hover:border-line-soft hover:bg-white",
        "focus-within:border-violet/25 focus-within:bg-white",
        /* The source row stays in place but recedes; the overlay is the thing
           that follows the pointer. */
        isDragging && "opacity-40",
      )}
    >
      <div
        /*
         * The name track absorbs the available width on desktop, keeping the
         * handle and name anchored left while duration and delete stay grouped
         * against the right edge. Narrow screens retain the wrapped layout.
         */
        className={cn(
          "grid items-center gap-x-2 gap-y-2",
          "grid-cols-[auto_minmax(0,1fr)_auto]",
          "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
        )}
      >
        <DragHandle
          ref={setActivatorNodeRef}
          label={label}
          {...attributes}
          {...listeners}
        />

        <div className="min-w-0">
          <Input
            label={`Panelist ${index + 1}`}
            aria-label={`Name of panelist ${index + 1}`}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameErrorId}
            className="material-outlined-field--compact"
            placeholder={`Panelist ${index + 1}`}
            value={name}
            onValueChange={onNameChange}
            onBlur={onBlur}
          />
        </div>

        {/* Delete stays on the first line at every width so the row keeps a
            consistent right edge. */}
        <div className="sm:order-last">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                disabled={!canDelete}
                aria-label={`Remove ${label}`}
                onClick={onDelete}
                className={cn(
                  "text-text-subtle/60 hover:text-over",
                  /* Quiet until the row is touched, but always reachable by
                     keyboard and always present for touch. */
                  "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
                  "focus-visible:opacity-100 disabled:opacity-25",
                  "max-sm:opacity-100",
                )}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {canDelete ? "Remove panelist" : "A panel needs one panelist"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="col-start-2 sm:col-start-auto">
          <DurationField
            label="Minutes"
            aria-label={`Minutes for ${label}`}
            aria-describedby={durationErrorId}
            invalid={Boolean(durationError)}
            value={durationMinutes}
            suffixText="min"
            onChange={onDurationChange}
            onBlur={onBlur}
          />
        </div>
      </div>

      {(nameError || durationError) && (
        <div className="pl-11">
          <FieldError id={nameErrorId}>{nameError}</FieldError>
          <FieldError id={durationErrorId}>{durationError}</FieldError>
        </div>
      )}
    </li>
  );
}
