"use client";

import Link from "next/link";
import { Cloud, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export function CloudStatus({ team }: { team: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const client = createSupabaseBrowserClient();
    client?.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [configured]);

  if (!configured) {
    return (
      <span className="ghost-button" title="Add Supabase environment variables to enable cloud sync">
        <CloudOff size={14} />
        Demo mode
      </span>
    );
  }

  if (!signedIn) {
    return (
      <Link className="secondary-button" href={`/login?team=${team}`}>
        <Cloud size={14} />
        Sign in to sync
      </Link>
    );
  }

  return (
    <span className="ghost-button" style={{ color: "#16845a" }}>
      <span className="live-dot" />
      Cloud synced
    </span>
  );
}
