# Timer

Timer is a focused event timer for single speakers and multi-speaker panels. An administrator controls the active timer while any number of audience displays follow along through one shareable link.

## What is included

- Independent events: no teams, no accounts, no workspace to belong to
- Event controller credentials: a unique username and password per event
- One-time recovery code per event, rotatable from the control room
- Event builder, reachable straight from the home screen
- Edit existing events at any time
- CSV batch import for one or multiple events
- Single-speaker and panel agenda items, identified by speaker name
- Independent panel-total and per-speaker timing
- Configurable default panelist duration
- Start, pause, reset, skip, and time-adjustment controls
- Drag-to-reorder with drop indicators and inline editing for upcoming live agenda items
- Keyboard shortcuts and a focus mode for the live console
- Compact live control room with a wall clock and a visible cloud save state
- Fullscreen audience display
- Zoom App that publishes the live speaker countdown to every meeting participant
- Cloud synchronization by polling: a controller device picks up another device's committed changes within about a second
- Atomic, versioned event writes through server-only route handlers
- Supabase schema, indexes, triggers, and Row Level Security
- Offline cache so a temporary network loss does not lose an edit
- Responsive, accessible interface designed for phones through presentation displays

## How access works

There are no user accounts and no teams. **An event is an independent resource
that carries its own controller username and password**, chosen when it is
created.

- **Create an event** asks for nothing up front. The controller username and
  password are chosen in the builder, at the point where there is an event for them
  to own.
- **Open an event** on any other device needs that event's username and password.
  Nothing else — the username is globally unique, so it identifies the event on
  its own, and the response says which event to open.
- A controller signed in to one event cannot see, read, or change another. Every
  request proves a session for the exact event it names.
- Signing in sets an HTTP-only, `SameSite=Lax`, `Secure`-in-production cookie
  named after the event, with a **30-day** lifetime that slides forward on use. A
  browser therefore signs in once per event and comes back to it after a restart
  without signing in again. Several events can be open in the same browser at
  once, and signing out of one leaves the others alone.
- **The browser never stores a password or a session token.** What is kept
  locally is an offline cache of the event and a list of event ids, display names
  and usernames this device has opened, both in `localStorage`, plus a per-tab
  outbox in `sessionStorage` holding any edit the server has not yet confirmed. The
  event list is a convenience, never an authorization: no endpoint returns a
  directory of events, and every entry is re-checked against its own session.
- A **recovery code** is shown exactly once when an event is created. It is the
  only way back in if the password is forgotten, and only its hash is stored.
  **Losing both the password and the recovery code means the event cannot be
  recovered by anyone** — there is no email address on the event to reset it
  with. The control room can change the password and issue a new recovery code at
  any time; either action shows the replacement once.
- **Audience links stay anonymous and read-only** through an unguessable viewer
  token, and the **Zoom App stays anonymous and read-only** through a pairing
  code. Neither needs controller credentials.
- The underlying tables are **not publicly writable**. Credential, session, and
  rate-limit rows are unreachable by the browser's `anon` key entirely; every
  controller write goes through a server-side route handler that validates the
  session first and then calls a transactional database function.
- Sessions end on sign-out, on a password change, on a recovery, and when the
  30 days lapse. A password change or recovery replaces the secret, retires every
  other session and issues this device's replacement **in one database
  transaction**, so it cannot half-apply.
- **An expired session is not a deleted event.** A 401 or 403 asks for the password
  again and keeps the cached event and any unsaved edit exactly where they are;
  signing back in resumes them against whatever the server now holds, still under
  optimistic concurrency. Local data is cleared only on a confirmed deletion, a
  confirmed 404, or an explicit sign-out.
- Replacing a recovery code needs the current password too, because a recovery code
  can replace a password.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Creating or opening an event needs Supabase
configured, including the server-only service-role key — an event exists in the
database, not in the browser.

