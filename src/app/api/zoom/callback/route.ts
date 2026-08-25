const ZOOM_TOKEN_ENDPOINT = "https://zoom.us/oauth/token";

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return null;

  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`);
  } catch {
    return null;
  }
}

function installationResult(result: "complete" | "denied" | "failed") {
  const target = appUrl(`/zoom?installation=${result}`);
  return target
    ? Response.redirect(target, 303)
    : new Response("Zoom installation could not be completed.", { status: 503 });
}

/*
 * Zoom sends the installer here after consent. The timer uses only the in-client
 * Zoom Apps SDK and never calls Zoom's REST API, so the returned access and
 * refresh tokens are deliberately not stored. Exchanging the one-time code still
 * completes the confidential OAuth flow and proves that the production client
 * credentials and redirect URI match the Marketplace configuration.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (requestUrl.searchParams.has("error")) {
    return installationResult("denied");
  }

  const code = requestUrl.searchParams.get("code");
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const redirectUri = process.env.ZOOM_REDIRECT_URI;

  if (!code) {
    return new Response("Zoom did not provide an authorization code.", { status: 400 });
  }
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("Zoom OAuth environment variables are not configured.");
    return new Response("Zoom installation is not configured.", { status: 503 });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  try {
    const response = await fetch(ZOOM_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`Zoom OAuth token exchange failed with status ${response.status}.`);
      return installationResult("failed");
    }

    return installationResult("complete");
  } catch (error) {
    console.error("Zoom OAuth token exchange failed.", error);
    return installationResult("failed");
  }
}
