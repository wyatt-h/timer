"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { OpenEventForm } from "@/components/event-access/open-event-form";
import { Button } from "@/components/ui/button";

/*
 * Shown when a controller session has expired or belongs to a different event.
 *
 * This is deliberately not the not-found screen. A missing session says nothing
 * about whether the event still exists, so nothing local has been thrown away:
 * the cached event and any unsaved edit are both still on this device, and signing
 * in again resumes them against whatever the server now holds.
 *
 * Saying so on screen matters. An operator who believes their last twenty minutes
 * of edits are gone will start redoing them by hand, which is how a recoverable
 * situation turns into a real conflict.
 */
export function ControllerSignInGate({
  eventId,
  eventName,
  hasUnsavedWork,
  onResumed,
}: {
  eventId: string;
  eventName?: string;
  hasUnsavedWork: boolean;
  onResumed: () => void;
}) {
  const router = useRouter();
  const [wrongEvent, setWrongEvent] = useState<string | null>(null);

  return (
    <main className="grid min-h-svh place-items-center bg-paper p-8" id="main">
      <div className="w-[min(470px,100%)]">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 grid size-11 place-items-center rounded-[14px] bg-violet-soft text-violet-dark">
            <LockKeyhole size={20} aria-hidden />
          </span>
          <h1 className="text-[24px] font-semibold tracking-[-0.04em] text-ink">
            Sign in again to continue
          </h1>
          <p className="mx-auto mt-2 max-w-[42ch] text-[13px] leading-relaxed text-text-muted">
            {eventName ? (
              <>
                This device is no longer signed in to{" "}
                <strong className="font-semibold text-ink">{eventName}</strong>.
              </>
            ) : (
              "This device is no longer signed in to that event."
            )}{" "}
            The event has not been deleted.
          </p>
          {hasUnsavedWork && (
            <p
              role="status"
              className="mx-auto mt-3 max-w-[42ch] rounded-control border border-caution/25 bg-caution-soft px-3.5 py-2.5 text-[12px] leading-relaxed font-medium text-caution"
            >
              Your unsaved changes are still saved on this device and will be sent once you
              sign in.
            </p>
          )}
        </div>

        <OpenEventForm
          onOpened={(payload) => {
            if (payload.event.id === eventId) {
              onResumed();
              return;
            }
            /*
             * Correct credentials, but for a different event. Sending them there is
             * more useful than refusing, and it must not look like this event was
             * reopened.
             */
            setWrongEvent(payload.event.name);
            router.push(`/events/${payload.event.id}`);
          }}
        />

        <div aria-live="polite">
          {wrongEvent && (
            <p className="mt-3 text-center text-[12px] text-text-muted">
              Those credentials belong to {wrongEvent}. Opening it instead…
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-4 w-full"
          onClick={() => router.push("/")}
        >
          Go home
        </Button>
      </div>
    </main>
  );
}
