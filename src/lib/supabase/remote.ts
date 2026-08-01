import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgendaItem, TimerEvent, Speaker, Workspace } from "@/lib/types";

type DbSpeaker = {
  id: string;
  name: string;
  duration_seconds: number;
  sound_muted: boolean | null;
  order_index: number;
};

type DbAgenda = {
  id: string;
  kind: "single" | "panel";
  duration_seconds: number;
  speaker_default_seconds: number | null;
  host: string | null;
  sound_muted: boolean | null;
  order_index: number;
  speakers: DbSpeaker[];
};

type DbRuntime = {
  status: "ready" | "running" | "paused" | "ended";
  segment_index: number;
  remaining_seconds: number;
  ends_at: string | null;
  panel_status: "ready" | "running" | "paused" | "ended" | null;
  panel_remaining_seconds: number | null;
  panel_ends_at: string | null;
  sound_enabled: boolean | null;
  updated_at: string;
};

type DbEvent = {
  id: string;
  name: string;
  event_date: string;
  status: "draft" | "live" | "completed";
  viewer_token: string;
  zoom_token: string | null;
  created_at: string;
  agenda_items: DbAgenda[];
  event_runtime: DbRuntime | DbRuntime[] | null;
};

function mapSpeaker(row: DbSpeaker): Speaker {
  return {
    id: row.id,
    name: row.name,
    durationSeconds: row.duration_seconds,
    soundMuted: row.sound_muted ?? undefined,
  };
}

