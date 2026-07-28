"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Mic, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DragHandle } from "@/components/agenda/fields";
import type { AgendaItemValues } from "@/lib/agenda-schema";

export type SortableAgendaItemProps = {
  item: AgendaItemValues;
  index: number;
  title: string;
  needsDeleteConfirmation: boolean;
  onDelete: () => void;
  children: React.ReactNode;
};

/**
 * One agenda card.
 *
 * Drag state, type switching and deletion live here; the type-specific fields
 * are passed in as children, which keeps this component free of any knowledge
 * about what a speaker or a panel actually contains.
 */
export function SortableAgendaItem({
  item,
  index,
  title,
  needsDeleteConfirmation,
  onDelete,
  children,
}: SortableAgendaItemProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const isPanel = item.type === "panel";

  function handleDeleteClick() {
    if (needsDeleteConfirmation) setConfirmOpen(true);
    else onDelete();
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/card", isDragging && "opacity-40")}
    >
      <Card className="overflow-hidden transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out-quart)] hover:border-violet/20 hover:shadow-[0_6px_20px_-6px_rgba(32,26,56,0.14)] focus-within:border-violet/25">
        <CardHeader className="flex-wrap justify-between gap-x-2 gap-y-2.5 border-b border-line-soft bg-surface-raised/60">
          <div className="flex min-w-0 items-center gap-2">
            <DragHandle
              ref={setActivatorNodeRef}
              label={title}
              {...attributes}
              {...listeners}
            />
            <span className="tabular w-5 shrink-0 text-[12px] font-bold text-text-subtle/70">
              {index + 1}
            </span>
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
              {title}
            </h3>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/*
              * Type is fixed once an item exists, so this states what the item
              * is rather than offering to change it. The icon carries the
              * distinction alongside the word, so it survives greyscale.
              */}
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                isPanel
                  ? "bg-violet-soft text-violet-dark"
                  : "bg-[#eaf0ff] text-[#3f558f]",
              )}
            >
              {isPanel ? (
                <Users className="size-3.5" aria-hidden />
              ) : (
                <Mic className="size-3.5" aria-hidden />
              )}
              {isPanel ? "Panel" : "Speaker"}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  aria-label={`Remove ${title}`}
                  onClick={handleDeleteClick}
                  className={cn(
                    "text-text-subtle/60 hover:text-over",
                    "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100",
                    "focus-visible:opacity-100 max-sm:opacity-100",
                  )}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove item</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        <CardContent className="pt-4">{children}</CardContent>
      </Card>

      {/*
        * Only asked for when the row holds something worth losing. Deleting an
        * untouched row is not a decision that deserves a modal.
        */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove {title}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isPanel
              ? "The host and every panelist on this item will be removed from the run of show."
              : "This speaker will be removed from the run of show."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
