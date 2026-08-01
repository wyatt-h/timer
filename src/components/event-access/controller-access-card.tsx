"use client";

import { useEffect, useState } from "react";
import { AlertCircle, KeyRound, LogOut, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryCodePanel } from "@/components/event-access/recovery-code-panel";
import { changeControllerPassword, rotateRecoveryCode } from "@/lib/event-auth/client";
import { listRecentEvents } from "@/lib/event-auth/local-events";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/event-auth/password-rules";

/*
 * What an operator can do to an event itself from inside the control room: leave
 * it, change its password, replace its recovery code, and delete it.
 *
 * Signing out is scoped to this event. A browser running two events keeps the
 * other one, because the session cookies are named per event.
 *
 * Changing the password signs every other device out — that is usually the reason
 * for changing it — and asks for the current password as well, so a borrowed
 * logged-in browser is not enough to take an event over. The device making the
 * change stays signed in: the response carries a replacement session created in
 * the same database transaction.
 *
 * Replacing the recovery code asks for the password too, for the same reason: a
 * recovery code can replace a password, so minting one is a credential change.
 */

type Panel = "none" | "password" | "rotate" | "recovery";

export function ControllerAccessCard({
  eventId,
  onSignOut,
  onDelete,
}: {
  eventId: string;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const [loginName, setLoginName] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  useEffect(() => {
    // Non-sensitive, and only ever what this browser already recorded locally.
    // Read from a microtask, which is how the rest of this application keeps a
    // storage read out of the render that asked for it.
    queueMicrotask(() => {
      const entry = listRecentEvents().find((candidate) => candidate.eventId === eventId);
      if (entry) setLoginName(entry.loginName);
    });
  }, [eventId]);

  function reset() {
    setPanel("none");
    setCurrentPassword("");
    setNewPassword("");
    setError("");
    setRecoveryCode("");
  }

  async function submitPassword() {
    setError("");
    const problem = passwordProblem(newPassword);
    if (problem) {
      setError(`New password: ${problem}`);
      return;
    }
    setBusy(true);
    const result = await changeControllerPassword({ eventId, currentPassword, newPassword });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    reset();
    setNotice("Password changed. Every other device has been signed out.");
    window.setTimeout(() => setNotice(""), 6000);
  }

  async function rotate() {
    setError("");
    setBusy(true);
    // The password again, not just the session: a recovery code is a
    // password-equivalent, and a logged-in tab left open on a shared machine must
    // not be enough to mint one.
    const result = await rotateRecoveryCode({ eventId, currentPassword });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCurrentPassword("");
    setRecoveryCode(result.data.recoveryCode);
    setPanel("recovery");
  }

  if (panel === "recovery" && recoveryCode) {
    return (
      <RecoveryCodePanel
        code={recoveryCode}
        eventName="this event"
        loginName={loginName || "controller"}
        heading="Your new recovery code"
        continueLabel="Done"
        onContinue={reset}
      />
    );
  }

  return (
    <div className="grid gap-2 rounded-field border border-line bg-surface-raised px-3.5 py-3">
      <span className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.07em] text-text-subtle uppercase">
        <ShieldCheck size={12} aria-hidden />
        Controller access
      </span>

      {loginName && (
        <p className="text-[12px] text-text-muted">
          Signed in as <strong className="font-semibold text-ink">{loginName}</strong>
        </p>
      )}

      <div aria-live="polite">
        {notice && <p className="text-[12px] font-medium text-success">{notice}</p>}
        {error && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-over">
            <AlertCircle size={12} aria-hidden />
            {error}
          </p>
        )}
      </div>

      {panel === "rotate" ? (
        <div className="grid gap-2.5">
          <p className="text-[12px] leading-relaxed text-text-muted">
            Confirm the controller password to replace the recovery code. The current code stops
            working straight away.
          </p>
          <Input
            id="rotate-controller-password"
            label="Current password"
            type="password"
            value={currentPassword}
            disabled={busy}
            autoComplete="current-password"
            onValueChange={setCurrentPassword}
          />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void rotate()}>
              {busy ? "Working…" : "New recovery code"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : panel === "password" ? (
        <div className="grid gap-2.5">
          <Input
            id="current-controller-password"
            label="Current password"
            type="password"
            value={currentPassword}
            disabled={busy}
            autoComplete="current-password"
            onValueChange={setCurrentPassword}
          />
          <Input
            id="next-controller-password"
            label="New password"
            type="password"
            value={newPassword}
            disabled={busy}
            autoComplete="new-password"
            supportingText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            onValueChange={setNewPassword}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => void submitPassword()}
            >
              {busy ? "Changing…" : "Change password"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setPanel("password")}>
            <KeyRound size={13} aria-hidden />
            Change the password
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPanel("rotate")}>
            <RefreshCw size={13} aria-hidden />
            New recovery code
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut size={13} aria-hidden />
            Sign out of this event
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-over hover:bg-over-soft hover:text-over"
            onClick={onDelete}
          >
            <Trash2 size={13} aria-hidden />
            Delete this event
          </Button>
        </div>
      )}
    </div>
  );
}
