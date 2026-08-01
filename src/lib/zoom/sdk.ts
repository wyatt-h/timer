import type { ZoomIndicatorTone, ZoomTimerCommand } from "@/lib/zoom/sync";
import { toZoomTimerUnits } from "@/lib/zoom/sync";

/*
 * Every direct conversation with the Zoom Apps SDK happens here: one
 * configuration per document load, capability detection, a serialized command
 * queue, and error normalization. Nothing in this module renders, and nothing
 * outside it imports `@zoom/appssdk` at runtime.
 *
 * The package is only ever loaded through a dynamic import inside the browser.
 * Importing it is inert, but `config()` throws outside the Zoom client because
 * there is no native bridge to talk to — that rejection is what tells us we are
 * in an ordinary browser rather than a meeting.
 */

type ZoomSdk = typeof import("@zoom/appssdk").default;
type Apis = import("@zoom/appssdk").Apis;
type ConfigResponse = import("@zoom/appssdk").ConfigResponse;
type RunningContext = import("@zoom/appssdk").RunningContext;
type GetDynamicIndicatorOutput = import("@zoom/appssdk").GetDynamicIndicatorOutput;

/**
 * Exactly what this app calls, and nothing more. The same list must be enabled
 * in the Marketplace build flow under Features → Zoom App SDK.
 *
 * `getRunningContext` is included because the operator can re-check the context
 * after joining a meeting; the initial context comes from the `config()`
 * response. `getSupportedJsApis` backs up `unsupportedApis` on older clients.
 */
export const ZOOM_CAPABILITIES = [
  "getRunningContext",
  "getSupportedJsApis",
  "setDynamicIndicator",
  "getDynamicIndicator",
  "removeDynamicIndicator",
  "extendDynamicIndicator",
  "setDynamicIndicatorStyle",
  "onSetDynamicIndicator",
  "onRemoveDynamicIndicator",
  "onExtendDynamicIndicator",
] as const satisfies readonly Apis[];

/** Contexts in which Zoom documents the Dynamic Indicator APIs. */
const PUBLISHABLE_CONTEXTS: readonly RunningContext[] = [
  "inMeeting",
  "inWebinar",
  "inCollaborate",
  "inCamera",
];

/** Without these two, nothing can be published or retracted at all. */
const REQUIRED_FOR_PUBLISHING: readonly Apis[] = [
  "setDynamicIndicator",
  "removeDynamicIndicator",
];

/** The literal the SDK throws when no Zoom bridge exists on the page. */
const NO_BRIDGE = "not supported by this browser";

export type ZoomAvailability =
  | "loading"
  | "ready"
  | "outside-zoom"
  | "unsupported-context"
  | "unsupported-client"
  | "error";

export type ZoomErrorInfo = {
  message: string;
  code?: string;
  requestId?: string;
};

export type ZoomEnvironment = {
  availability: ZoomAvailability;
  runningContext: RunningContext | null;
  product: string | null;
  clientVersion: string | null;
  browserVersion: string | null;
  /** Declared capabilities this client cannot provide. */
  missingCapabilities: Apis[];
  canPublish: boolean;
  canExtend: boolean;
  canStyle: boolean;
  error: ZoomErrorInfo | null;
};

export type ZoomCommandStatus = "applied" | "skipped" | "superseded" | "failed";

export type ZoomCommandOutcome = {
  command: ZoomTimerCommand;
  status: ZoomCommandStatus;
  at: number;
  error: ZoomErrorInfo | null;
};

export type ZoomIndicatorEvent = {
  kind: "set" | "remove" | "extend";
  at: number;
  detail: string;
};

const EMPTY_ENVIRONMENT: ZoomEnvironment = {
  availability: "loading",
  runningContext: null,
  product: null,
  clientVersion: null,
  browserVersion: null,
  missingCapabilities: [],
  canPublish: false,
  canExtend: false,
  canStyle: false,
  error: null,
};

/**
 * Normalizes a `ZoomApiError` without leaking a stack or the original object.
 * The SDK does not export the error class, so this reads it structurally.
 */
export function normalizeZoomError(error: unknown): ZoomErrorInfo {
  if (typeof error === "string") return { message: error };
  if (!error || typeof error !== "object") return { message: "Unknown Zoom error" };
  const candidate = error as { message?: unknown; reason?: unknown; code?: unknown; requestId?: unknown };
  const message =
    typeof candidate.message === "string" && candidate.message
      ? candidate.message
      : typeof candidate.reason === "string" && candidate.reason
        ? candidate.reason
        : "Unknown Zoom error";
  const code =
    typeof candidate.code === "string" || typeof candidate.code === "number"
      ? String(candidate.code)
      : undefined;
  const requestId = typeof candidate.requestId === "string" ? candidate.requestId : undefined;
  return { message, ...(code ? { code } : {}), ...(requestId ? { requestId } : {}) };
}

type ZoomSdkModule = { default: ZoomSdk };
type SdkLoader = () => Promise<ZoomSdkModule>;

