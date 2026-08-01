"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, Check, Copy, Download, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createControllerEvent } from "@/lib/event-auth/client";
import { rememberEvent } from "@/lib/event-auth/local-events";
import {
  LOGIN_NAME_MAX_LENGTH,
  loginNameProblem,
  normalizeLoginName,
  sanitizeLoginNameInput,
} from "@/lib/event-auth/login-name";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/event-auth/password-rules";
import type { TimerEvent } from "@/lib/types";

/*
 * A CSV can carry several events, and every one of them is an independent resource
 * that needs its own controller credentials before it can exist at all. Asking for
 * a username and a password per event would make a ten-event import ten forms, so
 * this asks once and numbers the usernames: `summit-1`, `summit-2`, and so on. The
 * numbering is stated on the field itself rather than left to be discovered.
 *
 * Each event still gets its own event id, its own credential row, its own password
 * hash, its own recovery code and its own session — the operator has simply chosen
 * to use one password for a batch they are importing together, exactly as they
 * could by typing the same one twice. Every code is shown once, here, and can be
 * downloaded as one file.
 */

export type ImportedCredential = {
  eventId: string;
  eventName: string;
  loginName: string;
  recoveryCode: string;
};

/** `summit` for one event, `summit-1`…`summit-n` for several. */
function loginNameFor(base: string, index: number, total: number) {
  if (total === 1) return base;
  const suffix = `-${index + 1}`;
  return `${base.slice(0, LOGIN_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
}

export function ImportCredentialsPanel({
  events,
  onCancel,
  onFinished,
}: {
  events: TimerEvent[];
  onCancel: () => void;
  onFinished: (created: ImportedCredential[]) => void;
}) {
  const [base, setBase] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ImportedCredential[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const nameError = touched ? loginNameProblem(base) : null;
  const passwordError = touched ? passwordProblem(password) : null;
  const confirmError = touched && password !== confirmPassword ? "The two passwords do not match." : null;

  function recoveryFile(rows: ImportedCredential[]) {
    return [
      "Timer controller credentials",
      "",
      ...rows.flatMap((row) => [
        `Event: ${row.eventName}`,
        `Controller username: ${row.loginName}`,
        `Recovery code: ${row.recoveryCode}`,
        "",
      ]),
      "Each recovery code is the only way back in if that event's password is forgotten.",
      "They are shown once and cannot be shown again.",
      "",
    ].join("\n");
  }

  async function copyAll(rows: ImportedCredential[]) {
    await navigator.clipboard.writeText(recoveryFile(rows));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  }

  function download(rows: ImportedCredential[]) {
    const url = URL.createObjectURL(new Blob([recoveryFile(rows)], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "timer-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    setTouched(true);
    const problem =
      loginNameProblem(base) ??
      passwordProblem(password) ??
      (password === confirmPassword ? null : "The two passwords do not match.");
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError("");
    const normalized = normalizeLoginName(base);
    const results: ImportedCredential[] = [];

    for (const [index, event] of events.entries()) {
      const loginName = loginNameFor(normalized, index, events.length);
      const result = await createControllerEvent({ loginName, password, event });
      if (!result.ok) {
        setBusy(false);
        /*
         * Events created before the failure are real and already recorded, so
         * they are handed over rather than abandoned; the message names how far
         * the import got.
         */
        const done = results.length
          ? ` ${results.length} of ${events.length} were imported before this.`
          : "";
        setError(`${result.message}${done}`);
        if (results.length) setCreated(results);
        return;
      }
      rememberEvent({
        eventId: result.data.event.id,
        name: result.data.event.name,
        loginName: result.data.loginName,
      });
      results.push({
        eventId: result.data.event.id,
        eventName: result.data.event.name,
        loginName: result.data.loginName,
        recoveryCode: result.data.recoveryCode,
      });
    }

    setBusy(false);
    setPassword("");
    setConfirmPassword("");
    setCreated(results);
  }

  if (created) {
    return (
      <Card className="grid gap-4 p-5" aria-labelledby="import-recovery-heading">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-caution-soft text-caution">
            <KeyRound size={16} aria-hidden />
          </span>
          <div>
            <h2 id="import-recovery-heading" className="text-[17px] font-semibold tracking-[-0.03em]">
              Save these recovery codes
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
              One per event, shown once. Losing a code together with its password means that event
              cannot be recovered by anyone.
            </p>
          </div>
        </div>

        <ul className="grid gap-2">
          {created.map((row) => (
            <li key={row.eventId} className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5">
              <strong className="block text-[13px] font-semibold">{row.eventName}</strong>
              <span className="text-[12px] text-text-muted">{row.loginName}</span>
              <output className="tabular mt-1 block font-mono text-[13px] font-semibold tracking-[0.06em] break-all text-ink">
                {row.recoveryCode}
              </output>
            </li>
          ))}
        </ul>

        {error && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-over" role="alert">
            <AlertCircle size={12} aria-hidden />
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copyAll(created)}>
            {copied ? <Check size={14} className="text-success" aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? "Copied" : "Copy all"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => download(created)}>
            <Download size={14} aria-hidden />
            Download as a file
          </Button>
        </div>

        <label className="flex items-start gap-2.5 text-[13px] font-medium text-ink">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I have saved every recovery code above.
        </label>

        <Button variant="primary" disabled={!acknowledged} onClick={() => onFinished(created)}>
          Done
        </Button>
      </Card>
    );
  }

  return (
    <Card className="grid gap-5 p-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onCancel} disabled={busy}>
          <ArrowLeft size={15} aria-hidden />
          Cancel the import
        </Button>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.04em]">
          Controller credentials for {events.length} event{events.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
          {events.length === 1
            ? "This username and password will control the imported event."
            : "Each event gets its own username, numbered from the one you choose, and its own recovery code."}
        </p>
      </div>

      <div className="grid gap-4">
        <Input
          id="import-login-base"
          label={events.length === 1 ? "Controller username" : "Controller username prefix"}
          value={base}
          required
          disabled={busy}
          autoComplete="username"
          supportingText={
            events.length === 1
              ? "Lowercase letters, numbers, and hyphens."
              : `Becomes ${loginNameFor(base || "event", 0, events.length)}, ${loginNameFor(base || "event", 1, events.length)}, and so on.`
          }
          aria-invalid={Boolean(nameError)}
          errorText={nameError ?? ""}
          onValueChange={(value) => setBase(sanitizeLoginNameInput(value))}
        />
        <Input
          id="import-password"
          label="Controller password"
          type="password"
          value={password}
          required
          disabled={busy}
          autoComplete="new-password"
          supportingText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          aria-invalid={Boolean(passwordError)}
          errorText={passwordError ?? ""}
          onValueChange={setPassword}
        />
        <Input
          id="import-password-confirm"
          label="Repeat the password"
          type="password"
          value={confirmPassword}
          required
          disabled={busy}
          autoComplete="new-password"
          aria-invalid={Boolean(confirmError)}
          errorText={confirmError ?? ""}
          onValueChange={setConfirmPassword}
        />
      </div>

      <div aria-live="polite">
        {error && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-over">
            <AlertCircle size={12} aria-hidden />
            {error}
          </p>
        )}
      </div>

      <Button variant="primary" disabled={busy} onClick={() => void submit()}>
        {busy
          ? `Importing ${events.length} event${events.length === 1 ? "" : "s"}…`
          : `Import ${events.length} event${events.length === 1 ? "" : "s"}`}
      </Button>
    </Card>
  );
}
