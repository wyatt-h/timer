"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginToEvent } from "@/lib/event-auth/client";
import { rememberEvent } from "@/lib/event-auth/local-events";
import { normalizeLoginName } from "@/lib/event-auth/login-name";
import type { ControllerEvent } from "@/lib/event-auth/types";

/*
 * Opening an event on a device that has never seen it: the event's controller
 * username and password, and nothing else. No account and no email — the username
 * is globally unique, so it identifies the event on its own, and the response
 * carries the event id the caller is then sent to.
 *
 * The event id is never asked for and would prove nothing if it were. A failed
 * attempt says only that the pair did not match something, which is the same
 * answer for a username that does not exist as for a password that is wrong.
 */

export function OpenEventForm({
  onOpened,
}: {
  onOpened: (payload: ControllerEvent) => void;
}) {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function remember(payload: ControllerEvent) {
    rememberEvent({
      eventId: payload.event.id,
      name: payload.event.name,
    });
  }

  async function submit() {
    setError("");

    if (!loginName.trim() || !password) {
      setError("Enter the event login name and password.");
      return;
    }

    setBusy(true);
    const result = await loginToEvent(normalizeLoginName(loginName), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    remember(result.data);
    onOpened(result.data);
  }

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      noValidate
      className="grid w-full gap-3 rounded-[22px] border border-ink/8 bg-white/80 p-[18px] text-left shadow-[0_22px_70px_rgba(31,26,50,0.08),inset_0_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl"
    >
      <Input
        id="open-login-name"
        label="Event login name"
        value={loginName}
        required
        disabled={busy}
        autoComplete="username"
        onValueChange={(value) => setLoginName(value.toLowerCase())}
      />
      <Input
        id="open-password"
        label="Event password"
        type="password"
        value={password}
        required
        disabled={busy}
        autoComplete="current-password"
        onValueChange={setPassword}
      />
      <div aria-live="polite">
        {error && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-over">
            <AlertCircle size={12} aria-hidden />
            {error}
          </p>
        )}
      </div>

      <Button type="button" variant="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? "Checking…" : "Open event"}
        {!busy && <ArrowRight size={16} aria-hidden />}
      </Button>
    </form>
  );
}
