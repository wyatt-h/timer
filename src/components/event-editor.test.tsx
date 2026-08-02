import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
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

  it("requires empty, valid event access before opening the new-event editor", async () => {
    render(<EventEditor />);

    expect(await screen.findByRole("heading", { name: "Set access for new event" })).toBeInTheDocument();
    const loginName = screen.getByLabelText("Event login name") as HTMLElement & {
      value: string;
    };
    expect(loginName.getAttribute("value") ?? "").toBe("");
    expect(screen.queryByLabelText("Event name")).not.toBeInTheDocument();

    loginName.value = "event-access";
    fireEvent.input(loginName);

    const password = screen.getByLabelText("Event password") as HTMLElement & { value: string };
    password.value = "123456";
    fireEvent.input(password);
    const confirmation = screen.getByLabelText("Repeat the password") as HTMLElement & {
      value: string;
    };
    confirmation.value = "123456";
    fireEvent.input(confirmation);

    fireEvent.click(screen.getByRole("button", { name: "Continue to event details" }));

    expect(await screen.findByLabelText("Event name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change access" })).toBeInTheDocument();
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

  it("saves an existing event without submitting an ancestor form or navigating home", async () => {
    const event = makeEvent("Original event");
    navigation.params = { eventId: event.id };
    window.localStorage.setItem(
      `aura:event:${event.id}`,
      JSON.stringify({ event, version: 3, cachedAt: Date.now() }),
    );
    const submitted = vi.fn<(event: FormEvent) => void>((formEvent) => {
      formEvent.preventDefault();
    });

    render(
      <form onSubmit={submitted}>
        <EventEditor />
      </form>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    expect(submitted).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
