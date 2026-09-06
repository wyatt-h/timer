import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControllerAccessCard,
  formatEventLoginMessage,
} from "@/components/event-access/controller-access-card";

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
        eventName="Friday Night"
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

  it("formats the shareable message in Chinese", () => {
    expect(
      formatEventLoginMessage({
        eventName: "全球电话会议",
        eventUrl: "https://timer.example/events/event-id",
        loginName: "globalcall0824",
        password: "globalcall0824",
        language: "zh",
      }),
    ).toBe(
      "“全球电话会议”的 Timer 登录信息：请打开 https://timer.example/events/event-id，使用登录名“globalcall0824”和密码“globalcall0824”。",
    );
  });

  it("copies a ready-to-send login message without saving the password", async () => {
    render(
      <ControllerAccessCard
        eventId="7ee15526-144a-46a4-abab-a49d23c61541"
        eventName="Friday Night"
        loginName="friday-night"
        onSignOut={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Event access"));
    fireEvent.click(screen.getByRole("button", { name: "Copy login details" }));

    const password = screen.getByLabelText("Event password") as HTMLElement & { value: string };
    password.value = "friday-night";
    fireEvent.input(password);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() =>
      expect(accessMocks.writeText).toHaveBeenCalledWith(
        "Timer login details for “Friday Night”: open http://localhost:3000/events/7ee15526-144a-46a4-abab-a49d23c61541 and use login name “friday-night” with password “friday-night”.",
      ),
    );
    expect(password.value).toBe("");
    expect(screen.getByText("Login details copied. The password was not saved.")).toBeInTheDocument();
  });
});
