import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudienceDisplay } from "@/components/audience-display";

const audienceTestState = vi.hoisted(() => ({
  timerFinished: false,
  play: vi.fn(),
  unlock: vi.fn(),
  disable: vi.fn(),
  remoteSoundEnabled: true,
  remoteSpeakerMuted: false,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "viewer-token" }),
}));

vi.mock("@/lib/store", () => ({
  usePublicEvent: () => {
    const event = {
      id: "event-1",
      name: "Leadership Summit",
      date: "2026-07-27",
      status: "live",
      viewerToken: "viewer-token",
      agenda: [
        {
          id: "item-1",
          kind: "single",
          durationSeconds: 10 * 60,
          speakers: [
            {
              id: "speaker-1",
              name: "Eddie",
              durationSeconds: 10 * 60,
              soundMuted: audienceTestState.remoteSpeakerMuted,
            },
          ],
        },
      ],
      runtime: {
        status: audienceTestState.timerFinished ? "running" : "paused",
        segmentIndex: 0,
        remainingSeconds: audienceTestState.timerFinished ? 0 : 10 * 60,
        endsAt: audienceTestState.timerFinished ? 1 : null,
        panelStatus: null,
        panelRemainingSeconds: null,
        panelEndsAt: null,
        updatedAt: 0,
        soundEnabled: audienceTestState.remoteSoundEnabled,
      },
      createdAt: 0,
    };
    // The hook reports the event and how the connection to it is doing.
    return { event, connection: "live" as const };
  },
}));

vi.mock("@/lib/use-chime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/use-chime")>();
  return {
    ...actual,
    useChime: () => ({
      play: audienceTestState.play,
      unlock: audienceTestState.unlock,
      disable: audienceTestState.disable,
      isReady: true,
    }),
  };
});

vi.mock("@/lib/use-wake-lock", () => ({
  useWakeLock: vi.fn(),
}));

describe("AudienceDisplay", () => {
  beforeEach(() => {
    audienceTestState.timerFinished = false;
    audienceTestState.remoteSoundEnabled = true;
    audienceTestState.remoteSpeakerMuted = false;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders a dark background with the radial light effect", () => {
    const { container } = render(<AudienceDisplay />);
    const main = container.querySelector("main");

    expect(main).not.toBeNull();
    expect(main!.style.backgroundColor).not.toBe("");
    expect(main!.style.backgroundImage).toContain("radial-gradient");
  });

  it("lets the audience display turn its enabled sound back off", () => {
    render(<AudienceDisplay />);

    fireEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(audienceTestState.disable).toHaveBeenCalledOnce();
  });

  it("plays the alarm when a running speaker crosses zero", async () => {
    audienceTestState.timerFinished = true;
    render(<AudienceDisplay />);

    await waitFor(() =>
      expect(audienceTestState.play).toHaveBeenCalledWith("feather"),
    );
  });

  it("keeps sound local even if legacy event sound flags are muted", async () => {
    audienceTestState.timerFinished = true;
    audienceTestState.remoteSoundEnabled = false;
    audienceTestState.remoteSpeakerMuted = true;
    render(<AudienceDisplay />);

    await waitFor(() =>
      expect(audienceTestState.play).toHaveBeenCalledWith("feather"),
    );
  });

  it("previews each alarm option from the sound picker", () => {
    render(<AudienceDisplay />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose alarm sound. Current: Feather bell",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Warm marimba" }),
    );

    expect(audienceTestState.play).toHaveBeenCalledWith("warm");
  });

  it("saves the selected alarm sound and previews it", () => {
    render(<AudienceDisplay />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose alarm sound. Current: Feather bell",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select Airy glass" }),
    );

    expect(window.localStorage.getItem("timer:audience-chime")).toBe("airy");
    expect(audienceTestState.play).toHaveBeenCalledWith("airy");
    expect(
      screen.getByRole("button", {
        name: "Choose alarm sound. Current: Airy glass",
      }),
    ).toBeInTheDocument();
  });

  it("restores the saved alarm sound after refresh", async () => {
    window.localStorage.setItem("timer:audience-chime", "double");
    render(<AudienceDisplay />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Choose alarm sound. Current: Soft double tap",
        }),
      ).toBeInTheDocument(),
    );
  });
});
