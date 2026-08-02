"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
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
  const [loginNameNotice, setLoginNameNotice] = useState("");
  const loginNameError = showErrors ? loginNameProblem(draft.loginName) : null;
  const passwordError = showErrors ? passwordProblem(draft.password) : null;
  const confirmError =
    showErrors && draft.password !== draft.confirmPassword
      ? "The two passwords do not match."
      : null;
  const passwordsMatch =
    draft.confirmPassword.length > 0 &&
    passwordProblem(draft.password) === null &&
    draft.password === draft.confirmPassword;

  function changeLoginName(value: string) {
    const sanitized = sanitizeLoginNameInput(value);
    if (!value) {
      setLoginNameNotice("");
    } else if (sanitized !== value) {
      const changedCase = value.toLowerCase() !== value;
      const removedCharacters = sanitized !== value.toLowerCase();
      setLoginNameNotice(
        changedCase && removedCharacters
          ? "Converted to lowercase and removed unsupported characters."
          : changedCase
            ? "Converted to lowercase."
            : "Removed unsupported characters.",
      );
    }
    onChange({ ...draft, loginName: sanitized });
  }

  return (
    <div className="grid gap-4">
      <Input
        id="event-login-name"
        label="Event login name"
        value={draft.loginName}
        disabled={disabled}
        required
        autoComplete="username"
        supportingText={
          loginNameNotice ||
          "Use lowercase letters, numbers, and dashes only. No spaces or special characters."
        }
        aria-invalid={Boolean(loginNameError)}
        errorText={loginNameError ?? ""}
        onValueChange={changeLoginName}
      />
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
      {passwordsMatch && (
        <p
          role="status"
          className="-mt-2 flex items-center gap-1.5 text-[12px] font-medium text-success"
        >
          <CircleCheck size={14} aria-hidden />
          Passwords match
        </p>
      )}
      <p className="text-[12px] leading-relaxed text-text-subtle">
        This lowercase login name and password open the event on any device. There is no account,
        so choose credentials you can share with the people running it.
      </p>
    </div>
  );
}