/*
 * Resolves with the module, never with the SDK instance itself.
 *
 * The instance is a Proxy that throws for any property it does not recognise.
 * Resolving a promise with it makes the runtime's own thenable check read
 * `.then`, which the Proxy answers with "Method then is not available in this
 * version of Zoom Apps SDK" — so the SDK appears to fail before `config()` is
 * ever reached. Keeping the Proxy inside a plain object avoids the check.
 */
const importSdk: SdkLoader = () => import("@zoom/appssdk");

let loadSdk: SdkLoader = importSdk;

/**
 * The seam tests use to supply a fake SDK instead of the real package. Loaders
 * must resolve with `{ default: sdk }` for the reason above.
 */
export function setZoomSdkLoader(loader: SdkLoader | null) {
  loadSdk = loader ?? importSdk;
}

let configuring: Promise<ZoomEnvironment> | null = null;
let sdk: ZoomSdk | null = null;
let environment: ZoomEnvironment = EMPTY_ENVIRONMENT;

/** Forgets the configuration so the next call configures again. */
export function resetZoomSdk() {
  configuring = null;
  sdk = null;
  environment = EMPTY_ENVIRONMENT;
  queue = Promise.resolve();
  newestRevision = Number.NEGATIVE_INFINITY;
}

function decideAvailability(
  runningContext: RunningContext | null,
  missingCapabilities: Apis[],
): ZoomAvailability {
  if (!runningContext || !PUBLISHABLE_CONTEXTS.includes(runningContext)) {
    return "unsupported-context";
  }
  if (REQUIRED_FOR_PUBLISHING.some((api) => missingCapabilities.includes(api))) {
    return "unsupported-client";
  }
  return "ready";
}

function finalize(runningContext: RunningContext | null, missingCapabilities: Apis[]) {
  const availability = decideAvailability(runningContext, missingCapabilities);
  return {
    availability,
    canPublish: availability === "ready",
    canExtend:
      availability === "ready" && !missingCapabilities.includes("extendDynamicIndicator"),
    canStyle:
      availability === "ready" && !missingCapabilities.includes("setDynamicIndicatorStyle"),
    missingCapabilities,
  };
}

/**
 * `unsupportedApis` is the primary signal; `getSupportedJsApis()` is consulted
 * as well because older clients have been known to answer one and not the
 * other. Support is never inferred from the user agent.
 */
async function detectMissingCapabilities(instance: ZoomSdk, response: ConfigResponse) {
  const missing = new Set<Apis>(
    (response.unsupportedApis ?? []).filter((api) =>
      (ZOOM_CAPABILITIES as readonly Apis[]).includes(api),
    ),
  );
  if (!missing.has("getSupportedJsApis")) {
    try {
      const { supportedApis } = await instance.getSupportedJsApis();
      for (const api of ZOOM_CAPABILITIES) {
        if (!supportedApis.includes(api)) missing.add(api);
      }
    } catch {
      // The config response alone remains a usable answer.
    }
  }
  return [...missing];
}

async function configure(): Promise<ZoomEnvironment> {
  if (typeof window === "undefined") {
    return { ...EMPTY_ENVIRONMENT, availability: "outside-zoom" };
  }

  let instance: ZoomSdk;
  try {
    instance = (await loadSdk()).default;
  } catch (error) {
    return { ...EMPTY_ENVIRONMENT, availability: "error", error: normalizeZoomError(error) };
  }

  let response: ConfigResponse;
  try {
    response = await instance.config({
      version: "0.16",
      timeout: 10_000,
      capabilities: [...ZOOM_CAPABILITIES],
    });
  } catch (error) {
    const info = normalizeZoomError(error);
    const outsideZoom = info.message.toLowerCase().includes(NO_BRIDGE);
    environment = {
      ...EMPTY_ENVIRONMENT,
      availability: outsideZoom ? "outside-zoom" : "error",
      error: info,
    };
    return environment;
  }

  sdk = instance;
  const missing = await detectMissingCapabilities(instance, response);
  environment = {
    ...EMPTY_ENVIRONMENT,
    runningContext: response.runningContext ?? null,
    product: response.product ?? null,
    clientVersion: response.clientVersion ?? null,
    browserVersion: response.browserVersion ?? null,
    error: null,
    ...finalize(response.runningContext ?? null, missing),
  };
  return environment;
}

/** Configures once per document load; every later caller gets the same result. */
export function initZoomSdk() {
  configuring ??= configure();
  return configuring;
}

/**
 * Re-reads the running context, for the case where the app was opened in the
 * main client and the operator has since joined a meeting.
 */
export async function refreshZoomContext(): Promise<ZoomEnvironment> {
  if (!sdk) return initZoomSdk();
  try {
    const { context } = await sdk.getRunningContext();
    environment = {
      ...environment,
      runningContext: context,
      error: null,
      ...finalize(context, environment.missingCapabilities),
    };
  } catch (error) {
    environment = { ...environment, error: normalizeZoomError(error) };
  }
  configuring = Promise.resolve(environment);
  return environment;
}

