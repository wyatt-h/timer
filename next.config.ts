import type { NextConfig } from "next";

/*
 * Zoom loads /zoom inside its own webview, so that response carries the security
 * headers Zoom expects of an app's Home URL. The policy is scoped to /zoom
 * rather than applied globally: the rest of the application is unchanged, and a
 * mistake here cannot take the control room or an audience display down.
 *
 * Framing is deliberately not restricted — Zoom's client must be able to embed
 * this page — so no `frame-ancestors` or `X-Frame-Options` is sent.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

/** Supabase REST and Realtime share a hostname; Realtime needs the wss scheme. */
const supabaseSources = supabaseUrl
  ? [supabaseUrl, supabaseUrl.replace(/^https:/, "wss:")]
  : [];

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inlines its bootstrap; dev additionally needs eval for hot reload.
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  ["connect-src 'self'", ...supabaseSources].join(" "),
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const zoomHeaders = [
  /*
   * Only sent when the Supabase origin is known at build time. A policy written
   * without it would compile happily and then block every timer lookup at
   * runtime, which is a worse outcome than sending no policy at all.
   */
  ...(supabaseSources.length
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/zoom", headers: zoomHeaders }];
  },
};

export default nextConfig;
