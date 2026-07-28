import { describe, expect, it } from "vitest";
import { render as baseRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SortableAgendaItem } from "@/components/agenda/sortable-agenda-item";
import { SpeakerFields } from "@/components/agenda/speaker-fields";
import type { AgendaItemValues } from "@/lib/agenda-schema";

/*
 * Guards against the class of regression introduced when the hand-written
 * stylesheets were removed: markup that used to be styled by a descendant
 * selector (`.card small { display: block }`) and silently lost its layout
 * once the rule went away. Asserting that key elements carry classes catches
 * that without pinning down specific utility values.
 */
/* Tooltip triggers require their provider, which the editor supplies. */
function render(ui: ReactElement) {
  return baseRender(<TooltipProvider>{ui}</TooltipProvider>);
}

function styled(element: Element | null) {
  return Boolean(element?.getAttribute("class")?.trim());
}

const speakerItem: AgendaItemValues = {
  id: "s1",
  type: "speaker",
  durationMinutes: 12,
  speaker: { name: "Maya Chen" },
};

describe("agenda item presentation", () => {
  it("styles the card heading and type badge", () => {
    render(
      <SortableAgendaItem
        item={speakerItem}
        index={0}
        title="Maya Chen"
        needsDeleteConfirmation={false}
        onDelete={() => {}}
      >
        <div>fields</div>
      </SortableAgendaItem>,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Maya Chen" });
    expect(styled(heading)).toBe(true);

    /* The badge states the type in words, not colour alone. */
    const badge = screen.getByText("Speaker");
    expect(styled(badge)).toBe(true);
  });

  it("labels the speaker fields and their units", () => {
    render(
      <SpeakerFields
        itemId="s1"
        name="Maya Chen"
        durationMinutes={12}
        onNameChange={() => {}}
        onDurationChange={() => {}}
        onBlur={() => {}}
      />,
    );

    expect(screen.getByLabelText("Speaker")).toBeInTheDocument();
    expect(screen.getByLabelText("Duration")).toBeInTheDocument();
    /* The unit sits beside the field rather than inside the label. */
    expect(styled(screen.getByText("min"))).toBe(true);
  });

  it("marks an invalid field for assistive tech, not just visually", () => {
    render(
      <SpeakerFields
        itemId="s1"
        name=""
        durationMinutes={12}
        nameError="Speaker name is required"
        onNameChange={() => {}}
        onDurationChange={() => {}}
        onBlur={() => {}}
      />,
    );

    const input = screen.getByLabelText("Speaker");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Speaker name is required");
  });

  it("keeps the delete control reachable by name even while visually quiet", () => {
    render(
      <SortableAgendaItem
        item={speakerItem}
        index={0}
        title="Maya Chen"
        needsDeleteConfirmation={false}
        onDelete={() => {}}
      >
        <div>fields</div>
      </SortableAgendaItem>,
    );
    const remove = screen.getByRole("button", { name: /remove maya chen/i });
    /* Hidden by opacity, never by display — it stays in the tab order. */
    expect(remove.className).toContain("opacity-0");
    expect(remove.className).toContain("group-hover/card:opacity-100");
  });

  it("gives the drag handle instructions a keyboard user can act on", () => {
    render(
      <SortableAgendaItem
        item={speakerItem}
        index={0}
        title="Maya Chen"
        needsDeleteConfirmation={false}
        onDelete={() => {}}
      >
        <div>fields</div>
      </SortableAgendaItem>,
    );
    const handle = screen.getByRole("button", { name: /^reorder maya chen/i });
    expect(handle).toHaveAccessibleName(/press space, then use the arrow keys/i);
    /* touch-none stops a drag from scrolling the page on a phone. */
    expect(handle.className).toContain("touch-none");
  });

  it("numbers items visibly so position is readable without dragging", () => {
    render(
      <SortableAgendaItem
        item={speakerItem}
        index={3}
        title="Maya Chen"
        needsDeleteConfirmation={false}
        onDelete={() => {}}
      >
        <div>fields</div>
      </SortableAgendaItem>,
    );
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("4")).toBeInTheDocument();
  });
});
