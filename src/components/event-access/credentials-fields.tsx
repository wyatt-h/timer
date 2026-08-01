"use client";

import { Input } from "@/components/ui/input";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/event-auth/password-rules";

/*
 * The credentials that will own an event, collected once at creation.
 *
 * The rules shown here are the same module the route handler validates with, so
 * a field never accepts something the server will reject. Problems are reported
 * only after a field has been touched — a password is invalid for its whole first
 * eleven characters, and saying so on every keystroke is noise.
 */

export type CredentialsDraft = {
  password: string;
  confirmPassword: string;
};

export const EMPTY_CREDENTIALS: CredentialsDraft = {
  password: "",
  confirmPassword: "",
};

/** Null when the draft is ready to send. */
export function credentialsProblem(draft: CredentialsDraft) {
  return (
    passwordProblem(draft.password) ??
    (draft.password === draft.confirmPassword ? null : "The two passwords do not match.")
  );
}

export function CredentialsFields({
  draft,
  onChange,
  showErrors,
  disabled,
}: {
  draft: CredentialsDraft;
  onChange: (draft: CredentialsDraft) => void;
  showErrors: boolean;
  disabled?: boolean;
}) {
  const passwordError = showErrors ? passwordProblem(draft.password) : null;
  const confirmError =
    showErrors && draft.password !== draft.confirmPassword
      ? "The two passwords do not match."
      : null;

  return (
    <div className="grid gap-4">
      <Input
        id="controller-password"
        label="Event password"
        type="password"
        value={draft.password}
        disabled={disabled}
        required
        autoComplete="new-password"
        supportingText={`At least ${PASSWORD_MIN_LENGTH} characters. Spaces count and are kept exactly as typed.`}
        aria-invalid={Boolean(passwordError)}
        errorText={passwordError ?? ""}
        onValueChange={(password) => onChange({ ...draft, password })}
      />
      <Input
        id="controller-password-confirm"
        label="Repeat the password"
        type="password"
        value={draft.confirmPassword}
        disabled={disabled}
        required
        autoComplete="new-password"
        aria-invalid={Boolean(confirmError)}
        errorText={confirmError ?? ""}
        onValueChange={(confirmPassword) => onChange({ ...draft, confirmPassword })}
      />
      <p className="text-[12px] leading-relaxed text-text-subtle">
        The event name and this password open the event on any device. There is no account or
        recovery code, so choose a password you can share with the people running it.
      </p>
    </div>
  );
}