Once an event has been opened on a device, `localStorage` acts as an offline cache
of what the server has acknowledged, and the tab's `sessionStorage` holds an outbox
for what it has not. The control room keeps working through a network loss, shows
**Offline** rather than **Saved**, survives a reload with the unsaved edit intact,
and sends it when the connection returns.

Separate devices stay in step by polling: a controller re-reads its authenticated
endpoint about once a second while the tab is visible, backing off while hidden and
reconciling immediately on return. Tabs on the *same* device also use a browser-local
`BroadcastChannel`, which saves a round trip.

### Two controllers at once

Every authorized controller is editable — there is no ownership, no lease and no
read-only mode. Each save carries the version it started from, so the first one
wins and the second is refused with a 409 carrying the state that won; that
controller keeps its own edit on screen and chooses **Use the other version** or
**Keep my changes**, which rewrites it on top of the version that exists now.

Both choices read the server before they change anything, and the timer controls
stay live while they do — freezing the show to settle a naming conflict would be
worse than the conflict. So each choice is guarded: only one runs at a time,
**Use the other version** discards only the exact edit that was on screen when it
was chosen (if something changed meanwhile it asks again, having discarded
nothing), and **Keep my changes** keeps whatever is unsaved at the moment it
applies, including an edit made while it was loading.

Two tabs of one browser are two controllers by that definition, which is why the
outbox is per tab. The tradeoff is deliberate and worth stating: `sessionStorage`
survives a reload but not closing the tab, so an edit that never reached the server
dies with its tab. The autosave debounce is a fraction of a second, so the window is
small, and the alternative was a cross-tab coordination protocol for a rare case the
version check already handles.

**No browser ever publishes state.** Every screen reads. There is no Supabase
Realtime channel in the client, because a public Broadcast channel is one that
anybody holding an audience link could also publish on — which would let them push
a fabricated timer to every screen watching.

## Connect Supabase

1. Create a Supabase project.
2. Apply every SQL file in `supabase/migrations` in filename order. Prefer
   `supabase db push`; see `docs/event-controller-auth-migration.md` for the
   preflight and validation SQL.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL, the public anonymous key, and `SUPABASE_SERVICE_ROLE_KEY`.

`SUPABASE_SERVICE_ROLE_KEY` must never carry the `NEXT_PUBLIC_` prefix. It is
read only by the `/api` route handlers, through a module marked `server-only`, so
importing it from a client component is a build error rather than a leaked secret.

**Apply migrations before deploying code that depends on them.** The controller
routes call database functions that do not exist until the migration has run.

### Teams and email sign-in are gone

Earlier versions scoped events to a team and required a Supabase user to own one.
Both are removed: `teams`, `team_members`, `team_role`, `events.team_id`,
`events.created_by`, the membership functions and the `/login` and `/auth/callback`
routes no longer exist. The historical migrations still create that schema, because
that is what happened; the controller-auth migration removes it.

There is no compatibility path for team-based events, and the migration refuses to
run while any legacy event row exists rather than orphaning it. See
`docs/event-controller-auth-migration.md`.


## CSV event import

Use **Import from CSV** on the home screen. A file can contain one event or several events grouped by `event_name`. Rows sharing an `item_order` value become a single agenda item, which is how a panel's panelists are grouped — without `item_order`, every row becomes its own item. Agenda items have no titles; they are identified by their speakers. Download `public/event-import-template.csv` for the supported columns and an example containing both a single speaker and a panel.

Every imported event is independent, so each one needs credentials before it can
exist. No team name is asked for or generated. After the file is parsed the import
asks once for a controller username and a password: a single event uses the
username as given, and several events get numbered usernames from it — `summit-1`,
`summit-2`, and so on, which the field states before you commit to it. Each event
gets its own event id, credential record, password hash, recovery code and session.
Every code is shown once, together, with copy-all and download options.

## Deploy to Vercel

Import the GitHub repository into Vercel and add:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, for Production and Preview

