"use client";

import {
  AlertTriangle,
  Check,
  Link2,
  Link2Off,
  MonitorPlay,
  RadioTower,
  RefreshCw,
  Stethoscope,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeTimer, formatTimer } from "@/lib/format";
import { useZoomEvent, type ZoomEventConnection } from "@/lib/store";
import {
  initZoomSdk,
  readZoomIndicator,
  refreshZoomContext,
  type ZoomEnvironment,
  type ZoomErrorInfo,
} from "@/lib/zoom/sdk";
import { formatZoomToken, isZoomToken, normalizeZoomToken } from "@/lib/zoom/token";
import { useZoomIndicator } from "@/lib/zoom/use-zoom-indicator";
import { cn } from "@/lib/utils";

/*
 * Zoom's meeting webview may not share storage with the operator's browser, so
 * this is a convenience only: the pairing code is re-entered if it is missing.
 * Nothing authoritative is ever kept here.
 */
const CODE_STORAGE_KEY = "timer:zoom-code";

const LOADING_ENVIRONMENT: ZoomEnvironment = {
  availability: "loading",
  runningContext: null,
  product: null,
  clientVersion: null,
  browserVersion: null,
  missingCapabilities: [],
  canPublish: false,
  canExtend: false,
  error: null,
};

const CONNECTION_LABEL: Record<ZoomEventConnection, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  "not-found": "Code not recognised",
  polling: "Connected",
  live: "Connected · realtime",
  unavailable: "Unavailable",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-text-subtle">{label}</span>
      <span className="text-right text-[12px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  tone = "plain",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "plain" | "live" | "warning";
}) {
  return (
    <section
      className={cn(
        "grid gap-2.5 rounded-card border border-line bg-white p-4",
        tone === "live" && "border-success/30 bg-success-soft",
        tone === "warning" && "border-caution/30 bg-caution-soft",
      )}
    >
      <h2 className="flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] text-text-subtle uppercase">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorNote({ error }: { error: ZoomErrorInfo }) {
  return (
    <p className="rounded-field border border-over/20 bg-over-soft px-3 py-2 text-[12px] text-over">
      {error.message}
      {error.code ? ` (code ${error.code})` : ""}
      {error.requestId ? ` · request ${error.requestId}` : ""}
    </p>
  );
}

export function ZoomTimer() {
  const [environment, setEnvironment] = useState<ZoomEnvironment>(LOADING_ENVIRONMENT);
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void initZoomSdk().then(setEnvironment);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(CODE_STORAGE_KEY);
    if (saved && isZoomToken(saved)) {
      queueMicrotask(() => {
        setToken(saved);
        setDraft(formatZoomToken(saved));
      });
    }
  }, []);

  const { event, connection } = useZoomEvent(token);
  const { source, published, lastOutcome, lastEvent, reconcile } = useZoomIndicator({
    event,
    environment,
    enabled: syncing,
  });

  /*
   * A dropped and re-established realtime channel means this app may have
   * missed transitions, so the indicator is republished from authoritative
   * state rather than trusted to still be correct.
   */
  const previousConnection = useRef(connection);
  useEffect(() => {
    if (connection === "live" && previousConnection.current !== "live") reconcile();
    previousConnection.current = connection;
  }, [connection, reconcile]);

  const connect = useCallback(() => {
    const normalized = normalizeZoomToken(draft);
    if (!isZoomToken(normalized)) {
      setCodeError("That is not a complete ten-character code.");
      return;
    }
    setCodeError(null);
    setToken(normalized);
    setDraft(formatZoomToken(normalized));
    window.localStorage.setItem(CODE_STORAGE_KEY, normalized);
  }, [draft]);

  const disconnect = useCallback(() => {
    setSyncing(false);
    setToken("");
    setDraft("");
    setCodeError(null);
    window.localStorage.removeItem(CODE_STORAGE_KEY);
  }, []);

  const recheck = useCallback(async () => {
    setChecking(true);
    setEnvironment(await refreshZoomContext());
    setChecking(false);
  }, []);

  const inspect = useCallback(async () => {
    const { indicator, error } = await readZoomIndicator();
    if (error) {
      setDiagnostic(`Zoom said: ${error.message}${error.code ? ` (${error.code})` : ""}`);
      return;
    }
    setDiagnostic(
      indicator
        ? `Zoom holds: ${indicator.text ?? "no text"} · ${indicator.timer?.action ?? "no timer"}${
            typeof indicator.timer?.current === "number" ? ` · ${indicator.timer.current}` : ""
          }`
        : "Zoom returned no indicator.",
    );
  }, []);

  const insideZoom = environment.availability !== "outside-zoom";
  const isLive = syncing && Boolean(published);
  const phaseLabel =
    source?.phase === "running"
      ? "Running"
      : source?.phase === "paused"
        ? "Paused"
        : source?.phase === "finished"
          ? "Ended"
          : "Ready";

  return (
    <main className="min-h-svh bg-paper px-3.5 py-4">
      <div className="mx-auto grid w-[min(460px,100%)] gap-3">
        <header className="flex items-center justify-between gap-3">
          <BrandMark />
          <h1 className="sr-only">Timer for Zoom</h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold",
              environment.availability === "ready"
                ? "bg-success-soft text-success"
                : environment.availability === "loading"
                  ? "bg-surface-sunken text-text-muted"
                  : "bg-caution-soft text-caution",
            )}
          >
            <MonitorPlay size={12} aria-hidden />
            {environment.availability === "ready"
              ? "In meeting"
              : environment.availability === "loading"
                ? "Checking Zoom"
                : environment.availability === "outside-zoom"
                  ? "Browser preview"
                  : environment.availability === "unsupported-context"
                    ? "Not in a meeting"
                    : environment.availability === "unsupported-client"
                      ? "Client unsupported"
                      : "Zoom error"}
          </span>
        </header>

        {/* Where the timer comes from. Nothing is published until it is connected. */}
        <Card title="Timer" icon={<RadioTower size={12} aria-hidden />}>
          {!token ? (
            <>
              <p className="text-[12px] text-text-muted">
                Open the event in the Timer control room, create its Zoom code, and paste it
                here.
              </p>
              <Input
                label="Zoom code"
                value={draft}
                placeholder="ABCDE-FGHJK"
                aria-label="Event Zoom code"
                aria-invalid={Boolean(codeError)}
                errorText={codeError ?? ""}
                onValueChange={(value) => {
                  setDraft(value);
                  setCodeError(null);
                }}
              />
              <Button variant="primary" onClick={connect}>
                <Link2 size={14} aria-hidden />
                Connect
              </Button>
            </>
          ) : (
            <>
              <div className="grid gap-0.5">
                <strong className="text-[15px] font-semibold tracking-[-0.03em] text-ink">
                  {event?.name ?? "Looking for that event…"}
                </strong>
                <span className="text-[12px] text-text-subtle">
                  {CONNECTION_LABEL[connection]} · {formatZoomToken(token)}
                </span>
              </div>

              {connection === "not-found" && (
                <p className="text-[12px] text-caution">
                  No event matched this code. Check it in the control room, or create a new one.
                </p>
              )}
              {connection === "unavailable" && (
                <p className="text-[12px] text-caution">
                  This deployment has no Supabase connection, so a code cannot be looked up.
                </p>
              )}

              {source && (
                <div className="grid gap-1.5 rounded-field border border-line-soft bg-surface-sunken px-3.5 py-3">
                  <span className="text-[12px] font-bold tracking-[0.1em] text-text-subtle uppercase">
                    {phaseLabel}
                  </span>
                  <strong className="tabular block font-mono text-[38px] leading-none font-medium tracking-[-0.06em] text-ink">
                    {formatTimer(source.remainingSeconds)}
                  </strong>
                  <span className="text-[13px] font-semibold text-ink">{source.label}</span>
                  <p className="sr-only" role="status" aria-live="polite">
                    {`${phaseLabel}. ${source.label}. ${describeTimer(source.remainingSeconds)}.`}
                  </p>
                </div>
              )}

              <Button variant="ghost" size="sm" className="justify-self-start" onClick={disconnect}>
                <Link2Off size={13} aria-hidden />
                Disconnect
              </Button>
            </>
          )}
        </Card>

        {/* Publishing is never automatic: this is what a whole meeting can see. */}
        <Card
          title="Meeting indicator"
          icon={isLive ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
          tone={isLive ? "live" : "plain"}
        >
          {isLive ? (
            <>
              <p className="text-[12px] font-semibold text-success">
                Everyone in this meeting can see this timer.
              </p>
              <Button variant="danger" onClick={() => setSyncing(false)}>
                Stop sharing timer
              </Button>
            </>
          ) : (
            <>
              <p className="text-[12px] text-text-muted">
                {syncing
                  ? "Waiting for the timer to start. The indicator appears when it is running."
                  : "Nothing is shared with the meeting yet."}
              </p>
              {syncing ? (
                <Button variant="secondary" onClick={() => setSyncing(false)}>
                  Cancel sharing
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={!environment.canPublish || !event}
                  onClick={() => setSyncing(true)}
                >
                  <RadioTower size={14} aria-hidden />
                  Sync to Zoom
                </Button>
              )}
              {!environment.canPublish && (
                <p className="text-[12px] text-text-subtle">
                  {environment.availability === "outside-zoom"
                    ? "Open this page from the Timer app inside a Zoom meeting to publish an indicator."
                    : environment.availability === "unsupported-context"
                      ? "Join a meeting or webinar, then re-check below."
                      : environment.availability === "unsupported-client"
                        ? "This Zoom client does not support dynamic indicators."
                        : "Zoom is not ready yet."}
                </p>
              )}
            </>
          )}
        </Card>

        {!insideZoom && (
          <Card title="Preview only" icon={<AlertTriangle size={12} aria-hidden />} tone="warning">
            <p className="text-[12px] text-caution">
              There is no Zoom client on this page, so the SDK cannot be configured. Everything
              above still works as a read-only preview of what the meeting would be shown.
            </p>
          </Card>
        )}

        <Card title="Diagnostics" icon={<Stethoscope size={12} aria-hidden />}>
          <Row label="Running context" value={environment.runningContext ?? "—"} />
          <Row label="Product" value={environment.product ?? "—"} />
          <Row label="Zoom client" value={environment.clientVersion ?? "—"} />
          <Row
            label="Unsupported"
            value={
              environment.missingCapabilities.length
                ? environment.missingCapabilities.join(", ")
                : "none"
            }
          />
          <Row
            label="Last command"
            value={
              lastOutcome
                ? `${lastOutcome.command.kind} · ${lastOutcome.status}`
                : syncing
                  ? "none yet"
                  : "—"
            }
          />
          <Row
            label="Last Zoom event"
            value={lastEvent ? `${lastEvent.kind} · ${lastEvent.detail}` : "—"}
          />
          {lastOutcome?.error && <ErrorNote error={lastOutcome.error} />}
          {environment.error && <ErrorNote error={environment.error} />}
          {diagnostic && (
            <p className="rounded-field border border-line-soft bg-surface-sunken px-3 py-2 text-[12px] text-text-muted">
              {diagnostic}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void recheck()} disabled={checking}>
              <RefreshCw size={13} aria-hidden className={cn(checking && "animate-spin")} />
              Re-check Zoom
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void inspect()}
              disabled={!environment.canPublish}
            >
              <Check size={13} aria-hidden />
              Read Zoom state
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
