import "server-only";

import { createHmac } from "node:crypto";
import { EventAuthError } from "@/lib/event-auth/errors";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/*
 * Rate limiting for every public endpoint that accepts a guess or creates data:
 * sign-in and event creation.
 *
 * The counters live in PostgreSQL rather than in a Map, because a Vercel
 * function instance is ephemeral and an in-memory limit would reset under
 * exactly the traffic it exists to slow down.
 *
 * Neither the attempted login name nor the client address is stored. Both are
 * reduced to an HMAC first, so the table cannot be read as a list of who tried
 * to open which event, and an IP address cannot be recovered from it by hashing
 * the small space of possible addresses.
 */

export type RateLimitScope = "login" | "create" | "invite";

type Budget = { windowSeconds: number; maxAttempts: number };

const BUDGETS: Record<RateLimitScope, Budget> = {
  /* Ten wrong passwords in fifteen minutes is far past a typo. */
  login: { windowSeconds: 15 * 60, maxAttempts: 10 },
  /* Creation is public; this is the brake on scripted event creation. */
  create: { windowSeconds: 60 * 60, maxAttempts: 20 },
  /* Tokens are unguessable; this limits database work rather than token guessing. */
  invite: { windowSeconds: 15 * 60, maxAttempts: 20 },
};

/**
 * The first address in `x-forwarded-for` is the client as Vercel's proxy saw it.
 * Later entries are proxies, and a request that reaches the function without the
 * header is grouped under one bucket rather than being let through unlimited.
 */
export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/*
 * Keyed so the digest cannot be reversed by hashing candidate addresses. The
 * dedicated variable is optional; without it the service-role key is used as
 * the key, which is present whenever this code path can run at all and never
 * leaves the server either way.
 */
function pepper() {
  return (
    process.env.EVENT_AUTH_HASH_PEPPER ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "unconfigured-pepper"
  );
}

/** 64 hex characters, which is what the table's CHECK constraints require. */
export function hashIdentifier(label: string, value: string) {
  return createHmac("sha256", pepper()).update(`${label}:${value}`).digest("hex");
}

export type RateLimitResult = { limited: boolean; retryAfterSeconds: number };

/**
 * Records one attempt and reports whether the caller has now exceeded either
 * budget. Recording before counting is deliberate: sustained hammering keeps the
 * limit engaged instead of freeing a slot the moment the window rolls.
 */
export async function registerAttempt(
  scope: RateLimitScope,
  identifier: string,
  request: Request,
): Promise<RateLimitResult> {
  const budget = BUDGETS[scope];
  const { data, error } = await supabaseAdmin().rpc("register_event_auth_attempt", {
    p_scope: scope,
    p_identifier_hash: hashIdentifier(`${scope}-identifier`, identifier),
    p_address_hash: hashIdentifier("address", clientAddress(request)),
    p_window_seconds: budget.windowSeconds,
    p_max_attempts: budget.maxAttempts,
  });
  if (error) throw new EventAuthError("internal");
  const result = data as RateLimitResult | null;
  return {
    limited: Boolean(result?.limited),
    retryAfterSeconds: Number(result?.retryAfterSeconds ?? budget.windowSeconds),
  };
}

/**
 * Forgets the attempts behind a successful sign-in, so an operator who mistyped
 * their password three times is not held back by their own history.
 */
export async function clearAttempts(
  scope: RateLimitScope,
  identifier: string,
  request: Request,
): Promise<void> {
  await supabaseAdmin().rpc("clear_event_auth_attempts", {
    p_scope: scope,
    p_identifier_hash: hashIdentifier(`${scope}-identifier`, identifier),
    p_address_hash: hashIdentifier("address", clientAddress(request)),
  });
}

/** Throws the 429 when a budget is spent. Kept separate so callers read plainly. */
export async function enforceRateLimit(
  scope: RateLimitScope,
  identifier: string,
  request: Request,
): Promise<void> {
  const { limited, retryAfterSeconds } = await registerAttempt(scope, identifier, request);
  if (limited) throw new EventAuthError("rate_limited", retryAfterSeconds);
}