Set `NEXT_PUBLIC_SITE_URL` to the production URL. Vercel detects the Next.js application automatically.

Apply the database migration **before** the deployment that needs it. The
controller routes call database functions that do not exist beforehand, so
deploying first makes every create, sign-in, and save fail until the migration
lands. `docs/event-controller-auth-migration.md` has the preflight SQL, the exact
filename, the validation SQL, a smoke test, and rollback guidance.

**Environment variables are read at build and boot, not on demand.** Adding or
changing one has no effect on the running deployment — redeploy afterwards.

Vercel installs with `npm ci`, so every `resolved` URL in `package-lock.json` must point at `registry.npmjs.org`. Installing behind an internal registry mirror writes that mirror's hostname into the lock file, and the build then fails with `ENOTFOUND`. Rewrite the host and keep the integrity hash, which is the publish-time hash either way.

## Data model

```text
events
  ├── agenda_items ── speakers
  ├── event_runtime
  └── event_access ── event_sessions
```

Seven tables, and no team among them. An event is owned by its `event_access`
record and by nothing else; a row in `event_sessions` grants access to exactly one
event. `events` carries no `team_id` and no `created_by`, and no event table
references `auth.users`.

`events.version` carries optimistic concurrency: a save supplies the version it
last read, the write increments it only on a match, and a mismatch returns 409 so a
second device's work is never silently overwritten.

`event_access`, `event_sessions` and `event_auth_attempts` have Row Level Security
enabled, no policies, and every privilege revoked from `anon` and `authenticated` —
the browser cannot reach a credential, a session or a rate-limit row at all.
`events`, `agenda_items`, `speakers` and `event_runtime` are the same: RLS on, no
policies. Controller writes go through `create_controller_event`,
`replace_controller_event` and `delete_controller_event`, which are granted to
`service_role` alone and each replace an event and its children in one transaction.
Credential changes go through `change_controller_password`,
`recover_controller_password` and `rotate_controller_recovery_code` for the same
reason.

`event_runtime.remaining_seconds` and `panel_remaining_seconds` accept negative
values within ±86400, because a countdown does not stop at zero. Overtime persists,
reloads, synchronises across devices, and reaches audience and Zoom screens as the
negative number it is.

Public audience data is exposed only through an unguessable viewer token and a
narrow security-definer function; an event also carries an optional `zoom_token`
read through a second function of the same shape. Both remain executable by `anon`,
return no team field, and need no team join.

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

## Controller API

Every controller read and write goes through a route handler, so authorization is
in one place and easy to inspect. All of them respond `Cache-Control: no-store`,
use generic public error messages, and never return a database message.

| Route | Authorization |
|---|---|
| `POST /api/event-auth/create` | none — public, rate-limited. Takes the event and its credentials only; no team field exists. Returns the event and the one-time recovery code, and sets the event session cookie |
| `POST /api/event-auth/login` | controller username + password, rate-limited. Returns only that event |
| `POST /api/event-auth/logout` | the session cookie for the named event; clears it and no other |
| `POST /api/event-auth/recover` | username + recovery code + new password, rate-limited |
| `POST /api/event-auth/change-password` | a valid session for the event, plus the current password |
| `POST /api/event-auth/rotate-recovery` | a valid session for the event, plus the current password, rate-limited |
| `GET /api/events/:eventId` | a valid session for that exact event |
| `PUT /api/events/:eventId` | a valid session for that exact event, plus the version last read |
| `DELETE /api/events/:eventId` | a valid session for that exact event |

No endpoint lists events; every read is addressed by one id and gated by that id's
session. `login` never accepts an event id as proof of anything. An unknown username and a
wrong password produce the same status and the same message. Statuses are 400 for
malformed input, 401 for bad credentials or a missing session, 403 for a session
belonging to a different event, 409 for a version conflict or a taken username,
429 when rate-limited, and 503 when the server has no Supabase configuration.

## Commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
