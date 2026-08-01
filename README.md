# Timer

Timer is a focused event timer for single speakers and multi-speaker panels. An administrator controls the active timer while any number of audience displays follow along through one shareable link.

## What is included

- Team-name onboarding with strict lowercase validation
- Event dashboard and event builder
- Edit existing events at any time
- CSV batch import for one or multiple events
- Single-speaker and panel agenda items, identified by speaker name
- Independent panel-total and per-speaker timing
- Configurable default panelist duration
- Start, pause, reset, skip, and time-adjustment controls
- Drag-to-reorder with drop indicators and inline editing for upcoming live agenda items
- Keyboard shortcuts and a focus mode for the live console
- Compact live control room with a wall clock
- Fullscreen audience display
- Zoom App that publishes the live speaker countdown to every meeting participant
- Realtime Supabase Broadcast updates with a one-second durable-state fallback
- Passwordless email authentication
- Supabase schema, indexes, triggers, and Row Level Security
- Local demo mode when Supabase credentials are absent
- Responsive, accessible interface designed for phones through presentation displays

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, enter a lowercase team name, and use the generated demo event. Local mode uses browser storage and synchronizes between tabs on the same device.

## Connect Supabase

1. Create a Supabase project.
2. Apply every SQL file in `supabase/migrations` in filename order, using the Supabase SQL editor or CLI.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and public anonymous key.
5. In Supabase Authentication, add `http://localhost:3000/auth/callback` and the production callback URL to the allowed redirect URLs.

Once configured, admins can sign in with an email link at `/login`. Their local workspace is uploaded the first time they sign in. Timer state is saved as authoritative timestamps, which keeps viewers accurate even after reconnecting.

Apply new migrations before deploying code that depends on them. The application treats a failed cloud read or write as a reason to fall back to local mode, so a missing column shows up as sync quietly not happening rather than as an error.

Note that no button links to `/login` — the header sync control was removed in favour of a minimal interface, so the route must be visited directly.

## CSV event import

Use the **Import CSV** button on the event dashboard. A file can contain one event or several events grouped by `event_name`. Rows sharing an `item_order` value become a single agenda item, which is how a panel's panelists are grouped — without `item_order`, every row becomes its own item. Agenda items have no titles; they are identified by their speakers. Download `public/event-import-template.csv` for the supported columns and an example containing both a single speaker and a panel.

## Deploy to Vercel

Import the GitHub repository into Vercel and add:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Set `NEXT_PUBLIC_SITE_URL` to the production URL. Vercel detects the Next.js application automatically.

Vercel installs with `npm ci`, so every `resolved` URL in `package-lock.json` must point at `registry.npmjs.org`. Installing behind an internal registry mirror writes that mirror's hostname into the lock file, and the build then fails with `ENOTFOUND`. Rewrite the host and keep the integrity hash, which is the publish-time hash either way.

## Data model

The database uses `teams`, `team_members`, `events`, `agenda_items`, `speakers`, and `event_runtime`. Access is restricted to team members. Public audience data is exposed only through an unguessable viewer token and a narrow security-definer database function. An event also carries an optional `zoom_token`, the pairing code used by the Zoom App, read through a second security-definer function of the same shape.

## Zoom App

The Zoom App at `/zoom` publishes the current speaker's countdown as a Zoom **Dynamic Indicator**, which every participant sees without installing anything. Only the operator installs the app. The application and its Supabase data remain authoritative; the Zoom page never writes to them.

### Connect an event

1. Open the event's control room and press **Create Zoom code**, then copy the code.
2. Open the Timer app inside a Zoom meeting and paste the code.
3. Press **Sync to Zoom**. Nothing reaches the meeting until this is pressed.
4. The indicator appears when the timer is running, and follows pause, resume, time adjustments, speaker changes, and the end of the event.

Press **Stop sharing timer** to retract it.

### Marketplace configuration

Build a **user-managed General App** in the Development environment:

1. `Features → Surface`: enable **Meetings**.
2. Home URL: `https://<your-domain>/zoom`.
3. Domain Allow List: `<your-domain>` and `<project-ref>.supabase.co`.
4. Enable the **Zoom App SDK** and add exactly these APIs and events:

```text
getRunningContext
getSupportedJsApis
setDynamicIndicator
getDynamicIndicator
removeDynamicIndicator
extendDynamicIndicator
onSetDynamicIndicator
onRemoveDynamicIndicator
onExtendDynamicIndicator
```

5. Install with `Development → Local Test`, signed in as the same account as the desktop client.

No Zoom OAuth flow, REST scope, client ID, or client secret is used, so none is stored in this project. Dynamic indicators need a Zoom desktop client from 5.17.5; the page reports it when a client or context cannot support them.

## Commands

```bash
npm run dev
npm run lint
npm run build
```
