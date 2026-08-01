import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEditor } from "@/components/event-editor";
import { makeEvent } from "@/lib/store";

const navigation = vi.hoisted(() => ({
  params: { eventId: undefined as string | undefined },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigation.params,
  useRouter: () => ({ push: navigation.push }),
}));

describe("EventEditor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigation.params = { eventId: undefined };
    navigation.push.mockClear();
  });

  it("does not server-render generated agenda ids", () => {
    const html = renderToString(<EventEditor />);

    expect(html).toContain('aria-label="Loading event editor"');
    expect(html).not.toContain("DndDescribedBy");
    expect(html).not.toContain("-speaker-name");
  });

  it("lets both Return to control buttons navigate without requiring a save", async () => {
    const event = makeEvent("Live event");
    event.status = "live";
    navigation.params = { eventId: event.id };
    // The offline cache for one event, which is what the controller hook paints
    // from before the server answers.
    window.localStorage.setItem(
      `aura:event:${event.id}`,
      JSON.stringify({ event, version: 3, cachedAt: Date.now() }),
    );

    render(<EventEditor />);

    const buttons = await screen.findAllByRole("button", { name: "Return to control" });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    expect(navigation.push).toHaveBeenLastCalledWith(`/events/${event.id}`);

    navigation.push.mockClear();
    fireEvent.click(buttons[1]);
    expect(navigation.push).toHaveBeenLastCalledWith(`/events/${event.id}`);
  });
});
