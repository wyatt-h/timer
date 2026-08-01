import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomTimer } from "@/components/zoom/zoom-timer";
import { resetZoomSdk, setZoomSdkLoader } from "@/lib/zoom/sdk";

const zoomTestState = vi.hoisted(() => ({
  connection: "live" as string,
  hasEvent: true,
  endsInSeconds: 120,
}));

vi.mock("@/lib/store", () => ({
  useZoomEvent: () => {
    if (!zoomTestState.hasEvent) return { result: null, event: null, connection: "idle" };
    const event = {
      id: "event-1",
      name: "Leadership Summit",
      date: "2026-07-31",
      status: "live",
      viewerToken: "viewer-token",
      zoomToken: "A2C4EFGHJK",
      agenda: [
        {
          id: "item-1",
          kind: "single",
          durationSeconds: 600,
          speakers: [{ id: "speaker-1", name: "Maya Chen", durationSeconds: 600 }],
        },
      ],
      runtime: {
        status: "running",
        segmentIndex: 0,
        remainingSeconds: 600,
        endsAt: Date.now() + zoomTestState.endsInSeconds * 1000,
        panelStatus: null,
        panelRemainingSeconds: null,
        panelEndsAt: null,
        updatedAt: 42,
      },
      createdAt: 0,
    };
    return {
      result: { workspace: { team: "demo", events: [event], updatedAt: 0 }, event },
      event,
      connection: zoomTestState.connection,
    };
  },
}));

function fakeSdk(configImplementation?: () => Promise<unknown>) {
  return {
    config:
      configImplementation ??
      vi.fn(async () => ({
        runningContext: "inMeeting",
        unsupportedApis: [],
        clientVersion: "6.1.0",
        browserVersion: "cef/120",
        product: "desktop",
      })),
    getSupportedJsApis: vi.fn(async () => ({
      supportedApis: [
        "getRunningContext",
        "getSupportedJsApis",
        "setDynamicIndicator",
        "getDynamicIndicator",
        "removeDynamicIndicator",
        "extendDynamicIndicator",
        "onSetDynamicIndicator",
        "onRemoveDynamicIndicator",
        "onExtendDynamicIndicator",
      ],
    })),
    getRunningContext: vi.fn(async () => ({ context: "inMeeting" })),
    setDynamicIndicator: vi.fn<(options: unknown) => Promise<{ message: string }>>(async () => ({
      message: "Success",
    })),
    extendDynamicIndicator: vi.fn(async () => ({ message: "Success" })),
    removeDynamicIndicator: vi.fn(async () => ({ message: "Success" })),
    getDynamicIndicator: vi.fn(async () => ({ participantUUID: "u", screenName: "Operator" })),
    onSetDynamicIndicator: vi.fn(),
    onRemoveDynamicIndicator: vi.fn(),
    onExtendDynamicIndicator: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  zoomTestState.connection = "live";
  zoomTestState.hasEvent = true;
  zoomTestState.endsInSeconds = 120;
  window.localStorage.clear();
  window.localStorage.setItem("timer:zoom-code", "A2C4EFGHJK");
  resetZoomSdk();
});

afterEach(() => {
  setZoomSdkLoader(null);
  resetZoomSdk();
  vi.clearAllMocks();
});

describe("ZoomTimer outside Zoom", () => {
  it("shows a preview instead of crashing when there is no Zoom bridge", async () => {
    setZoomSdkLoader(async () =>
      fakeSdk(async () => {
        throw new Error("The Zoom Apps SDK is not supported by this browser");
      }) as never,
    );

    render(<ZoomTimer />);

    expect(await screen.findByText("Preview only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync to Zoom/ })).toBeDisabled();
  });

  it("still previews the authoritative countdown", async () => {
    setZoomSdkLoader(async () =>
      fakeSdk(async () => {
        throw new Error("The Zoom Apps SDK is not supported by this browser");
      }) as never,
    );

    render(<ZoomTimer />);

    expect(await screen.findByText("Leadership Summit")).toBeInTheDocument();
    expect(await screen.findByText("Maya Chen")).toBeInTheDocument();
    expect(await screen.findByText("02:00")).toBeInTheDocument();
  });
});

describe("ZoomTimer inside a meeting", () => {
  it("publishes nothing until the operator asks for it", async () => {
    const sdk = fakeSdk();
    setZoomSdkLoader(async () => sdk as never);

    render(<ZoomTimer />);
    await screen.findByRole("button", { name: /Sync to Zoom/ });
    await new Promise((resolve) => window.setTimeout(resolve, 700));

    expect(sdk.setDynamicIndicator).not.toHaveBeenCalled();
    expect(screen.getByText("Nothing is shared with the meeting yet.")).toBeInTheDocument();
  });

  it("publishes the countdown once, and says the meeting can see it", async () => {
    const sdk = fakeSdk();
    setZoomSdkLoader(async () => sdk as never);

    render(<ZoomTimer />);
    await userEvent.click(await screen.findByRole("button", { name: /Sync to Zoom/ }));

    await waitFor(
      () => expect(sdk.setDynamicIndicator).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    const options = sdk.setDynamicIndicator.mock.calls[0][0] as {
      text: string;
      timer: { action: string; direction: string; start: number; withSound: boolean };
    };
    expect(options.text).toBe("Maya Chen");
    expect(options.timer).toMatchObject({
      action: "start",
      direction: "down",
      withSound: false,
    });
    expect(options.timer.start).toBeGreaterThan(115);
    expect(options.timer.start).toBeLessThanOrEqual(120);

    expect(
      await screen.findByText("Everyone in this meeting can see this timer."),
    ).toBeInTheDocument();

    // The reconciler must not republish an unchanged countdown.
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    expect(sdk.setDynamicIndicator).toHaveBeenCalledTimes(1);
  });

  it("retracts the indicator when the operator stops sharing", async () => {
    const sdk = fakeSdk();
    setZoomSdkLoader(async () => sdk as never);

    render(<ZoomTimer />);
    await userEvent.click(await screen.findByRole("button", { name: /Sync to Zoom/ }));
    await waitFor(() => expect(sdk.setDynamicIndicator).toHaveBeenCalled(), { timeout: 3000 });

    await userEvent.click(screen.getByRole("button", { name: "Stop sharing timer" }));

    await waitFor(() => expect(sdk.removeDynamicIndicator).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
  });

  it("cannot publish when no event is connected", async () => {
    zoomTestState.hasEvent = false;
    window.localStorage.clear();
    setZoomSdkLoader(async () => fakeSdk() as never);

    render(<ZoomTimer />);

    expect(await screen.findByText(/create its Zoom code/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync to Zoom/ })).toBeDisabled();
  });
});
