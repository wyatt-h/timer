"use client";

import * as React from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { CalendarPlus, Mic, Plus, Users } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SortableAgendaItem } from "@/components/agenda/sortable-agenda-item";
import { SpeakerFields } from "@/components/agenda/speaker-fields";
import { PanelFields } from "@/components/agenda/panel-fields";
import {
  agendaFormSchema,
  itemHasContent,
  remainingPanelMinutes,
  totalProgrammeMinutes,
  usedPanelMinutes,
  type AgendaFormValues,
  type AgendaItemValues,
} from "@/lib/agenda-schema";
import { makePanelItem, makePanelist, makeSpeakerItem } from "@/lib/agenda-mapping";
import { agendaItemTitle } from "@/lib/agenda-labels";

export type AgendaEditorProps = {
  defaultValues: AgendaFormValues;
  onChange?: (values: AgendaFormValues) => void;
};

/**
 * The agenda editor.
 *
 * Form state is the only copy of the data — there is no mirrored component
 * state to keep in step, so a reorder cannot desynchronise from what the
 * fields display. Everything shown as a total is derived on render from the
 * same values the inputs are bound to.
 */
export function AgendaEditor({ defaultValues, onChange }: AgendaEditorProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues,
    validators: { onChange: agendaFormSchema, onMount: agendaFormSchema },
  });

  /*
   * Subscribing to the values keeps this component re-rendering with the form
   * rather than holding its own copy. `useStore` reads the same store the
   * fields write to.
   */
  const values = useStore(form.store, (state) => state.values as AgendaFormValues);
  const fieldErrors = useStore(form.store, (state) => state.errorMap);

  /*
   * Reported from the store rather than from a form listener: array
   * operations such as push and move do not raise field-level change events,
   * so the store is the only place that sees every mutation.
   */
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onChangeRef.current?.(values);
  }, [values]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = values.agendaItems;
  const activeItem = items.find((item) => item.id === activeId) ?? null;
  const programmeMinutes = totalProgrammeMinutes(values);

  /*
   * Zod reports problems against paths like
   * `agendaItems[1].panel.panelists[0].name`. Indexing them once here means
   * the row components can stay unaware of the validation library.
   */
  const issues = React.useMemo(() => {
    const map = new Map<string, string>();
    const parsed = agendaFormSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!map.has(key)) map.set(key, issue.message);
      }
    }
    return map;
  }, [values]);

  const errorAt = React.useCallback(
    (path: string) => issues.get(path),
    [issues],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    form.moveFieldValues("agendaItems", from, to);
  }

  const addItem = (item: AgendaItemValues) => form.pushFieldValue("agendaItems", item);

  return (
    <TooltipProvider>
      <section
        aria-labelledby="agenda-editor-heading"
        className="grid gap-4 [--field-name:320px] [--panelist-name:300px]"
      >
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="agenda-editor-heading"
              className="text-[20px] font-semibold tracking-[-0.03em]"
            >
              Run of show
            </h2>
            <p className="mt-1 text-[13px] text-text-muted">
              {items.length} {items.length === 1 ? "item" : "items"}
              <span aria-hidden> · </span>
              <span className="tabular">{programmeMinutes}</span> min total
            </p>
          </div>
        </header>

        {items.length === 0 ? (
          <Card className="grid place-items-center gap-3 border-dashed px-6 py-12 text-center">
            <CalendarPlus className="size-6 text-text-subtle" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold">Nothing scheduled yet</p>
              <p className="mt-1 text-[13px] text-text-muted">
                Add a speaker or a panel to start building the run of show.
              </p>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="primary" onClick={() => addItem(makeSpeakerItem())}>
                <Mic className="size-4" aria-hidden />
                Add speaker
              </Button>
              <Button type="button" variant="secondary" onClick={() => addItem(makePanelItem())}>
                <Users className="size-4" aria-hidden />
                Add panel
              </Button>
            </div>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="grid list-none gap-3 p-0">
                {items.map((item, index) => (
                  <SortableAgendaItem
                    key={item.id}
                    item={item}
                    index={index}
                    title={agendaItemTitle(item, index)}
                    needsDeleteConfirmation={itemHasContent(item)}
                    onDelete={() => form.removeFieldValue("agendaItems", index)}
                  >
                    {item.type === "speaker" ? (
                      <SpeakerFields
                        itemId={item.id}
                        name={item.speaker.name}
                        durationMinutes={item.durationMinutes}
                        nameError={errorAt(`agendaItems.${index}.speaker.name`)}
                        durationError={errorAt(`agendaItems.${index}.durationMinutes`)}
                        onNameChange={(name) =>
                          form.setFieldValue(`agendaItems[${index}].speaker.name`, name)
                        }
                        /* Speaker duration and item duration are one value. */
                        onDurationChange={(minutes) =>
                          form.setFieldValue(`agendaItems[${index}].durationMinutes`, minutes)
                        }
                        onBlur={() => form.validateAllFields("change")}
                      />
                    ) : (
                      <PanelFields
                        itemId={item.id}
                        host={item.panel.host}
                        durationMinutes={item.durationMinutes}
                        defaultPanelistMinutes={item.panel.defaultPanelistMinutes}
                        panelists={item.panel.panelists}
                        usedMinutes={usedPanelMinutes(item)}
                        remainingMinutes={remainingPanelMinutes(item)}
                        errors={{
                          host: errorAt(`agendaItems.${index}.panel.host`),
                          duration: errorAt(`agendaItems.${index}.durationMinutes`),
                          defaultMinutes: errorAt(
                            `agendaItems.${index}.panel.defaultPanelistMinutes`,
                          ),
                          panelists: errorAt(`agendaItems.${index}.panel.panelists`),
                          panelistName: (row) =>
                            errorAt(`agendaItems.${index}.panel.panelists.${row}.name`),
                          panelistDuration: (row) =>
                            errorAt(
                              `agendaItems.${index}.panel.panelists.${row}.durationMinutes`,
                            ),
                        }}
                        onHostChange={(host) =>
                          form.setFieldValue(`agendaItems[${index}].panel.host`, host)
                        }
                        onDurationChange={(minutes) =>
                          form.setFieldValue(`agendaItems[${index}].durationMinutes`, minutes)
                        }
                        onDefaultMinutesChange={(minutes) =>
                          form.setFieldValue(
                            `agendaItems[${index}].panel.defaultPanelistMinutes`,
                            minutes,
                          )
                        }
                        onPanelistNameChange={(row, name) =>
                          form.setFieldValue(
                            `agendaItems[${index}].panel.panelists[${row}].name`,
                            name,
                          )
                        }
                        onPanelistDurationChange={(row, minutes) =>
                          form.setFieldValue(
                            `agendaItems[${index}].panel.panelists[${row}].durationMinutes`,
                            minutes,
                          )
                        }
                        onAddPanelist={() =>
                          form.pushFieldValue(
                            `agendaItems[${index}].panel.panelists`,
                            makePanelist(item.panel.defaultPanelistMinutes),
                          )
                        }
                        onRemovePanelist={(row) =>
                          form.removeFieldValue(
                            `agendaItems[${index}].panel.panelists`,
                            row,
                          )
                        }
                        onMovePanelist={(from, to) =>
                          form.moveFieldValues(
                            `agendaItems[${index}].panel.panelists`,
                            from,
                            to,
                          )
                        }
                        onApplyToAll={() =>
                          item.panel.panelists.forEach((_, row) =>
                            form.setFieldValue(
                              `agendaItems[${index}].panel.panelists[${row}].durationMinutes`,
                              item.panel.defaultPanelistMinutes,
                            ),
                          )
                        }
                        onBlur={() => form.validateAllFields("change")}
                      />
                    )}
                  </SortableAgendaItem>
                ))}
              </ul>
            </SortableContext>

            {/*
              * The overlay carries the card at its real width with a lifted
              * shadow, so the row being moved stays legible while the gap it
              * leaves shows where it will land.
              */}
            <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.25,1,0.5,1)" }}>
              {activeItem ? (
                <Card className="flex items-center gap-3 px-4 py-3 shadow-[0_18px_40px_rgba(20,16,38,0.2)]">
                  {activeItem.type === "panel" ? (
                    <Users className="size-4 text-violet" aria-hidden />
                  ) : (
                    <Mic className="size-4 text-violet" aria-hidden />
                  )}
                  <span className="text-[15px] font-semibold">
                    {agendaItemTitle(
                      activeItem,
                      items.findIndex((item) => item.id === activeItem.id),
                    )}
                  </span>
                  <span className="tabular ml-auto text-[12px] text-text-subtle">
                    {activeItem.durationMinutes} min
                  </span>
                </Card>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="dashed"
              className="flex-1"
              onClick={() => addItem(makeSpeakerItem())}
            >
              <Plus className="size-4" aria-hidden />
              Add speaker
            </Button>
            <Button
              type="button"
              variant="dashed"
              className="flex-1"
              onClick={() => addItem(makePanelItem())}
            >
              <Plus className="size-4" aria-hidden />
              Add panel
            </Button>
          </div>
        )}

        {typeof fieldErrors.onChange === "string" && (
          <p role="alert" className="text-[12px] font-medium text-over">
            {fieldErrors.onChange}
          </p>
        )}
      </section>
    </TooltipProvider>
  );
}
