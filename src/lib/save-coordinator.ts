"use client";

import type { ControllerEvent } from "@/lib/event-auth/types";
import type { TimerEvent } from "@/lib/types";

/*
 * One save coordinator per event.
 *
 * The control room mutates an event constantly — a name typed a letter at a time,
 * a panel dragged into a new order, a timer started. Sending each of those as its
 * own request would put writes in flight concurrently and let a slow older one
 * land on top of a newer one. This serialises them instead:
 *
 * - one request in flight at a time, per event;
 * - rapid edits coalesce down to the newest unsaved snapshot, so a burst of
 *   keystrokes costs one write rather than one per character;
 * - a brief debounce absorbs text entry and reordering churn;
 * - "Saved" is only shown when the snapshot that came back is still the newest
 *   one queued, so an older response can never label newer state as durable;
 * - transient failures retry with bounded exponential backoff, and the unsaved
 *   snapshot stays in hand meanwhile;
 * - a document the server refuses gets its own state rather than being dressed up
 *   as a connection problem;
 * - a version conflict stops the loop entirely, because the right move is to
 *   refetch rather than to keep pushing a stale document.
 *
 * The 200 ms display tick is deliberately not a save. `ends_at` is the durable
 * clock, so a running timer needs no traffic to stay correct on another device.
 */

export type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  /** Refused for a reason retrying cannot fix. Distinct from a lost connection. */
  | "rejected"
  | "conflict"
  | "signed-out";

export type SaveOutcome =
  | { status: "saved"; version: number }
  | { status: "conflict"; payload: ControllerEvent | null }
  | { status: "signed-out" }
  /** Refused for a reason retrying cannot fix, such as a rejected document. */
  | { status: "rejected" }
  /**
   * Network loss, a timeout, or a server-side outage; worth trying again. A rate
   * limiter can say how long to wait, and that beats the local backoff.
   */
  | { status: "offline"; retryAfterMs?: number };

export type SaveCoordinatorOptions = {
  /*
   * `revision` is the opaque id the outbox entry this snapshot came from was
   * stored under. It travels with the request so the caller can tell, on success
   * or failure, whether the entry still on disk is the one this attempt was
   * carrying or a different edit that must be left alone.
   */
  save: (event: TimerEvent, version: number, revision: string) => Promise<SaveOutcome>;
  onState: (state: SaveState) => void;
  onConflict: (payload: ControllerEvent | null) => void;
  onSignedOut: () => void;
  debounceMs?: number;
  /* Injected so tests can drive time without a real clock. */
  setTimer?: (run: () => void, delay: number) => number;
  clearTimer?: (handle: number) => void;
};

const DEFAULT_DEBOUNCE_MS = 220;
const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 8_000;
const MAX_RETRIES = 6;

function backoffDelay(attempt: number) {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** (attempt - 1));
}

export class SaveCoordinator {
  private version: number;
  private readonly options: Required<
    Pick<SaveCoordinatorOptions, "save" | "onState" | "onConflict" | "onSignedOut">
  > &
    SaveCoordinatorOptions;
  private readonly debounceMs: number;
  private readonly setTimer: (run: () => void, delay: number) => number;
  private readonly clearTimer: (handle: number) => void;

  private pending: TimerEvent | null = null;
  private pendingRevision: string | null = null;
  /** The revision currently on the wire, so it cannot be queued a second time. */
  private inFlightRevision: string | null = null;
  private pendingSequence = 0;
  /** The newest snapshot ever queued, and the newest one the server has taken. */
  private queuedSequence = 0;
  private savedSequence = 0;
  private inFlight = false;
  private timer: number | null = null;
  private retries = 0;
  /** Set by a conflict or a lost session: nothing more is sent until reset. */
  private halted = false;
  private state: SaveState = "idle";

  constructor(version: number, options: SaveCoordinatorOptions) {
    this.version = version;
    this.options = options;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.setTimer =
      options.setTimer ?? ((run, delay) => window.setTimeout(run, delay) as unknown as number);
    this.clearTimer = options.clearTimer ?? ((handle) => window.clearTimeout(handle));
  }

  get currentState() {
    return this.state;
  }

  get currentVersion() {
    return this.version;
  }

  /**
   * Whether an edit is still unsaved. The controller consults this before
   * adopting a newer version from another device: overwriting unsaved work
   * silently is the one thing a conflict must never do.
   */
  get hasPendingWork() {
    return this.pending !== null || this.inFlight;
  }

  get isHalted() {
    return this.halted;
  }

  /** Adopts a version read from the server without queueing anything. */
  setVersion(version: number) {
    this.version = version;
  }

