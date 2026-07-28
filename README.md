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
2. Apply both SQL files in `supabase/migrations` in filename order, using the Supabase SQL editor or CLI.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and public anonymous key.
5. In Supabase Authentication, add `http://localhost:3000/auth/callback` and the production callback URL to the allowed redirect URLs.

Once configured, admins can sign in with an email link at `/login`. Their local workspace is uploaded the first time they sign in. Timer state is saved as authoritative timestamps, which keeps viewers accurate even after reconnecting.

Note that no button links to `/login` — the header sync control was removed in favour of a minimal interface, so the route must be visited directly.

## CSV event import

Use the **Import CSV** button on the event dashboard. A file can contain one event or several events grouped by `event_name`. Rows sharing an `item_order` value become a single agenda item, which is how a panel's panelists are grouped — without `item_order`, every row becomes its own item. Agenda items have no titles; they are identified by their speakers. Download `public/event-import-template.csv` for the supported columns and an example containing both a single speaker and a panel.

## Deploy to Vercel

Import the GitHub repository into Vercel and add:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Set `NEXT_PUBLIC_SITE_URL` to the production URL. Vercel detects the Next.js application automatically.

## Data model

The database uses `teams`, `team_members`, `events`, `agenda_items`, `speakers`, and `event_runtime`. Access is restricted to team members. Public audience data is exposed only through an unguessable viewer token and a narrow security-definer database function.

## Commands

```bash
npm run dev
npm run lint
npm run build
```
