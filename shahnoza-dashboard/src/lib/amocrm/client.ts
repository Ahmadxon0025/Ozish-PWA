import "server-only";
import { env } from "@/lib/env";
import { loadAmoTokens, saveAmoTokens, type AmoTokens } from "./tokens";

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export function amoRedirectUri(): string {
  return `${env.APP_URL}/api/auth/amocrm/callback`;
}

/** Exchange an authorization code for tokens (OAuth callback). */
export async function exchangeCode(params: {
  code: string;
  baseDomain: string;
}): Promise<AmoTokens> {
  const res = await fetch(`https://${params.baseDomain}/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.AMOCRM_CLIENT_ID,
      client_secret: env.AMOCRM_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: amoRedirectUri(),
    }),
  });
  if (!res.ok) {
    throw new Error(`AmoCRM token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  await saveAmoTokens({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in,
    baseDomain: params.baseDomain,
  });
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    baseDomain: params.baseDomain,
  };
}

async function refreshTokens(tokens: AmoTokens): Promise<AmoTokens> {
  const res = await fetch(`https://${tokens.baseDomain}/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.AMOCRM_CLIENT_ID,
      client_secret: env.AMOCRM_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      redirect_uri: amoRedirectUri(),
    }),
  });
  if (!res.ok) {
    throw new Error(`AmoCRM token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  await saveAmoTokens({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in,
    baseDomain: tokens.baseDomain,
  });
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    baseDomain: tokens.baseDomain,
  };
}

/** Return a valid access token, refreshing if it's near expiry. */
export async function getValidTokens(): Promise<AmoTokens | null> {
  const tokens = await loadAmoTokens();
  if (!tokens) return null;
  if (tokens.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) {
    return refreshTokens(tokens);
  }
  return tokens;
}

/** Authenticated GET against the AmoCRM v4 API. */
export async function amoGet<T = unknown>(
  path: string,
  query: Record<string, string | number> = {},
): Promise<T | null> {
  const tokens = await getValidTokens();
  if (!tokens) throw new Error("AmoCRM not connected.");

  const url = new URL(`https://${tokens.baseDomain}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    cache: "no-store",
  });
  if (res.status === 204) return null; // no content
  if (!res.ok) {
    throw new Error(`AmoCRM GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}