function mapAgenda(row: DbAgenda): AgendaItem {
  return {
    id: row.id,
    kind: row.kind,
    durationSeconds: row.duration_seconds,
    speakerDefaultSeconds: row.speaker_default_seconds ?? undefined,
    host: row.host ?? undefined,
    soundMuted: row.sound_muted ?? undefined,
    speakers: [...(row.speakers ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map(mapSpeaker),
  };
}

function mapEvent(row: DbEvent): TimerEvent {
  const runtime = Array.isArray(row.event_runtime) ? row.event_runtime[0] : row.event_runtime;
  return {
    id: row.id,
    name: row.name,
    date: row.event_date,
    status: row.status,
    viewerToken: row.viewer_token,
    zoomToken: row.zoom_token ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    agenda: [...(row.agenda_items ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map(mapAgenda),
    runtime: runtime
      ? {
          status: runtime.status,
          segmentIndex: runtime.segment_index,
          remainingSeconds: Number(runtime.remaining_seconds),
          endsAt: runtime.ends_at ? new Date(runtime.ends_at).getTime() : null,
          panelStatus: runtime.panel_status,
          panelRemainingSeconds:
            runtime.panel_remaining_seconds === null
              ? null
              : Number(runtime.panel_remaining_seconds),
          panelEndsAt: runtime.panel_ends_at
            ? new Date(runtime.panel_ends_at).getTime()
            : null,
          soundEnabled: runtime.sound_enabled ?? true,
          updatedAt: new Date(runtime.updated_at).getTime(),
        }
      : {
          status: "ready",
          segmentIndex: 0,
          remainingSeconds: row.agenda_items?.[0]?.duration_seconds ?? 600,
          endsAt: null,
          panelStatus: null,
          panelRemainingSeconds: null,
          panelEndsAt: null,
          soundEnabled: true,
          updatedAt: Date.now(),
        },
  };
}

export async function pullWorkspace(client: SupabaseClient, team: string): Promise<Workspace | null> {
  const { data: teamRow, error: teamError } = await client
    .from("teams")
    .select("id, slug")
    .eq("slug", team)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!teamRow) return null;

  const { data, error } = await client
    .from("events")
    .select(
      "id, name, event_date, status, viewer_token, zoom_token, created_at, agenda_items(id, kind, duration_seconds, speaker_default_seconds, host, sound_muted, order_index, speakers(id, name, duration_seconds, sound_muted, order_index)), event_runtime(status, segment_index, remaining_seconds, ends_at, panel_status, panel_remaining_seconds, panel_ends_at, sound_enabled, updated_at)",
    )
    .eq("team_id", teamRow.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return {
    team,
    events: ((data ?? []) as unknown as DbEvent[]).map(mapEvent),
    updatedAt: Date.now(),
  };
}

export async function pushWorkspace(client: SupabaseClient, workspace: Workspace) {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;

  const { data: existingTeam, error: teamError } = await client
    .from("teams")
    .select("id")
    .eq("slug", workspace.team)
    .maybeSingle();

  if (teamError) throw teamError;
  let teamRow = existingTeam;
  if (!teamRow) {
    const created = await client
      .from("teams")
      .insert({ slug: workspace.team, name: workspace.team, created_by: user.id })
      .select("id")
      .single();
    if (created.error) throw created.error;
    teamRow = created.data;
  }

  for (const event of workspace.events) {
    const eventResult = await client.from("events").upsert({
      id: event.id,
      team_id: teamRow.id,
      name: event.name,
      event_date: event.date,
      status: event.status,
      viewer_token: event.viewerToken,
      zoom_token: event.zoomToken ?? null,
      created_by: user.id,
    });
    if (eventResult.error) throw eventResult.error;

    const agendaIds = event.agenda.map((item) => item.id);
    const existingAgenda = await client.from("agenda_items").select("id").eq("event_id", event.id);
    if (existingAgenda.error) throw existingAgenda.error;
    const staleAgenda = (existingAgenda.data ?? [])
      .map((row) => row.id)
      .filter((id) => !agendaIds.includes(id));
    if (staleAgenda.length) {
      const removed = await client.from("agenda_items").delete().in("id", staleAgenda);
      if (removed.error) throw removed.error;
    }

    for (const [orderIndex, item] of event.agenda.entries()) {
      const agendaResult = await client.from("agenda_items").upsert({
        id: item.id,
        event_id: event.id,
        kind: item.kind,
        duration_seconds: item.durationSeconds,
        speaker_default_seconds: item.speakerDefaultSeconds ?? null,
        host: item.host?.trim() || null,
        sound_muted: item.soundMuted ?? null,
        order_index: orderIndex,
      });
      if (agendaResult.error) throw agendaResult.error;

      const speakerIds = item.speakers.map((speaker) => speaker.id);
      const existingSpeakers = await client.from("speakers").select("id").eq("agenda_item_id", item.id);
      if (existingSpeakers.error) throw existingSpeakers.error;
      const staleSpeakers = (existingSpeakers.data ?? [])
        .map((row) => row.id)
        .filter((id) => !speakerIds.includes(id));
      if (staleSpeakers.length) {
        const removed = await client.from("speakers").delete().in("id", staleSpeakers);
        if (removed.error) throw removed.error;
      }

      if (item.speakers.length) {
        const speakersResult = await client.from("speakers").upsert(
          item.speakers.map((speaker, speakerIndex) => ({
            id: speaker.id,
            agenda_item_id: item.id,
            name: speaker.name,
            duration_seconds: speaker.durationSeconds,
            sound_muted: speaker.soundMuted ?? null,
            order_index: speakerIndex,
          })),
        );
        if (speakersResult.error) throw speakersResult.error;
      }
    }

    const runtimeResult = await client.from("event_runtime").upsert({
      event_id: event.id,
      status: event.runtime.status,
      segment_index: event.runtime.segmentIndex,
      remaining_seconds: event.runtime.remainingSeconds,
      ends_at: event.runtime.endsAt ? new Date(event.runtime.endsAt).toISOString() : null,
      panel_status: event.runtime.panelStatus ?? null,
      panel_remaining_seconds: event.runtime.panelRemainingSeconds ?? null,
      panel_ends_at: event.runtime.panelEndsAt
        ? new Date(event.runtime.panelEndsAt).toISOString()
        : null,
      sound_enabled: event.runtime.soundEnabled ?? true,
      updated_by: user.id,
    });
    if (runtimeResult.error) throw runtimeResult.error;
  }
}

/**
 * Both public lookups return the same payload from the same database function,
 * so they share one mapper: timestamps arrive as ISO strings and become the
 * epoch milliseconds the rest of the application works in.
 */
function mapPublicPayload(data: unknown): { workspace: Workspace; event: TimerEvent } {
  const payload = data as {
    team: string;
    event: TimerEvent & {
      runtime: TimerEvent["runtime"] & {
        endsAt: string | null;
        panelEndsAt: string | null;
        updatedAt: string;
      };
    };
  };
  const event: TimerEvent = {
    ...payload.event,
    runtime: {
      ...payload.event.runtime,
      endsAt: payload.event.runtime.endsAt
        ? new Date(payload.event.runtime.endsAt).getTime()
        : null,
      panelEndsAt: payload.event.runtime.panelEndsAt
        ? new Date(payload.event.runtime.panelEndsAt).getTime()
        : null,
      updatedAt: new Date(payload.event.runtime.updatedAt).getTime(),
    },
  };
  return {
    workspace: { team: payload.team, events: [event], updatedAt: Date.now() },
    event,
  };
}

export async function pullPublicEvent(
  client: SupabaseClient,
  token: string,
): Promise<{ workspace: Workspace; event: TimerEvent } | null> {
  const { data, error } = await client.rpc("get_public_event", { p_token: token });
  if (error || !data) return null;
  return mapPublicPayload(data);
}

/**
 * The same read, addressed by an event's Zoom pairing code. Read-only and
 * anonymous, exactly like the audience lookup — the Zoom App never writes.
 */
export async function pullZoomEvent(
  client: SupabaseClient,
  zoomToken: string,
): Promise<{ workspace: Workspace; event: TimerEvent } | null> {
  const { data, error } = await client.rpc("get_zoom_event", { p_token: zoomToken });
  if (error || !data) return null;
  return mapPublicPayload(data);
}

export async function broadcastWorkspace(client: SupabaseClient, workspace: Workspace) {
  await Promise.all(
    workspace.events
      .filter((event) => event.status === "live")
      .map(
        (event) =>
          new Promise<void>((resolve) => {
            const channel = client.channel(`event:${event.viewerToken}`);
            channel.subscribe(async (status) => {
              if (status !== "SUBSCRIBED") return;
              await channel.send({
                type: "broadcast",
                event: "state",
                payload: { team: workspace.team, event },
              });
              await client.removeChannel(channel);
              resolve();
            });
            window.setTimeout(async () => {
              await client.removeChannel(channel);
              resolve();
            }, 2500);
          }),
      ),
  );
}
