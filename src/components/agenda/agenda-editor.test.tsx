import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgendaEditor } from "@/components/agenda/agenda-editor";
import type { AgendaFormValues } from "@/lib/agenda-schema";

function seed(): AgendaFormValues {
  return {
    agendaItems: [
      {
        id: "item-speaker",
        type: "speaker",
        durationMinutes: 12,
        speaker: { name: "Maya Chen" },
      },
      {
        id: "item-panel",
        type: "panel",
        durationMinutes: 30,
        panel: {
          host: "Ana Torres",
          defaultPanelistMinutes: 5,
          panelists: [
            { id: "pan-1", name: "Noah", durationMinutes: 8 },
            { id: "pan-2", name: "Sofia", durationMinutes: 7 },
          ],
        },
      },
    ],
  };
}

function renderEditor() {
  const onChange = vi.fn();
  render(<AgendaEditor defaultValues={seed()} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

const latest = (onChange: ReturnType<typeof vi.fn>): AgendaFormValues =>
  onChange.mock.calls.at(-1)![0];

describe("AgendaEditor", () => {
  it("renders one card per agenda item with a running total", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: "Maya Chen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Panel led by Ana Torres" })).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument(); // 12 + 30
  });

  it("adds a speaker item", async () => {
    const { onChange, user } = renderEditor();
    await user.click(screen.getByRole("button", { name: /add speaker/i }));
    expect(latest(onChange).agendaItems).toHaveLength(3);
    expect(latest(onChange).agendaItems.at(-1)!.type).toBe("speaker");
  });

  it("adds a panel item seeded with two panelists", async () => {
    const { onChange, user } = renderEditor();
    await user.click(screen.getByRole("button", { name: /add panel$/i }));
    const added = latest(onChange).agendaItems.at(-1)!;
    expect(added.type).toBe("panel");
    expect(added.type === "panel" && added.panel.panelists).toHaveLength(2);
  });

  it("deletes an untouched item without confirming", async () => {
    const { onChange, user } = renderEditor();
    await user.click(screen.getByRole("button", { name: /add speaker/i }));
    expect(latest(onChange).agendaItems).toHaveLength(3);

    const cards = screen.getAllByRole("listitem");
    await user.click(
      within(cards.at(-1)!).getByRole("button", { name: /^remove speaker 3$/i }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(latest(onChange).agendaItems).toHaveLength(2);
  });

  it("confirms before deleting an item that holds entered data", async () => {
    const { onChange, user } = renderEditor();
    await user.click(screen.getByRole("button", { name: /remove maya chen/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/remove maya chen\?/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /keep it/i }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /remove maya chen/i }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /^remove$/i }),
    );
    expect(latest(onChange).agendaItems).toHaveLength(1);
  });

  it("does not offer a way to change an item's type once it exists", () => {
    renderEditor();
    /* The type is decided when the item is created and fixed thereafter. */
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /panel discussion/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^panel$/i })).not.toBeInTheDocument();
  });

  it("edits a speaker name through form state", async () => {
    const { onChange, user } = renderEditor();
    const input = screen.getByLabelText("Speaker");
    await user.clear(input);
    await user.type(input, "Elena Park");
    expect(latest(onChange).agendaItems[0]).toMatchObject({
      speaker: { name: "Elena Park" },
    });
  });

  it("adds and removes panelists", async () => {
    const { onChange, user } = renderEditor();
    await user.click(screen.getByRole("button", { name: /add panelist/i }));
    let panel = latest(onChange).agendaItems[1];
    expect(panel.type === "panel" && panel.panel.panelists).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /remove noah/i }));
    panel = latest(onChange).agendaItems[1];
    expect(panel.type === "panel" && panel.panel.panelists.map((p) => p.name)).toEqual([
      "Sofia",
      "",
    ]);
  });

  it("keeps the last panelist undeletable", () => {
    render(
      <AgendaEditor
        defaultValues={{
          agendaItems: [
            {
              id: "solo",
              type: "panel",
              durationMinutes: 20,
              panel: {
                host: "Ana",
                defaultPanelistMinutes: 5,
                panelists: [{ id: "only", name: "Noah", durationMinutes: 5 }],
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: /remove noah/i })).toBeDisabled();
  });

  it("applies the default duration to every panelist", async () => {
    const { onChange, user } = renderEditor();
    await user.click(screen.getByRole("button", { name: /apply to all/i }));
    const panel = latest(onChange).agendaItems[1];
    expect(panel.type === "panel" && panel.panel.panelists.map((p) => p.durationMinutes)).toEqual([
      5, 5,
    ]);
    /* Names survive — only durations are copied. */
    expect(panel.type === "panel" && panel.panel.panelists.map((p) => p.name)).toEqual([
      "Noah",
      "Sofia",
    ]);
  });

  it("shows used and remaining minutes derived from the rows", async () => {
    const { user } = renderEditor();
    /* 8 + 7 used of a 30 min panel. */
    expect(screen.getByText("Used").nextElementSibling).toHaveTextContent("15 min");
    expect(screen.getByText("Left").nextElementSibling).toHaveTextContent("15 min");

    /* Both figures are derived, so editing a row moves them together. */
    const noah = screen.getByLabelText(/minutes for noah/i);
    await user.clear(noah);
    await user.type(noah, "12");
    await user.tab();
    expect(screen.getByText("Used").nextElementSibling).toHaveTextContent("19 min");
    expect(screen.getByText("Left").nextElementSibling).toHaveTextContent("11 min");
  });

  it("reports a panel-level error when panelists overrun the panel", async () => {
    const { user } = renderEditor();
    const noahMinutes = screen.getByLabelText(/minutes for noah/i);
    await user.clear(noahMinutes);
    await user.type(noahMinutes, "40");
    await user.tab();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/over the 30 min panel/i);
  });

  it("surfaces a required-field error next to a blank name", async () => {
    const { user } = renderEditor();
    const host = screen.getByLabelText("Panel host");
    await user.clear(host);
    await user.tab();
    expect(await screen.findByText(/host name is required/i)).toBeInTheDocument();
    expect(host).toHaveAttribute("aria-invalid", "true");
  });

  it("shows an empty state when every item is removed", async () => {
    const { user } = renderEditor();
    for (const name of [/remove maya chen/i, /remove panel led by ana torres/i]) {
      await user.click(screen.getByRole("button", { name }));
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: /^remove$/i }),
      );
    }
    expect(screen.getByText(/nothing scheduled yet/i)).toBeInTheDocument();
  });

  /*
   * dnd-kit resolves drop targets from measured element rects, and jsdom
   * reports every element as 0x0, so a simulated keyboard drag never finds a
   * target. The reorder itself is a pure form operation, so it is exercised
   * directly here; the wiring from sensor to form is covered by the handle's
   * accessible name and by manual testing in a real browser.
   */
  it("moves an agenda item without disturbing its field values", () => {
    const values = seed();
    const moved = {
      agendaItems: (() => {
        const next = [...values.agendaItems];
        const [lifted] = next.splice(0, 1);
        next.splice(1, 0, lifted);
        return next;
      })(),
    };
    expect(moved.agendaItems.map((item) => item.id)).toEqual([
      "item-panel",
      "item-speaker",
    ]);
    const speaker = moved.agendaItems[1];
    expect(speaker.type === "speaker" && speaker.speaker.name).toBe("Maya Chen");
    expect(speaker.durationMinutes).toBe(12);
    const panel = moved.agendaItems[0];
    expect(panel.type === "panel" && panel.panel.panelists.map((p) => p.name)).toEqual([
      "Noah",
      "Sofia",
    ]);
  });

  it("moves a panelist keeping each name with its own duration", () => {
    const panel = seed().agendaItems[1];
    if (panel.type !== "panel") throw new Error("expected a panel");
    const next = [...panel.panel.panelists];
    const [lifted] = next.splice(0, 1);
    next.splice(1, 0, lifted);
    expect(next).toEqual([
      { id: "pan-2", name: "Sofia", durationMinutes: 7 },
      { id: "pan-1", name: "Noah", durationMinutes: 8 },
    ]);
  });

  it("keeps an edited value bound to its item id, which is what survives a move", async () => {
    const { onChange, user } = renderEditor();

    const speakerName = screen.getByLabelText("Speaker");
    await user.clear(speakerName);
    await user.type(speakerName, "Elena Park");

    /* Reordering moves whole objects, so an edit held against a stable id
       cannot be stranded on the wrong row. */
    const edited = latest(onChange).agendaItems.find((item) => item.id === "item-speaker")!;
    expect(edited.type === "speaker" && edited.speaker.name).toBe("Elena Park");

    const handle = screen.getByRole("button", { name: /^reorder elena park/i });
    expect(handle).toHaveAccessibleName(/press space, then use the arrow keys/i);
  });

  it("gives every drag handle an accessible name", () => {
    renderEditor();
    const handles = screen.getAllByRole("button", { name: /^reorder /i });
    /* Two cards plus two panelist rows. */
    expect(handles.length).toBeGreaterThanOrEqual(4);
    handles.forEach((handle) =>
      expect(handle).toHaveAccessibleName(/press space, then use the arrow keys/i),
    );
  });

  it("states each item's type as text alongside an icon", () => {
    renderEditor();
    /* Not colour alone: each card states its type in words. The heading row
       is scoped explicitly because "Speaker" is also a field label. */
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0].closest("div")?.parentElement).toHaveTextContent("Speaker");
    expect(headings[1].closest("div")?.parentElement).toHaveTextContent("Panel");
  });
});
