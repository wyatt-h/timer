import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ZOOM_CAPABILITIES,
  initZoomSdk,
  normalizeZoomError,
  publishZoomCommand,
  readZoomIndicator,
  refreshZoomContext,
  registerZoomIndicatorListeners,
  resetZoomSdk,
  setZoomSdkLoader,
} from "@/lib/zoom/sdk";

type Handler = (data: unknown) => void;

/** Stands in for the Zoom client bridge; no real SDK is loaded in tests. */
function fakeSdk(overrides: Partial<Record<string, unknown>> = {}) {
  const listeners = new Map<string, Handler[]>();
  return {
    config: vi.fn(async () => ({
      runningContext: "inMeeting",
      unsupportedApis: [],
      clientVersion: "6.1.0",
      browserVersion: "cef/120",
      product: "desktop",
    })),
    getSupportedJsApis: vi.fn(async () => ({ supportedApis: [...ZOOM_CAPABILITIES] })),
    getRunningContext: vi.fn(async () => ({ context: "inMeeting" })),
    setDynamicIndicator: vi.fn(async () => ({ message: "Success" })),
    setDynamicIndicatorStyle: vi.fn(async () => ({ message: "Success" })),
    extendDynamicIndicator: vi.fn(async () => ({ message: "Success" })),
    removeDynamicIndicator: vi.fn(async () => ({ message: "Success" })),
    getDynamicIndicator: vi.fn(async () => ({
      participantUUID: "uuid",
      screenName: "Operator",
      text: "Maya Chen",
    })),
    onSetDynamicIndicator(handler: Handler) {
      listeners.set("onSetDynamicIndicator", [
        ...(listeners.get("onSetDynamicIndicator") ?? []),
        handler,
      ]);
    },
    onRemoveDynamicIndicator(handler: Handler) {
      listeners.set("onRemoveDynamicIndicator", [
        ...(listeners.get("onRemoveDynamicIndicator") ?? []),
        handler,
      ]);
    },
    onExtendDynamicIndicator(handler: Handler) {
      listeners.set("onExtendDynamicIndicator", [
        ...(listeners.get("onExtendDynamicIndicator") ?? []),
        handler,
      ]);
    },
    removeEventListener(event: string, handler: Handler) {
      listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== handler));
    },
    listenerCount(event: string) {
      return (listeners.get(event) ?? []).length;
    },
    emit(event: string, data: unknown) {
      for (const handler of listeners.get(event) ?? []) handler(data);
    },
    ...overrides,
  };
}

type FakeSdk = ReturnType<typeof fakeSdk>;

/*
 * The real SDK instance is a Proxy that throws for any property it does not
 * recognise, including `then`. Wrapping every fake the same way means the whole
 * suite fails if this module ever resolves a promise with the instance itself.
 */
