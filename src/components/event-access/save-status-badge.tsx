"use client";

import { CircleAlert, CircleCheck, CloudOff, LogIn, RefreshCw } from "lucide-react";
import type { SaveState } from "@/lib/save-coordinator";
import { cn } from "@/lib/utils";

/*
 * What the cloud actually knows, stated plainly.
 *
 * "Saved" appears only once the server has acknowledged a durable write of the
 * newest state — never optimistically. Everything else an operator needs to act
 * on has its own label rather than being hidden behind the same tick: work still
 * in flight, work held because the network is gone, work the server refused, work
 * that stopped because another device got there first, and work waiting for
 * somebody to sign in again. A refused document is deliberately not called
 * "Offline": nothing is wrong with the connection, and waiting will not fix it.
 */

const LABELS: Record<SaveState, { text: string; hint: string }> = {
  idle: { text: "Up to date", hint: "No unsaved changes." },
  saving: { text: "Saving", hint: "Sending changes to the cloud." },
  saved: { text: "Saved", hint: "Every change is stored in the cloud." },
  offline: {
    text: "Offline",
    hint: "Changes are kept on this device and will be sent when the connection returns.",
  },
  rejected: {
    text: "Not saved",
    hint: "The server refused this change. It is still on this device, but retrying as-is will not help.",
  },
  conflict: {
    text: "Conflict",
    hint: "This event was changed on another device. The newer version has been loaded.",
  },
  "signed-out": {
    text: "Sign in again",
    hint: "This device is no longer signed in to the event. Unsaved changes are kept until it is.",
  },
};

export function SaveStatusBadge({
  state,
  onRetry,
  className,
}: {
  state: SaveState | undefined;
  onRetry?: () => void;
  className?: string;
}) {
  const resolved: SaveState = state ?? "idle";
  const { text, hint } = LABELS[resolved];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
        resolved === "saved" && "bg-success-soft text-success",
        resolved === "saving" && "bg-violet-soft text-violet-dark",
        resolved === "offline" && "bg-caution-soft text-caution",
        (resolved === "conflict" || resolved === "signed-out" || resolved === "rejected") &&
          "bg-over-soft text-over",
        resolved === "idle" && "bg-surface-sunken text-text-muted",
        className,
      )}
      title={hint}
    >
      {resolved === "saved" && <CircleCheck size={12} aria-hidden />}
      {resolved === "saving" && (
        <RefreshCw size={12} aria-hidden className="motion-safe:animate-spin" />
      )}
      {resolved === "offline" && <CloudOff size={12} aria-hidden />}
      {(resolved === "conflict" || resolved === "rejected") && (
        <CircleAlert size={12} aria-hidden />
      )}
      {resolved === "signed-out" && <LogIn size={12} aria-hidden />}
      {text}
      {/*
        * The visible label is short enough to sit in a toolbar; the reason lives
        * in a live region so a screen reader hears the whole story.
        */}
      <span className="sr-only" role="status" aria-live="polite">
        {hint}
      </span>
      {resolved === "offline" && onRetry && (
        <button
          type="button"
          className="ml-0.5 underline underline-offset-2"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </span>
  );
}
