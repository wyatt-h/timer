"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { AgendaItem, TimerEvent, Workspace } from "@/lib/types";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  broadcastWorkspace,
  pullPublicEvent,
  pullWorkspace,
  pushWorkspace,
} from "@/lib/supabase/remote";

const STORAGE_PREFIX = "aura:workspace:";
const CHANNEL_NAME = "aura-timer-sync";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function sanitizeTeamSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function isValidTeamSlug(value: string) {
  return /^[a-z]{2,32}$/.test(value);
}

export function makeAgendaItem(kind: "single" | "panel" = "single"): AgendaItem {
  const id = makeId();
  return {
    id,
    kind,
    durationSeconds: kind === "panel" ? 20 * 60 : 10 * 60,
    speakerDefaultSeconds: kind === "panel" ? 5 * 60 : undefined,
    speakers:
      kind === "panel"
        ? [
            { id: makeId(), name: "First panelist", durationSeconds: 5 * 60 },
            { id: makeId(), name: "Second panelist", durationSeconds: 5 * 60 },
          ]
        : [{ id: makeId(), name: "", durationSeconds: 10 * 60 }],
  };
}

export function makeEvent(name = "Untitled event"): TimerEvent {
  const first = makeAgendaItem();
  return {
    id: makeId(),
    name,
    date: new Date().toISOString().slice(0, 10),
    status: "draft",
    viewerToken: makeId(),
    agenda: [first],
    runtime: {
      status: "ready",
      segmentIndex: 0,
      remainingSeconds: first.durationSeconds,
      endsAt: null,
      panelStatus: null,
      panelRemainingSeconds: null,
      panelEndsAt: null,
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

function demoWorkspace(team: string): Workspace {
  const event = makeEvent("Annual Leadership Summit");
  event.agenda = [
    {
      id: makeId(),
      kind: "single",
      durationSeconds: 12 * 60,
      speakers: [{ id: makeId(), name: "Maya Chen", durationSeconds: 12 * 60 }],
    },
    {
      id: makeId(),
      kind: "panel",
      durationSeconds: 25 * 60,
      speakerDefaultSeconds: 8 * 60,
      speakers: [
        { id: makeId(), name: "Noah Williams", durationSeconds: 8 * 60 },
        { id: makeId(), name: "Sofia Patel", durationSeconds: 8 * 60 },
        { id: makeId(), name: "Marcus Reed", durationSeconds: 9 * 60 },
      ],
    },
    {
      id: makeId(),
      kind: "single",
      durationSeconds: 8 * 60,
      speakers: [{ id: makeId(), name: "Elena Park", durationSeconds: 8 * 60 }],
    },
  ];
  event.runtime.remainingSeconds = event.agenda[0].durationSeconds;

  const completed = makeEvent("Spring Product Forum");
  completed.status = "completed";
  completed.date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 36).toISOString().slice(0, 10);

  return { team, events: [event, completed], updatedAt: Date.now() };
}

function storageKey(team: string) {
  return `${STORAGE_PREFIX}${team}`;
}

export function loadWorkspace(team: string): Workspace | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(team));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Workspace;
  } catch {
    return null;
  }
}

export function ensureWorkspace(team: string) {
  const current = loadWorkspace(team);
  if (current) return current;
  const workspace = demoWorkspace(team);
  persistWorkspace(workspace);
  return workspace;
}

export function persistWorkspace(workspace: Workspace) {
  if (typeof window === "undefined") return;
  const next = { ...workspace, updatedAt: Date.now() };
  window.localStorage.setItem(storageKey(workspace.team), JSON.stringify(next));
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ team: workspace.team, updatedAt: next.updatedAt });
    channel.close();
  } catch {
    // The storage event remains a reliable fallback.
  }
  if (isSupabaseConfigured()) {
    const client = createSupabaseBrowserClient();
    if (client) {
      void broadcastWorkspace(client, next).catch(() => undefined);
      void client.auth.getSession().then(({ data }) => {
        if (data.session) void pushWorkspace(client, next).catch(() => undefined);
      });
    }
  }
}

export function findEventByToken(token: string): { workspace: Workspace; event: TimerEvent } | null {
  if (typeof window === "undefined") return null;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    try {
      const workspace = JSON.parse(window.localStorage.getItem(key) ?? "") as Workspace;
      const event = workspace.events.find((candidate) => candidate.viewerToken === token);
      if (event) return { workspace, event };
    } catch {
      // Ignore unrelated or malformed local data.
    }
  }
  return null;
}

export function useWorkspace(team: string) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const refresh = useCallback(() => {
    setWorkspace(ensureWorkspace(team));
  }, [team]);

  useEffect(() => {
    queueMicrotask(refresh);
    if (isSupabaseConfigured()) {
      const client = createSupabaseBrowserClient();
      if (client) {
        void client.auth.getSession().then(async ({ data }) => {
          if (!data.session) return;
          try {
            const remote = await pullWorkspace(client, team);
            if (remote?.events.length) {
              window.localStorage.setItem(storageKey(team), JSON.stringify(remote));
              setWorkspace(remote);
            } else {
              await pushWorkspace(client, ensureWorkspace(team));
            }
          } catch {
            // Local mode remains available if cloud sync is temporarily unavailable.
          }
        });
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(team)) refresh();
    };
    window.addEventListener("storage", onStorage);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.team === team) refresh();
      };
    } catch {
      channel = null;
    }
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [refresh, team]);

  const update = useCallback(
    (updater: (current: Workspace) => Workspace) => {
      setWorkspace((current) => {
        const base = current ?? ensureWorkspace(team);
        const next = updater(base);
        persistWorkspace(next);
        return next;
      });
    },
    [team],
  );

  return { workspace, update, refresh };
}

export function usePublicEvent(token: string) {
  const [result, setResult] = useState<ReturnType<typeof findEventByToken>>(null);

  const refresh = useCallback(() => setResult(findEventByToken(token)), [token]);

  useEffect(() => {
    queueMicrotask(refresh);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    let localChannel: BroadcastChannel | null = null;
    try {
      localChannel = new BroadcastChannel(CHANNEL_NAME);
      localChannel.onmessage = refresh;
    } catch {
      localChannel = null;
    }
    let cloudInterval: number | null = null;
    let realtimeChannel: RealtimeChannel | null = null;
    let realtimeClient: SupabaseClient | null = null;
    if (isSupabaseConfigured()) {
      const client = createSupabaseBrowserClient();
      if (client) {
        realtimeClient = client;
        const cloudRefresh = async () => {
          const cloudResult = await pullPublicEvent(client, token);
          if (cloudResult) setResult(cloudResult);
        };
        void cloudRefresh();
        cloudInterval = window.setInterval(() => void cloudRefresh(), 1000);
        realtimeChannel = client
          .channel(`event:${token}`)
          .on("broadcast", { event: "state" }, ({ payload }) => {
            if (!payload?.event || !payload?.team) return;
            const event = payload.event as TimerEvent;
            setResult({
              workspace: { team: payload.team, events: [event], updatedAt: Date.now() },
              event,
            });
          })
          .subscribe();
      }
    }
    return () => {
      window.removeEventListener("storage", onStorage);
      localChannel?.close();
      if (realtimeChannel) void realtimeClient?.removeChannel(realtimeChannel);
      if (cloudInterval) window.clearInterval(cloudInterval);
    };
  }, [refresh, token]);

  return result;
}
