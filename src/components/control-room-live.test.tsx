import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveConsole } from "@/components/control-room";
import { flattenSegments } from "@/lib/format";
import { makeAgendaItem, makeEvent } from "@/lib/store";
import type { TimerEvent } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ eventId: "event-id" }),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("live run-of-show drafts", () => {
  it("uses neutral timer styling while more than 30 seconds remain", () => {
    const event = makeEvent("Friday Night");
    event.status = "live";

    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={vi.fn()}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    const clock = screen.getByText("10:00");
    expect(clock).toHaveClass("text-ink");
    expect(clock).not.toHaveClass("text-success");
    expect(clock.parentElement).toHaveClass("bg-surface-sunken");
    expect(clock.parentElement).not.toHaveClass("bg-success-soft");
  });

  it("freezes and persists a timer abandoned beyond the overtime limit", async () => {
    const event = makeEvent("Friday Night");
    event.status = "live";
    event.runtime = {
      ...event.runtime,
      status: "running",
      remainingSeconds: 60,
      endsAt: Date.now() - 16 * 60 * 1000,
    };
    const update = vi.fn<(updater: (current: TimerEvent) => TimerEvent) => void>();

    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={update}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    expect(await screen.findByText("−15:00")).toBeInTheDocument();
    expect(screen.getAllByText("Auto-stopped")).toHaveLength(2);
    expect(screen.getByText(/15 min overtime limit reached/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto-stopped" })).toBeDisabled();

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    const persisted = update.mock.calls[0][0](event);
    expect(persisted.runtime).toMatchObject({
      status: "paused",
      remainingSeconds: -900,
      endsAt: null,
    });
  });

  it("does not synchronize typing until Save changes is pressed", () => {
    const event = makeEvent("Friday Night");
    const future = makeAgendaItem("single");
    future.speakers[0].name = "Future speaker";
    event.agenda.push(future);
    event.status = "live";

    const update = vi.fn<(updater: (current: TimerEvent) => TimerEvent) => void>();
    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={update}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    const name = screen.getByLabelText(/Name of the speaker in Future speaker/i) as HTMLElement & {
      value: string;
    };
    name.value = "Updated speaker";
    fireEvent.input(name);

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved modifications")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: /Next part/i });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Undo Changes" })).toBeInTheDocument();

    fireEvent.click(next);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You have unresolved changes. Save or undo them before moving to another part.",
    );
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(update).toHaveBeenCalledOnce();
    const updater = update.mock.calls[0][0];
    expect(updater(event).agenda[1].speakers[0].name).toBe("Updated speaker");
    expect(screen.getByRole("button", { name: /Next part/i })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("undoes a draft without synchronizing it and restores navigation", () => {
    const event = makeEvent("Friday Night");
    const future = makeAgendaItem("single");
    future.speakers[0].name = "Future speaker";
    event.agenda.push(future);
    event.status = "live";
    const update = vi.fn<(updater: (current: TimerEvent) => TimerEvent) => void>();

    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={update}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    const name = screen.getByLabelText(/Name of the speaker in Future speaker/i) as HTMLElement & {
      value: string;
    };
    name.value = "Discard this";
    fireEvent.input(name);
    expect(screen.getByRole("button", { name: /Next part/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo Changes" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Next part/i })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.getByRole("button", { name: "No unsaved changes" })).toBeDisabled();
  });

  it("explains why previous, next-panelist, and panel-skip actions are blocked", () => {
    const event = makeEvent("Friday Night");
    event.agenda[0].speakers[0].name = "Opening";
    const panel = makeAgendaItem("panel");
    const closing = makeAgendaItem("single");
    closing.speakers[0].name = "Closing";
    event.agenda.push(panel, closing);
    event.status = "live";
    event.runtime = {
      ...event.runtime,
      status: "paused",
      segmentIndex: 1,
      remainingSeconds: panel.speakers[0].durationSeconds,
      panelStatus: "ready",
      panelRemainingSeconds: panel.durationSeconds,
    };
    const update = vi.fn<(updater: (current: TimerEvent) => TimerEvent) => void>();

    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={update}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    const name = screen.getByLabelText(/Name of the speaker in Closing/i) as HTMLElement & {
      value: string;
    };
    name.value = "Updated closing";
    fireEvent.input(name);

    const actions = [
      screen.getByRole("button", { name: /Previous/i }),
      screen.getByRole("button", { name: /Next panelist/i }),
      screen.getByRole("button", { name: /Skip the rest of the panel/i }),
    ];
    for (const action of actions) {
      expect(action).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(action);
      expect(screen.getByRole("alert")).toHaveTextContent("You have unresolved changes");
    }

    expect(update).not.toHaveBeenCalled();
    expect(event.runtime.segmentIndex).toBe(1);
  });

  it("confirms before resetting the current topic to its full duration", () => {
    const event = makeEvent("Friday Night");
    event.status = "live";
    event.runtime = {
      ...event.runtime,
      status: "running",
      remainingSeconds: 73,
      endsAt: Date.now() + 73_000,
    };
    const update = vi.fn<(updater: (current: TimerEvent) => TimerEvent) => void>();

    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={update}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset current topic" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Reset the current topic?" })).toBeInTheDocument();
    expect(screen.getByText(/pauses the timer for every connected display/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset topic" }));

    expect(update).toHaveBeenCalledOnce();
    const reset = update.mock.calls[0][0](event);
    expect(reset.runtime).toMatchObject({
      status: "paused",
      remainingSeconds: event.agenda[0].durationSeconds,
      endsAt: null,
      panelStatus: null,
      panelRemainingSeconds: null,
      panelEndsAt: null,
    });
  });

  it("pulses and announces timer adjustments", () => {
    const event = makeEvent("Friday Night");
    event.status = "live";
    const update = vi.fn<(updater: (current: TimerEvent) => TimerEvent) => void>();

    render(
      <LiveConsole
        event={event}
        loginName="friday-night"
        segments={flattenSegments(event)}
        update={update}
        saveState="idle"
        onRetrySave={vi.fn()}
        onDiscardLocal={vi.fn(async () => ({ ok: true }))}
        onKeepLocal={vi.fn(async () => ({ ok: true }))}
        onFlushSaves={vi.fn()}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onSignOut={vi.fn(async () => ({ ok: true }))}
        conflictResolution={null}
      />,
    );

    fireEvent.click(screen.getByTitle("Add fifteen seconds"));
    expect(screen.getByText("Added 15 seconds to the speaker timer.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByText("10:00")).toHaveAttribute("data-adjustment", "added");

    fireEvent.click(screen.getByTitle("Remove fifteen seconds"));
    expect(screen.getByText("Removed 15 seconds from the speaker timer.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByText("10:00")).toHaveAttribute("data-adjustment", "removed");
    expect(update).toHaveBeenCalledTimes(2);
  });
});
