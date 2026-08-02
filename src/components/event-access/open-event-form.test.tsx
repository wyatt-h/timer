import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenEventForm } from "@/components/event-access/open-event-form";
import { makeEvent } from "@/lib/store";

const loginToEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/event-auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event-auth/client")>()),
  loginToEvent,
}));

describe("OpenEventForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
    loginToEvent.mockReset();
  });

  it("blocks native submission and runs validation from the explicit button", async () => {
    const onOpened = vi.fn();
    const { container } = render(<OpenEventForm onOpened={onOpened} />);
    const form = container.querySelector("form");
    const button = screen.getByRole("button", { name: "Open event" });

    expect(button).toHaveAttribute("type", "button");
    expect(form).toHaveAttribute("novalidate");

    fireEvent.submit(form!);
    expect(loginToEvent).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(await screen.findByText("Enter the event login name and password.")).toBeInTheDocument();
    expect(loginToEvent).not.toHaveBeenCalled();
  });

  it("opens an event only after the manual action succeeds", async () => {
    const onOpened = vi.fn();
    render(<OpenEventForm onOpened={onOpened} />);
    const event = makeEvent("Existing event");
    loginToEvent.mockResolvedValueOnce({
      ok: true,
      data: { event, loginName: "existing-event", version: 4 },
    });

    const loginName = screen.getByLabelText("Event login name") as HTMLElement & { value: string };
    const password = screen.getByLabelText("Event password") as HTMLElement & { value: string };
    loginName.value = "existing-event";
    fireEvent.input(loginName);
    password.value = "123456";
    fireEvent.input(password);
    fireEvent.click(screen.getByRole("button", { name: "Open event" }));

    expect(loginToEvent).toHaveBeenCalledWith("existing-event", "123456");
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith(expect.objectContaining({ event })));
  });
});
