"use client";

import { useState } from "react";
import { Check, Copy, Download, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * The one and only time a recovery code is ever shown.
 *
 * Only its hash is stored, so this screen cannot be reopened, re-sent, or
 * recovered by support. That is why it blocks: the operator cannot continue until
 * they have said they wrote it down, and the consequence of not doing so is
 * stated plainly rather than buried in help text.
 */

export function RecoveryCodePanel({
  code,
  eventName,
  loginName,
  heading = "Save your recovery code",
  continueLabel = "Continue",
  onContinue,
}: {
  code: string;
  eventName: string;
  loginName: string;
  heading?: string;
  continueLabel?: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  }

  function download() {
    const body = [
      `Timer event: ${eventName}`,
      `Controller username: ${loginName}`,
      `Recovery code: ${code}`,
      "",
      "This code is the only way back in if the controller password is forgotten.",
      "Keep it somewhere the password is not. It is shown once and cannot be shown again.",
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `timer-recovery-${loginName}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="grid gap-4 rounded-[22px] border border-caution/25 bg-caution-soft/50 p-5 text-left"
      aria-labelledby="recovery-code-heading"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white text-caution">
          <KeyRound size={16} aria-hidden />
        </span>
        <div>
          <h2 id="recovery-code-heading" className="text-[17px] font-semibold tracking-[-0.03em]">
            {heading}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Losing both the controller password and this code means{" "}
            <strong className="font-semibold text-ink">{eventName}</strong> cannot be recovered by
            anyone. There is no email address on this event to reset it with.
          </p>
        </div>
      </div>

      <output
        className="tabular block rounded-control border border-ink/10 bg-white px-3.5 py-3 font-mono text-[15px] font-semibold tracking-[0.08em] break-all text-ink"
        aria-label="Recovery code"
      >
        {code}
      </output>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check size={14} className="text-success" aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy code"}
        </Button>
        <Button variant="secondary" size="sm" onClick={download}>
          <Download size={14} aria-hidden />
          Download as a file
        </Button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Recovery code copied to clipboard" : ""}
      </p>

      <label className="flex items-start gap-2.5 text-[13px] font-medium text-ink">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--color-violet,#7757ed)]"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        I have saved this recovery code somewhere safe.
      </label>

      <Button
        variant="primary"
        className={cn("w-full", !acknowledged && "opacity-60")}
        disabled={!acknowledged}
        onClick={onContinue}
      >
        {continueLabel}
      </Button>
    </section>
  );
}
