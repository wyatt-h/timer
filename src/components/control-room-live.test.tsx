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

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(update).toHaveBeenCalledOnce();
    const updater = update.mock.calls[0][0];
    expect(updater(event).agenda[1].speakers[0].name).toBe("Updated speaker");
  });
});
