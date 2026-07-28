"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DurationField, FieldError } from "@/components/agenda/fields";
import { SortablePanelistRow } from "@/components/agenda/sortable-panelist-row";
import type { PanelistValues } from "@/lib/agenda-schema";

export type PanelFieldsProps = {
  itemId: string;
  host: string;
  durationMinutes: number;
  defaultPanelistMinutes: number;
  panelists: PanelistValues[];
  usedMinutes: number;
  remainingMinutes: number;
  errors: {
    host?: string;
    duration?: string;
    defaultMinutes?: string;
    panelists?: string;
    panelistName?: (index: number) => string | undefined;
    panelistDuration?: (index: number) => string | undefined;
  };
  onHostChange: (host: string) => void;
  onDurationChange: (minutes: number) => void;
  onDefaultMinutesChange: (minutes: number) => void;
  onPanelistNameChange: (index: number, name: string) => void;
  onPanelistDurationChange: (index: number, minutes: number) => void;
  onAddPanelist: () => void;
  onRemovePanelist: (index: number) => void;
  onMovePanelist: (from: number, to: number) => void;
  onApplyToAll: () => void;
  onBlur: () => void;
};

export function PanelFields({
  itemId,
  host,
  durationMinutes,
  defaultPanelistMinutes,
  panelists,
  usedMinutes,
  remainingMinutes,
  errors,
  onHostChange,
  onDurationChange,
  onDefaultMinutesChange,
  onPanelistNameChange,
  onPanelistDurationChange,
  onAddPanelist,
  onRemovePanelist,
  onMovePanelist,
  onApplyToAll,
  onBlur,
}: PanelFieldsProps) {
  const sensors = useSensors(
    /*
     * A small activation distance lets a click land on the handle without
     * starting a drag, so the handle is still focusable and clickable.
     */
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const hostId = `${itemId}-host`;
  const durationId = `${itemId}-panel-duration`;
  const defaultId = `${itemId}-default-minutes`;
  const overrun = remainingMinutes < 0;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = panelists.findIndex((panelist) => panelist.id === active.id);
    const to = panelists.findIndex((panelist) => panelist.id === over.id);
    if (from < 0 || to < 0) return;
    onMovePanelist(from, to);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <Label htmlFor={hostId}>Panel host</Label>
          <Input
            id={hostId}
            className="mt-1 h-10"
            placeholder="Who runs this panel"
            value={host}
            aria-invalid={errors.host ? true : undefined}
            aria-describedby={errors.host ? `${hostId}-error` : undefined}
            onChange={(event) => onHostChange(event.target.value)}
            onBlur={onBlur}
          />
          <FieldError id={`${hostId}-error`}>{errors.host}</FieldError>
        </div>

        <div>
          <Label htmlFor={durationId}>Panel total</Label>
          <div className="mt-1 flex items-center gap-2">
            <DurationField
              id={durationId}
              className="h-10 w-[86px]"
              value={durationMinutes}
              invalid={Boolean(errors.duration)}
              aria-describedby={errors.duration ? `${durationId}-error` : undefined}
              onChange={onDurationChange}
              onBlur={onBlur}
            />
            <span className="text-[12px] text-text-subtle">min</span>
          </div>
          <FieldError id={`${durationId}-error`}>{errors.duration}</FieldError>
        </div>
      </div>

      {/*
        * The nested panel area is a tinted well rather than another card.
        * Tint communicates containment without adding a second shadow layer.
        */}
      <section
        aria-label="Panelists"
        className="rounded-card border border-line-soft bg-surface-sunken p-2.5 sm:p-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1">
          <div>
            <Label htmlFor={defaultId}>Default per panelist</Label>
            <div className="mt-1 flex items-center gap-2">
              <DurationField
                id={defaultId}
                className="h-9 w-[74px] bg-white"
                value={defaultPanelistMinutes}
                invalid={Boolean(errors.defaultMinutes)}
                onChange={onDefaultMinutesChange}
                onBlur={onBlur}
              />
              <span className="text-[12px] text-text-subtle">min</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onApplyToAll}
                disabled={panelists.length === 0}
              >
                Apply to all
              </Button>
            </div>
          </div>

          {/*
            * Used and remaining are derived from the field values on every
            * render, so they cannot drift from the rows above them.
            */}
          <dl className="flex items-center gap-4 text-[12px]">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-text-subtle">Used</dt>
              <dd className="tabular font-semibold text-text-muted">{usedMinutes} min</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-text-subtle">{overrun ? "Over" : "Left"}</dt>
              <dd
                className={cn(
                  "tabular font-semibold",
                  overrun ? "text-over" : "text-text-muted",
                )}
              >
                {Math.abs(remainingMinutes)} min
              </dd>
            </div>
          </dl>
        </div>

        {panelists.length === 0 ? (
          <p className="mt-3 rounded-[13px] border border-dashed border-line px-3 py-6 text-center text-[12px] text-text-subtle">
            No panelists yet. Add the first one below.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={panelists.map((panelist) => panelist.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="mt-2 grid gap-1">
                {panelists.map((panelist, index) => (
                  <SortablePanelistRow
                    key={panelist.id}
                    id={panelist.id}
                    index={index}
                    name={panelist.name}
                    durationMinutes={panelist.durationMinutes}
                    nameError={errors.panelistName?.(index)}
                    durationError={errors.panelistDuration?.(index)}
                    canDelete={panelists.length > 1}
                    onNameChange={(name) => onPanelistNameChange(index, name)}
                    onDurationChange={(minutes) => onPanelistDurationChange(index, minutes)}
                    onBlur={onBlur}
                    onDelete={() => onRemovePanelist(index)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {errors.panelists && (
          <p
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-[11px] border border-over/20 bg-over-soft px-3 py-2 text-[12px] leading-relaxed text-over"
          >
            <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{errors.panelists}</span>
          </p>
        )}

        <Button
          type="button"
          variant="dashed"
          size="sm"
          className="mt-2"
          onClick={onAddPanelist}
        >
          <Plus className="size-3.5" aria-hidden />
          Add panelist
        </Button>
      </section>
    </div>
  );
}
