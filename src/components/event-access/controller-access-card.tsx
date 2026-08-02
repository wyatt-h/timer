"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changeControllerPassword,
  createEventInvite,
  revokeEventInvite,
  type EventInvite,
} from "@/lib/event-auth/client";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/event-auth/password-rules";

/*
 * What an operator can do to an event itself from inside the control room: leave
 * it, change its password, and delete it.
 *
 * Signing out is scoped to this event. A browser running two events keeps the
 * other one, because the session cookies are named per event.
 *
 * Changing the password signs every other device out — that is usually the reason
 * for changing it — and asks for the current password as well, so a borrowed
 * logged-in browser is not enough to take an event over. The device making the
 * change stays signed in: the response carries a replacement session created in
 * the same database transaction.
 */

type Panel = "none" | "password" | "invite";

export function ControllerAccessCard({
  eventId,
  loginName,
  onSignOut,
  onDelete,
}: {
  eventId: string;
  loginName: string;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const [panel, setPanel] = useState<Panel>("none");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<EventInvite | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setPanel("none");
    setCurrentPassword("");
    setNewPassword("");
    setError("");
    setCopied(false);
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

  async function makeInvite() {
    setBusy(true);
    setError("");
    setNotice("");
    const result = await createEventInvite(eventId);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setInvite(result.data);
    setPanel("invite");
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
    } catch {
      setError("The invitation is ready, but this browser could not copy it.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  }

  async function revokeInvite() {
    if (!invite) return;
    setBusy(true);
    setError("");
    const result = await revokeEventInvite(eventId, invite.inviteId);
    setBusy(false);
    if (!result.ok && result.code !== "not_found") {
      setError(result.message);
      return;
    }
    setInvite(null);
    setPanel("none");
    setNotice("Invitation revoked. The link can no longer be used.");
    window.setTimeout(() => setNotice(""), 6000);
  }

  return (
    <details className="group rounded-field border border-line bg-surface-raised">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 marker:content-none">
        <span className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.07em] text-text-subtle uppercase">
          <ShieldCheck size={12} aria-hidden />
          Event access
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className="text-text-subtle transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-2 border-t border-line-soft px-3.5 py-3">
      <p className="text-[12px] text-text-muted">
        Login name: <strong className="font-mono font-semibold text-ink">{loginName}</strong>
      </p>

      <div aria-live="polite">
        {notice && <p className="text-[12px] font-medium text-success">{notice}</p>}
        {error && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-over">
            <AlertCircle size={12} aria-hidden />
            {error}
          </p>
        )}
      </div>

      {panel === "invite" && invite ? (
        <div className="grid gap-3">
          <p className="text-[12px] leading-relaxed text-text-muted">
            This link can be used multiple times for 24 hours. Creating another invitation
            revokes this one.
          </p>
          <output className="block overflow-hidden text-ellipsis whitespace-nowrap rounded-control border border-line bg-white px-3 py-2 font-mono text-[11px] text-text-muted">
            {invite.inviteUrl}
          </output>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void copyInvite()}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void revokeInvite()}>
              <X size={13} aria-hidden />
              {busy ? "Revoking…" : "Revoke"}
            </Button>
          </div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>Close</Button>
        </div>
      ) : panel === "password" ? (
        <div className="grid gap-2.5">
          <Input
            id="current-event-password"
            label="Current password"
            type="password"
            value={currentPassword}
            disabled={busy}
            autoComplete="current-password"
            onValueChange={setCurrentPassword}
          />
          <Input
            id="next-event-password"
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
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void makeInvite()}>
            <Link2 size={13} aria-hidden />
            {busy ? "Creating invitation…" : "Create invitation link"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPanel("password")}>
            <KeyRound size={13} aria-hidden />
            Change the password
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
    </details>
  );
}
