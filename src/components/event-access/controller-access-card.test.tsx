import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ControllerAccessCard } from "@/components/event-access/controller-access-card";

const accessMocks = vi.hoisted(() => ({
  changeControllerPassword: vi.fn(),
  createEventInvite: vi.fn(),
  revokeEventInvite: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/lib/event-auth/client", () => ({
  changeControllerPassword: accessMocks.changeControllerPassword,
  createEventInvite: accessMocks.createEventInvite,
  revokeEventInvite: accessMocks.revokeEventInvite,
}));

describe("ControllerAccessCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.createEventInvite.mockResolvedValue({
      ok: true,
      data: {
        inviteId: "9de34455-4344-4ba0-a0b0-bd05015383c7",
        inviteUrl: "https://timer.example/invite#share-token",
        expiresAt: "2026-08-02T17:00:00.000Z",
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: accessMocks.writeText },
    });
    accessMocks.writeText.mockResolvedValue(undefined);
  });

  it("starts collapsed and copies only the reusable invitation URL", async () => {
    render(
      <ControllerAccessCard
        eventId="7ee15526-144a-46a4-abab-a49d23c61541"
        loginName="friday-night"
        onSignOut={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const details = screen.getByText("Event access").closest("details");
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Event access"));
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));

    expect(await screen.findByText(/used multiple times for 24 hours/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(accessMocks.writeText).toHaveBeenCalledWith(
        "https://timer.example/invite#share-token",
      ),
    );
  });
});
