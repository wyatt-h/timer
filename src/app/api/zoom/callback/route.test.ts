// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://timer-beryl-psi.vercel.app";
  process.env.ZOOM_CLIENT_ID = "client-id";
  process.env.ZOOM_CLIENT_SECRET = "client-secret";
  process.env.ZOOM_REDIRECT_URI =
    "https://timer-beryl-psi.vercel.app/api/zoom/callback";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("Zoom OAuth callback", () => {
  it("exchanges the authorization code and redirects to the Zoom app", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "unused", refresh_token: "unused" }), {
        status: 200,
      }),
    );

    const response = await GET(
      new Request("https://timer-beryl-psi.vercel.app/api/zoom/callback?code=one-time-code"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://timer-beryl-psi.vercel.app/zoom?installation=complete",
    );
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://zoom.us/oauth/token");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init?.body?.toString()).toContain("grant_type=authorization_code");
    expect(init?.body?.toString()).toContain("code=one-time-code");
    expect(init?.body?.toString()).toContain(
      "redirect_uri=https%3A%2F%2Ftimer-beryl-psi.vercel.app%2Fapi%2Fzoom%2Fcallback",
    );
  });

  it("does not contact Zoom when the user denies authorization", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await GET(
      new Request("https://timer-beryl-psi.vercel.app/api/zoom/callback?error=access_denied"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("installation=denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a callback without a code", async () => {
    const response = await GET(
      new Request("https://timer-beryl-psi.vercel.app/api/zoom/callback"),
    );
    expect(response.status).toBe(400);
  });
});
