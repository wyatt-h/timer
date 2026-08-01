"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { redeemEventInvite } from "@/lib/event-auth/client";
import { rememberEvent } from "@/lib/event-auth/local-events";

type State = "opening" | "error";

export default function InvitePage() {
  const router = useRouter();
  const redemptionStarted = useRef(false);
  const [state, setState] = useState<State>("opening");
  const [message, setMessage] = useState("");

  const redeem = useCallback(async () => {
    if (redemptionStarted.current) return;
    redemptionStarted.current = true;

    const token = window.location.hash.slice(1);
    if (!token) {
      setMessage("This invitation link is incomplete.");
      setState("error");
      return;
    }

    setState("opening");
    setMessage("");
    const result = await redeemEventInvite(token);
    if (!result.ok) {
      redemptionStarted.current = false;
      setMessage(result.message);
      setState("error");
      return;
    }

    rememberEvent({
      eventId: result.data.event.id,
      name: result.data.event.name,
    });
    router.replace(`/events/${result.data.event.id}`);
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => void redeem());
  }, [redeem]);

  return (
    <main className="min-h-svh bg-paper px-5 py-8" id="main">
      <div className="mx-auto w-[min(440px,100%)]">
        <BrandMark />
        <Card className="mt-12 grid justify-items-center gap-4 p-6 text-center">
          {state === "opening" ? (
            <>
              <LoaderCircle className="animate-spin text-violet" size={28} aria-hidden />
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.04em]">
                  Opening your event…
                </h1>
                <p className="mt-1.5 text-[13px] text-text-muted">
                  This invitation can be used once.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="text-over" size={28} aria-hidden />
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.04em]">
                  Invitation unavailable
                </h1>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{message}</p>
              </div>
              <div className="grid w-full gap-2">
                <Button variant="primary" onClick={() => void redeem()}>Try again</Button>
                <Button variant="ghost" onClick={() => router.replace("/")}>Open Timer</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