  /** The revision this coordinator is holding or sending, if any. */
  get trackedRevision() {
    return this.inFlightRevision ?? this.pendingRevision;
  }

  /**
   * Accepts a new snapshot, replacing any unsaved one.
   *
   * A revision already in flight or already held pending is ignored rather than
   * queued again. Without that, a poll that re-read the outbox mid-save would
   * hand the same snapshot back and it would be written twice, bumping the server
   * version for no reason. Retries reuse the held snapshot and do not come
   * through here.
   */
  queue(event: TimerEvent, revision: string) {
    if (this.halted) return;
    if (revision === this.inFlightRevision) return;
    if (this.pending !== null && revision === this.pendingRevision) return;
    this.queuedSequence += 1;
    this.pending = event;
    this.pendingRevision = revision;
    this.pendingSequence = this.queuedSequence;
    this.retries = 0;
    this.emit("saving");
    this.schedule(this.debounceMs);
  }

  /** Sends whatever is unsaved immediately, skipping the debounce. */
  flush() {
    if (this.halted || !this.pending) return;
    this.schedule(0);
  }

  /**
   * Resumes after a conflict has been resolved by adopting the server's state,
   * or after a session has been re-established.
   */
  resume(version: number) {
    this.version = version;
    this.halted = false;
    this.pending = null;
    this.pendingRevision = null;
    this.retries = 0;
    this.savedSequence = this.queuedSequence;
    this.emit("idle");
  }

  /** Retries a save that gave up after exhausting its backoff. */
  retry() {
    if (this.halted || !this.pending) return;
    this.retries = 0;
    this.schedule(0);
  }

  /**
   * Stops the loop because another device committed a newer version while this
   * one still had unsaved work. Nothing is discarded: the pending snapshot stays
   * in hand and in the outbox, and the operator decides which version wins.
   */
  markConflict() {
    if (this.halted) return;
    this.halted = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.emit("conflict");
  }

  /** Cancels pending work. Used when the component owning this goes away. */
  dispose() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.pending = null;
    this.pendingRevision = null;
  }

  private emit(state: SaveState) {
    if (this.state === state) return;
    this.state = state;
    this.options.onState(state);
  }

  private schedule(delay: number) {
    // A request already in flight will reschedule itself when it settles, so
    // scheduling now would only create a second concurrent writer.
    if (this.inFlight) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private async run() {
    if (this.inFlight || this.halted || !this.pending) return;

    const event = this.pending;
    const sequence = this.pendingSequence;
    const revision = this.pendingRevision!;
    this.pending = null;
    this.pendingRevision = null;
    this.inFlight = true;
    this.inFlightRevision = revision;
    this.emit("saving");

    let outcome: SaveOutcome;
    try {
      outcome = await this.options.save(event, this.version, revision);
    } catch {
      outcome = { status: "offline" };
    }
    this.inFlight = false;
    this.inFlightRevision = null;

    switch (outcome.status) {
      case "saved": {
        this.version = outcome.version;
        this.retries = 0;
        /*
         * The server took this write, so whatever marked a conflict while it was
         * in flight was wrong about it — a poll that saw this very commit, most
         * likely. Staying halted here would silently stop every later edit.
         */
        this.halted = false;
        if (sequence > this.savedSequence) this.savedSequence = sequence;
        if (this.pending) {
          // Newer state arrived while this was in flight; it is not saved yet.
          this.schedule(0);
        } else if (this.savedSequence >= this.queuedSequence) {
          this.emit("saved");
        }
        return;
      }
      case "conflict": {
        this.halted = true;
        this.pending = null;
        this.emit("conflict");
        this.options.onConflict(outcome.payload);
        return;
      }
      case "signed-out": {
        this.halted = true;
        this.pending = null;
        this.emit("signed-out");
        this.options.onSignedOut();
        return;
      }
      case "rejected": {
        /*
         * Retrying an unacceptable document would fail identically, so the loop
         * stops. Its own state, not "Offline": nothing is wrong with the
         * connection, and telling an operator to wait for one would be a lie.
         */
        this.halted = true;
        this.emit("rejected");
        return;
      }
      case "offline": {
        // Newer state may have arrived; only restore this one if it is still
        // the newest thing unsaved.
        if (!this.pending) {
          this.pending = event;
          this.pendingRevision = revision;
          this.pendingSequence = sequence;
        }
        this.emit("offline");
        this.retries += 1;
        if (this.retries <= MAX_RETRIES) {
          this.schedule(outcome.retryAfterMs ?? backoffDelay(this.retries));
        }
        return;
      }
    }
  }
}
