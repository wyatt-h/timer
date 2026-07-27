# Aura Timer

Aura Timer is a focused event timer for single speakers and multi-speaker panels. An administrator controls the active timer while any number of audience displays follow along through one shareable link.

## What is included

- Team-name onboarding with strict lowercase validation
- Event dashboard and event builder
- Single-speaker and panel agenda items
- Per-speaker panel timing
- Start, pause, reset, skip, and time-adjustment controls
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
2. Apply `supabase/migrations/20260727000000_initial_schema.sql` in the Supabase SQL editor or with the Supabase CLI.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and public anonymous key.
5. In Supabase Authentication, add `http://localhost:3000/auth/callback` and the production callback URL to the allowed redirect URLs.

Once configured, admins can sign in with an email link. Their local workspace is uploaded the first time they sign in. Timer state is saved as authoritative timestamps, which keeps viewers accurate even after reconnecting.

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