function proxied(sdk: FakeSdk) {
  return new Proxy(sdk, {
    get(target, property, receiver) {
      if (!(property in target)) {
        throw new Error(
          `Method ${String(property)} is not available in this version of Zoom Apps SDK`,
        );
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/** The loader seam keeps the real package out of the test environment. */
function install(sdk: FakeSdk) {
  setZoomSdkLoader(async () => ({ default: proxied(sdk) as never }));
  return sdk;
}

beforeEach(() => {
  resetZoomSdk();
});

afterEach(() => {
  setZoomSdkLoader(null);
  resetZoomSdk();
});

describe("configuration", () => {
  it("configures once however many callers ask for it", async () => {
    const sdk = install(fakeSdk());

    const [first, second] = await Promise.all([initZoomSdk(), initZoomSdk()]);
    await initZoomSdk();

    expect(sdk.config).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.availability).toBe("ready");
    expect(first.canPublish).toBe(true);
    expect(first.canStyle).toBe(true);
  });

  it("never resolves a promise with the SDK instance itself", async () => {
    /*
     * Guards the failure this module shipped with once: an async loader that
     * returned the instance made the runtime read `.then` off the Proxy, and the
     * SDK reported that it had not been configured.
     */
    const sdk = fakeSdk();
    const instance = proxied(sdk);
    setZoomSdkLoader(async () => ({ default: instance as never }));

    const environment = await initZoomSdk();

    expect(() => (instance as unknown as { then: unknown }).then).toThrow(
      /Method then is not available/,
    );
    expect(environment.availability).toBe("ready");
    expect(environment.error).toBeNull();
    expect(sdk.config).toHaveBeenCalledTimes(1);
  });

  it("declares every capability it uses and nothing else", async () => {
    const sdk = install(fakeSdk());

    await initZoomSdk();

    expect(sdk.config).toHaveBeenCalledWith({
      version: "0.16",
      timeout: 10_000,
      capabilities: [...ZOOM_CAPABILITIES],
    });
  });

  it("reports a browser preview when there is no Zoom bridge", async () => {
    install(fakeSdk({
      config: vi.fn(async () => {
        throw new Error("The Zoom Apps SDK is not supported by this browser");
      }),
    }));

    const environment = await initZoomSdk();

    expect(environment.availability).toBe("outside-zoom");
    expect(environment.canPublish).toBe(false);
  });

  it("refuses to publish outside a meeting", async () => {
    install(fakeSdk({
      config: vi.fn(async () => ({
        runningContext: "inMainClient",
        unsupportedApis: [],
        clientVersion: "6.1.0",
        browserVersion: "cef/120",
        product: "desktop",
      })),
    }));

    const environment = await initZoomSdk();

    expect(environment.availability).toBe("unsupported-context");
    expect(environment.canPublish).toBe(false);
  });

  it("refuses to publish when the client lacks the indicator APIs", async () => {
    install(fakeSdk({
      config: vi.fn(async () => ({
        runningContext: "inMeeting",
        unsupportedApis: ["setDynamicIndicator"],
        clientVersion: "5.14.0",
        browserVersion: "cef/100",
        product: "desktop",
      })),
      getSupportedJsApis: vi.fn(async () => ({
        supportedApis: ZOOM_CAPABILITIES.filter((api) => api !== "setDynamicIndicator"),
      })),
    }));

    const environment = await initZoomSdk();

    expect(environment.availability).toBe("unsupported-client");
    expect(environment.missingCapabilities).toContain("setDynamicIndicator");
  });

  it("publishes without extend support, and says so", async () => {
    install(fakeSdk({
      config: vi.fn(async () => ({
        runningContext: "inMeeting",
        unsupportedApis: ["extendDynamicIndicator"],
        clientVersion: "5.16.0",
        browserVersion: "cef/100",
        product: "desktop",
      })),
      getSupportedJsApis: vi.fn(async () => ({
        supportedApis: ZOOM_CAPABILITIES.filter((api) => api !== "extendDynamicIndicator"),
      })),
    }));

    const environment = await initZoomSdk();

    expect(environment.canPublish).toBe(true);
    expect(environment.canExtend).toBe(false);
  });

  it("keeps timer publishing available when only live restyling is unsupported", async () => {
    install(fakeSdk({
      config: vi.fn(async () => ({
        runningContext: "inMeeting",
        unsupportedApis: ["setDynamicIndicatorStyle"],
        clientVersion: "5.17.4",
        browserVersion: "cef/110",
        product: "desktop",
      })),
      getSupportedJsApis: vi.fn(async () => ({
        supportedApis: ZOOM_CAPABILITIES.filter((api) => api !== "setDynamicIndicatorStyle"),
      })),
    }));

    const environment = await initZoomSdk();

    expect(environment.canPublish).toBe(true);
    expect(environment.canStyle).toBe(false);
  });

  it("re-reads the context after the operator joins a meeting", async () => {
    const sdk = install(fakeSdk({
      config: vi.fn(async () => ({
        runningContext: "inMainClient",
        unsupportedApis: [],
        clientVersion: "6.1.0",
        browserVersion: "cef/120",
        product: "desktop",
      })),
    }));

    await initZoomSdk();
    const environment = await refreshZoomContext();

    expect(sdk.getRunningContext).toHaveBeenCalledTimes(1);
    expect(environment.availability).toBe("ready");
  });
});

describe("commands", () => {
  it("sends a complete indicator, with sound and notifications off", async () => {
    const sdk = install(fakeSdk());
    await initZoomSdk();

    const outcome = await publishZoomCommand(
      { kind: "start", remainingSeconds: 299.4, label: "Maya Chen", tone: "normal" },
      1,
    );

    expect(outcome.status).toBe("applied");
    expect(sdk.setDynamicIndicator).toHaveBeenCalledWith({
      timer: {
        action: "start",
        direction: "down",
        start: 300_399,
        withSound: false,
        countNegativeAfterAlarm: true,
        showNotification: false,
      },
      borderColor: "#707070",
      backgroundColor: "#242424",
      textColor: "#FFFFFF",
    });
  });

  it("maps each transition to its documented call", async () => {
    const sdk = install(fakeSdk());
    await initZoomSdk();

    await publishZoomCommand({ kind: "pause" }, 1);
    await publishZoomCommand({ kind: "resume" }, 2);
    await publishZoomCommand({ kind: "extend", seconds: 15 }, 3);
    await publishZoomCommand({ kind: "style", tone: "caution" }, 4);
    await publishZoomCommand({ kind: "remove" }, 5);

    expect(sdk.setDynamicIndicator).toHaveBeenNthCalledWith(1, { timer: { action: "pause" } });
    expect(sdk.setDynamicIndicator).toHaveBeenNthCalledWith(2, { timer: { action: "resume" } });
    expect(sdk.extendDynamicIndicator).toHaveBeenCalledWith({ extendDuration: 15_000 });
    expect(sdk.setDynamicIndicatorStyle).toHaveBeenCalledWith({
      borderColor: "#FFB000",
      backgroundColor: "#242424",
      textColor: "#FFFFFF",
    });
    expect(sdk.removeDynamicIndicator).toHaveBeenCalledTimes(1);
  });

  it("fills overtime red and restores the dark background when time is added", async () => {
    const sdk = install(fakeSdk());
    await initZoomSdk();

    await publishZoomCommand({ kind: "style", tone: "overtime" }, 1);
    await publishZoomCommand({ kind: "style", tone: "normal" }, 2);

    expect(sdk.setDynamicIndicatorStyle).toHaveBeenNthCalledWith(1, {
      borderColor: "#F04464",
      backgroundColor: "#7A1C2D",
      textColor: "#FFFFFF",
    });
    expect(sdk.setDynamicIndicatorStyle).toHaveBeenNthCalledWith(2, {
      borderColor: "#707070",
      backgroundColor: "#242424",
      textColor: "#FFFFFF",
    });
  });

  it("never calls Zoom for a no-op", async () => {
    const sdk = install(fakeSdk());
    await initZoomSdk();

    const outcome = await publishZoomCommand({ kind: "noop" }, 1);

    expect(outcome.status).toBe("skipped");
    expect(sdk.setDynamicIndicator).not.toHaveBeenCalled();
  });

  it("runs one command at a time, in order", async () => {
    const order: string[] = [];
    let release: (() => void) | null = null;
    const sdk = install(fakeSdk({
      setDynamicIndicator: vi.fn(async () => {
        order.push("start:begin");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        order.push("start:end");
        return { message: "Success" };
      }),
      removeDynamicIndicator: vi.fn(async () => {
        order.push("remove");
        return { message: "Success" };
      }),
    }));
    await initZoomSdk();

    // Both derive from the same revision, so neither supersedes the other.
    const first = publishZoomCommand(
      { kind: "start", remainingSeconds: 60, label: "Maya Chen", tone: "normal" },
      7,
    );
    const second = publishZoomCommand({ kind: "remove" }, 7);

    await vi.waitFor(() => expect(release).not.toBeNull());
    expect(order).toEqual(["start:begin"]);
    release!();
    await Promise.all([first, second]);

    expect(order).toEqual(["start:begin", "start:end", "remove"]);
    expect(sdk.removeDynamicIndicator).toHaveBeenCalledTimes(1);
  });

  it("drops a command computed from state older than one already queued", async () => {
    const sdk = install(fakeSdk());
    await initZoomSdk();

    const newer = publishZoomCommand({ kind: "remove" }, 20);
    const stale = publishZoomCommand(
      { kind: "start", remainingSeconds: 60, label: "Maya Chen", tone: "normal" },
      5,
    );

    expect((await newer).status).toBe("applied");
    expect((await stale).status).toBe("superseded");
    expect(sdk.setDynamicIndicator).not.toHaveBeenCalled();
  });

  it("normalizes a rejection without leaking the error object", async () => {
    install(fakeSdk({
      setDynamicIndicator: vi.fn(async () => {
        throw Object.assign(new Error("No permission for API"), {
          code: "10047",
          requestId: "req-1",
          internal: "secret",
        });
      }),
    }));
    await initZoomSdk();

    const outcome = await publishZoomCommand(
      { kind: "start", remainingSeconds: 60, label: "Maya Chen", tone: "normal" },
      1,
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toEqual({
      message: "No permission for API",
      code: "10047",
      requestId: "req-1",
    });
  });

  it("keeps the queue alive after a failure", async () => {
    install(fakeSdk({
      setDynamicIndicator: vi.fn(async () => {
        throw new Error("client rate limit exceeded");
      }),
    }));
    await initZoomSdk();

    await publishZoomCommand(
      { kind: "start", remainingSeconds: 60, label: "A", tone: "normal" },
      1,
    );
    const after = await publishZoomCommand({ kind: "remove" }, 2);

    expect(after.status).toBe("applied");
  });

  it("refuses to publish when Zoom is not ready", async () => {
    const sdk = install(fakeSdk({
      config: vi.fn(async () => {
        throw new Error("The Zoom Apps SDK is not supported by this browser");
      }),
    }));
    await initZoomSdk();

    const outcome = await publishZoomCommand({ kind: "remove" }, 1);

    expect(outcome.status).toBe("failed");
    expect(sdk.removeDynamicIndicator).not.toHaveBeenCalled();
  });
});

describe("events", () => {
  it("reports acknowledgements and unregisters its named handlers", async () => {
    const sdk = install(fakeSdk());
    await initZoomSdk();
    const seen: string[] = [];

    const stop = registerZoomIndicatorListeners((event) => seen.push(event.kind));
    sdk.emit("onSetDynamicIndicator", { text: "Maya Chen", timer: { action: "start" } });
    sdk.emit("onExtendDynamicIndicator", { extendDuration: 15 });
    sdk.emit("onRemoveDynamicIndicator", {});

    expect(seen).toEqual(["set", "extend", "remove"]);
    expect(sdk.listenerCount("onSetDynamicIndicator")).toBe(1);

    stop();

    expect(sdk.listenerCount("onSetDynamicIndicator")).toBe(0);
    expect(sdk.listenerCount("onRemoveDynamicIndicator")).toBe(0);
    expect(sdk.listenerCount("onExtendDynamicIndicator")).toBe(0);

    sdk.emit("onSetDynamicIndicator", { text: "ignored" });
    expect(seen).toEqual(["set", "extend", "remove"]);
  });

  it("reads Zoom's own view only as a diagnostic", async () => {
    install(fakeSdk());
    await initZoomSdk();

    const { indicator, error } = await readZoomIndicator();

    expect(error).toBeNull();
    expect(indicator).toMatchObject({ text: "Maya Chen" });
  });
});

describe("error normalization", () => {
  it("keeps the code and request id, and nothing else", () => {
    expect(
      normalizeZoomError({ message: "Boom", code: 10002, requestId: "abc", extra: "drop me" }),
    ).toEqual({ message: "Boom", code: "10002", requestId: "abc" });
  });

  it("survives values that are not errors at all", () => {
    expect(normalizeZoomError(undefined)).toEqual({ message: "Unknown Zoom error" });
    expect(normalizeZoomError("plain string")).toEqual({ message: "plain string" });
  });
});