/*
 * One command at a time. Zoom rejects too many unfinished concurrent calls
 * (10016), and overlapping start/extend/remove promises could otherwise land
 * out of order. A command computed from an older revision than one already
 * queued is dropped rather than applied on top of newer state.
 */
let queue: Promise<unknown> = Promise.resolve();
let newestRevision = Number.NEGATIVE_INFINITY;

/** High-contrast contours model Zoom's native normal/warning/critical states. */
export const ZOOM_INDICATOR_BORDER_COLORS: Record<ZoomIndicatorTone, string> = {
  normal: "#00D96F",
  caution: "#FFB000",
  critical: "#F04464",
};

async function send(instance: ZoomSdk, command: ZoomTimerCommand) {
  switch (command.kind) {
    case "start":
      /*
       * Sent as a complete indicator rather than a partial update: Zoom does not
       * document whether omitted fields are preserved or reset. Sound and
       * notifications stay off — this application chimes on its own displays,
       * and pushing audio at a whole meeting is not ours to do. Overtime remains
       * enabled so Zoom stays aligned with the audience display after zero.
       */
      await instance.setDynamicIndicator({
        timer: {
          action: "start",
          direction: "down",
          start: toZoomTimerUnits(command.remainingSeconds),
          withSound: false,
          countNegativeAfterAlarm: true,
          showNotification: false,
        },
        borderColor: ZOOM_INDICATOR_BORDER_COLORS[command.tone],
      });
      return;
    case "pause":
      // Documented shape for a straight transition.
      await instance.setDynamicIndicator({ timer: { action: "pause" } });
      return;
    case "resume":
      await instance.setDynamicIndicator({ timer: { action: "resume" } });
      return;
    case "extend":
      await instance.extendDynamicIndicator({
        extendDuration: toZoomTimerUnits(command.seconds),
      });
      return;
    case "style":
      await instance.setDynamicIndicatorStyle({
        borderColor: ZOOM_INDICATOR_BORDER_COLORS[command.tone],
      });
      return;
    case "remove":
      await instance.removeDynamicIndicator();
      return;
    case "noop":
      return;
  }
}

/** Queues one command, resolving with what actually happened to it. */
export function publishZoomCommand(
  command: ZoomTimerCommand,
  revision: number,
): Promise<ZoomCommandOutcome> {
  if (revision > newestRevision) newestRevision = revision;

  const run = async (): Promise<ZoomCommandOutcome> => {
    const at = Date.now();
    if (command.kind === "noop") return { command, status: "skipped", at, error: null };
    if (revision < newestRevision) return { command, status: "superseded", at, error: null };
    if (!sdk || !environment.canPublish) {
      return {
        command,
        status: "failed",
        at,
        error: { message: "Zoom is not ready to publish an indicator" },
      };
    }
    try {
      await send(sdk, command);
      return { command, status: "applied", at: Date.now(), error: null };
    } catch (error) {
      return { command, status: "failed", at: Date.now(), error: normalizeZoomError(error) };
    }
  };

  const result = queue.then(run, run);
  // The chain must survive a rejection, and `run` already captures failures.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Diagnostics only. Recovery always comes from the authoritative timer. */
export async function readZoomIndicator(): Promise<
  { indicator: GetDynamicIndicatorOutput | null; error: ZoomErrorInfo | null }
> {
  if (!sdk) return { indicator: null, error: { message: "Zoom SDK is not configured" } };
  const instance = sdk;
  const run = async () => {
    try {
      return { indicator: await instance.getDynamicIndicator(), error: null };
    } catch (error) {
      return { indicator: null, error: normalizeZoomError(error) };
    }
  };
  const result = queue.then(run, run);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Registers named handlers so React cleanup can remove them again. These are
 * acknowledgements for the operator's diagnostics panel; a Zoom event is never
 * translated back into this application's timer state, which is what keeps a
 * feedback loop impossible.
 */
export function registerZoomIndicatorListeners(onEvent: (event: ZoomIndicatorEvent) => void) {
  if (!sdk) return () => {};
  const instance = sdk;

  const handleSet = (data: { text?: string; timer?: { action?: string } }) =>
    onEvent({
      kind: "set",
      at: Date.now(),
      detail: [data?.timer?.action, data?.text].filter(Boolean).join(" · ") || "set",
    });
  const handleRemove = () => onEvent({ kind: "remove", at: Date.now(), detail: "removed" });
  const handleExtend = (data: { extendDuration?: number }) =>
    onEvent({
      kind: "extend",
      at: Date.now(),
      detail: `+${data?.extendDuration ?? "?"}s`,
    });

  instance.onSetDynamicIndicator(handleSet);
  instance.onRemoveDynamicIndicator(handleRemove);
  instance.onExtendDynamicIndicator(handleExtend);

  return () => {
    instance.removeEventListener("onSetDynamicIndicator", handleSet);
    instance.removeEventListener("onRemoveDynamicIndicator", handleRemove);
    instance.removeEventListener("onExtendDynamicIndicator", handleExtend);
  };
}
