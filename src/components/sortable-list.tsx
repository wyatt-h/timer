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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

type SortableItemControls = {
  dragHandleRef: (element: HTMLElement | null) => void;
  handleProps: Record<string, unknown>;
  isDragging: boolean;
  disabled: boolean;
};

type SortableListProps<Item extends { id: string }> = {
  items: Item[];
  scope: string;
  onReorder: (items: Item[]) => void;
  isItemDisabled?: (item: Item, index: number) => boolean;
  className?: string;
  renderItem: (item: Item, index: number, controls: SortableItemControls) => React.ReactNode;
};

function SortableRow<Item extends { id: string }>({
  item,
  disabled,
  render,
}: {
  item: Item;
  disabled: boolean;
  render: (controls: SortableItemControls) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-40")}
    >
      {render({
        dragHandleRef: setActivatorNodeRef,
        handleProps: { ...attributes, ...listeners },
        isDragging,
        disabled,
      })}
    </div>
  );
}

/**
 * Vertical sortable list.
 *
 * Dragging is bound to the handle each row opts into, so text selection and
 * input interaction keep working everywhere else. Keyboard dragging comes
 * from dnd-kit's sensor: focus a handle, press space, move with the arrows.
 */
export function SortableList<Item extends { id: string }>({
  items,
  scope,
  onReorder,
  isItemDisabled,
  className,
  renderItem,
}: SortableListProps<Item>) {
  const sensors = useSensors(
    /* A small threshold keeps a plain click on the handle from starting a drag. */
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  return (
    <DndContext
      id={scope}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              disabled={isItemDisabled?.(item, index) ?? false}
              render={(controls) => renderItem(item, index, controls)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
