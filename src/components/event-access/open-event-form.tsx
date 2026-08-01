"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryCodePanel } from "@/components/event-access/recovery-code-panel";
import { loginToEvent, recoverEvent } from "@/lib/event-auth/client";
import { rememberEvent } from "@/lib/event-auth/local-events";
import { normalizeLoginName, sanitizeLoginNameInput } from "@/lib/event-auth/login-name";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/event-auth/password-rules";
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

type Mode = "open" | "recover";

export function OpenEventForm({
  onOpened,
}: {
  onOpened: (payload: ControllerEvent) => void;
}) {
  const [mode, setMode] = useState<Mode>("open");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState<{
    payload: ControllerEvent;
    recoveryCode: string;
  } | null>(null);

  function remember(payload: ControllerEvent) {
    rememberEvent({
      eventId: payload.event.id,
      name: payload.event.name,
      loginName: payload.loginName,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (mode === "recover") {
      const problem = passwordProblem(password);
      if (problem) {
        setError(`New password: ${problem}`);
        return;
      }
    }

    setBusy(true);
    if (mode === "recover") {
      const result = await recoverEvent({
        loginName: normalizeLoginName(loginName),
        recoveryCode,
        newPassword: password,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      remember(result.data);
      // The replacement code has to be seen before this screen goes away.
      setRecovered({ payload: result.data, recoveryCode: result.data.recoveryCode });
      return;
    }

    const result = await loginToEvent(normalizeLoginName(loginName), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    remember(result.data);
    onOpened(result.data);
  }

  if (recovered) {
    return (
      <RecoveryCodePanel
        code={recovered.recoveryCode}
        eventName={recovered.payload.event.name}
        loginName={recovered.payload.loginName}
        heading="Your new recovery code"
        continueLabel="Open the event"
        onContinue={() => onOpened(recovered.payload)}
      />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid w-full gap-3 rounded-[22px] border border-ink/8 bg-white/80 p-[18px] text-left shadow-[0_22px_70px_rgba(31,26,50,0.08),inset_0_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl"
    >
      <Input
        id="open-login-name"
        label="Controller username"
        value={loginName}
        required
        disabled={busy}
        autoComplete="username"
        onValueChange={(value) => setLoginName(sanitizeLoginNameInput(value))}
      />
      <Input
        id="open-password"
        label={mode === "open" ? "Controller password" : "New controller password"}
        type="password"
        value={password}
        required
        disabled={busy}
        autoComplete={mode === "open" ? "current-password" : "new-password"}
        supportingText={
          mode === "recover" ? `At least ${PASSWORD_MIN_LENGTH} characters.` : undefined
        }
        onValueChange={setPassword}
      />
      {mode === "recover" && (
        <Input
          id="open-recovery-code"
          label="Recovery code"
          value={recoveryCode}
          required
          disabled={busy}
          autoComplete="one-time-code"
          supportingText="The code shown once when the event was created."
          onValueChange={setRecoveryCode}
        />
      )}

      <div aria-live="polite">
        {error && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-over">
            <AlertCircle size={12} aria-hidden />
            {error}
          </p>
        )}
      </div>

      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Checking…" : mode === "open" ? "Open event" : "Set the new password"}
        {!busy && <ArrowRight size={16} aria-hidden />}
      </Button>

      <button
        type="button"
        className="justify-self-start text-[12px] font-semibold text-violet hover:underline"
        onClick={() => {
          setMode(mode === "open" ? "recover" : "open");
          setPassword("");
          setRecoveryCode("");
          setError("");
        }}
      >
        {mode === "open" ? "Forgotten the password?" : "Back to signing in"}
      </button>
    </form>
  );
}
