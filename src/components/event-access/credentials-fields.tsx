"use client";

import { Input } from "@/components/ui/input";
import {
  LOGIN_NAME_MAX_LENGTH,
  loginNameProblem,
  sanitizeLoginNameInput,
} from "@/lib/event-auth/login-name";
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
  loginName: string;
  password: string;
  confirmPassword: string;
};

export const EMPTY_CREDENTIALS: CredentialsDraft = {
  loginName: "",
  password: "",
  confirmPassword: "",
};

/** Null when the draft is ready to send. */
export function credentialsProblem(draft: CredentialsDraft) {
  return (
    loginNameProblem(draft.loginName) ??
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
  const nameError = showErrors ? loginNameProblem(draft.loginName) : null;
  const passwordError = showErrors ? passwordProblem(draft.password) : null;
  const confirmError =
    showErrors && draft.password !== draft.confirmPassword
      ? "The two passwords do not match."
      : null;

  return (
    <div className="grid gap-4">
      <Input
        id="controller-login-name"
        label="Controller username"
        value={draft.loginName}
        disabled={disabled}
        required
        autoComplete="username"
        placeholder={`up to ${LOGIN_NAME_MAX_LENGTH} characters`}
        supportingText="Lowercase letters, numbers, and hyphens. Unique across every event."
        aria-invalid={Boolean(nameError)}
        errorText={nameError ?? ""}
        onValueChange={(value) =>
          onChange({ ...draft, loginName: sanitizeLoginNameInput(value) })
        }
      />
      <Input
        id="controller-password"
        label="Controller password"
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
        Anyone with this username and password can control the event from any device. They are the
        only way in, so there is no account to sign in to and nothing to verify by email.
      </p>
    </div>
  );
}
