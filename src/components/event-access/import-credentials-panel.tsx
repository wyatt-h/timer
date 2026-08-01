"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createControllerEvent } from "@/lib/event-auth/client";
import { rememberEvent } from "@/lib/event-auth/local-events";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/event-auth/password-rules";
import type { TimerEvent } from "@/lib/types";

/*
 * A CSV can carry several events, and every one of them is an independent resource
 * that needs a password before it can exist. The imported event name is its
 * sign-in identifier; one password may be applied to the whole batch.
 */

export type ImportedCredential = {
  eventId: string;
  eventName: string;
};

export function ImportCredentialsPanel({
  events,
  onCancel,
  onFinished,
}: {
  events: TimerEvent[];
  onCancel: () => void;
  onFinished: (created: ImportedCredential[]) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ImportedCredential[] | null>(null);
  const passwordError = touched ? passwordProblem(password) : null;
  const confirmError = touched && password !== confirmPassword ? "The two passwords do not match." : null;

  async function submit() {
    setTouched(true);
    const problem =
      passwordProblem(password) ??
      (password === confirmPassword ? null : "The two passwords do not match.");
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError("");
    const results: ImportedCredential[] = [];

    for (const event of events) {
      const result = await createControllerEvent({ password, event });
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
      });
      results.push({
        eventId: result.data.event.id,
        eventName: result.data.event.name,
      });
    }

    setBusy(false);
    setPassword("");
    setConfirmPassword("");
    onFinished(results);
  }

  if (created) {
    return (
      <Card className="grid gap-4 p-5">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.04em]">
            {created.length} event{created.length === 1 ? "" : "s"} imported
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
            The import stopped before every event was created. These events are ready:
          </p>
        </div>
        <ul className="grid gap-1.5 text-[13px] font-medium">
          {created.map((row) => <li key={row.eventId}>{row.eventName}</li>)}
        </ul>
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-over" role="alert">
          <AlertCircle size={12} aria-hidden />
          {error}
        </p>
        <Button variant="primary" onClick={() => onFinished(created)}>Done</Button>
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
          Password for {events.length} event{events.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
          Each event keeps its imported name. Use that event name and this password to open it on
          another device.
        </p>
      </div>

      <div className="grid gap-4">
        <Input
          id="import-password"
          label="Event password"
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
