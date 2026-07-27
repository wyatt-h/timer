"use client";

import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";
import type { KeyboardEventHandler, RefCallback, ReactNode } from "react";
import { useEffect, useState } from "react";

type SortableItemControls = {
  dragHandleRef: RefCallback<HTMLElement>;
  isDragging: boolean;
  isDropTarget: boolean;
  disabled: boolean;
  onHandleKeyDown: KeyboardEventHandler<HTMLElement>;
};

type SortableListProps<Item extends { id: string }> = {
  items: Item[];
  scope: string;
  onReorder: (items: Item[]) => void;
  isItemDisabled?: (item: Item, index: number) => boolean;
  className?: string;
  renderItem: (item: Item, index: number, controls: SortableItemControls) => ReactNode;
};

function SortableRow<Item extends { id: string }>({
  item,
  scope,
  disabled,
  onMove,
  render,
}: {
  item: Item;
  scope: string;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
  render: (controls: SortableItemControls) => ReactNode;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [dragHandle, setDragHandle] = useState<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);

  useEffect(() => {
    if (!element || !dragHandle || disabled) return;
    const cleanupDraggable = draggable({
      element,
      dragHandle,
      getInitialData: () => ({ id: item.id, scope }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
    const cleanupDropTarget = dropTargetForElements({
      element,
      getData: () => ({ id: item.id, scope }),
      canDrop: ({ source }) => source.data.scope === scope && source.data.id !== item.id,
      onDragEnter: () => setIsDropTarget(true),
      onDragLeave: () => setIsDropTarget(false),
      onDrop: () => setIsDropTarget(false),
    });

    return () => {
      cleanupDraggable();
      cleanupDropTarget();
    };
  }, [disabled, dragHandle, element, item.id, scope]);

  return (
    <div
      ref={setElement}
      className={`sortable-row${isDragging ? " is-dragging" : ""}${
        isDropTarget ? " is-drop-target" : ""
      }`}
    >
      {render({
        dragHandleRef: setDragHandle,
        isDragging,
        isDropTarget,
        disabled,
        onHandleKeyDown: (event) => {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1);
        },
      })}
    </div>
  );
}

export function SortableList<Item extends { id: string }>({
  items,
  scope,
  onReorder,
  isItemDisabled,
  className,
  renderItem,
}: SortableListProps<Item>) {
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.scope === scope,
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0];
          const sourceIndex = items.findIndex((item) => item.id === source.data.id);
          const targetIndex = items.findIndex((item) => item.id === target?.data.id);
          if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
          onReorder(reorder({ list: items, startIndex: sourceIndex, finishIndex: targetIndex }));
        },
      }),
    [items, onReorder, scope],
  );

  return (
    <div className={className}>
      {items.map((item, index) => (
        <SortableRow
          key={item.id}
          item={item}
          scope={scope}
          disabled={isItemDisabled?.(item, index) ?? false}
          onMove={(direction) => {
            const finishIndex = index + direction;
            if (
              finishIndex < 0 ||
              finishIndex >= items.length ||
              isItemDisabled?.(item, index) ||
              isItemDisabled?.(items[finishIndex], finishIndex)
            ) {
              return;
            }
            onReorder(reorder({ list: items, startIndex: index, finishIndex }));
          }}
          render={(controls) => renderItem(item, index, controls)}
        />
      ))}
    </div>
  );
}
