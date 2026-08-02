import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: /Next part/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo Changes" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(update).toHaveBeenCalledOnce();
    const updater = update.mock.calls[0][0];
    expect(updater(event).agenda[1].speakers[0].name).toBe("Updated speaker");
    expect(screen.getByRole("button", { name: /Next part/i })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: /Next part/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Undo Changes" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Next part/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "No unsaved changes" })).toBeDisabled();
  });

  it("resets the current topic to its full duration and pauses it", () => {
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
});
