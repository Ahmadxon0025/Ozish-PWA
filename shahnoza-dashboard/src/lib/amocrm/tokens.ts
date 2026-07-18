import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";

const SERVICE = "amocrm";

export interface AmoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  baseDomain: string; // e.g. shahnoza.amocrm.ru
}

/** Persist AmoCRM tokens (encrypted at rest) in integration_tokens. */
export async function saveAmoTokens(params: {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  baseDomain: string;
}): Promise<void> {
  const db = requireAdminClient();
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000);

  await db.from("integration_tokens").upsert(
    {
      service: SERVICE,
      access_token: encryptToken(params.accessToken),
      refresh_token: encryptToken(params.refreshToken),
      expires_at: expiresAt.toISOString(),
      metadata: { base_domain: params.baseDomain },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "service" },
  );
}

export async function loadAmoTokens(): Promise<AmoTokens | null> {
  const db = requireAdminClient();
  const { data } = await db
    .from("integration_tokens")
    .select("*")
    .eq("service", SERVICE)
    .maybeSingle();
  if (!data || !data.access_token || !data.refresh_token) return null;

  const meta = (data.metadata ?? {}) as { base_domain?: string };
  return {
    accessToken: decryptToken(data.access_token),
    refreshToken: decryptToken(data.refresh_token),
    expiresAt: data.expires_at ? new Date(data.expires_at) : new Date(0),
    baseDomain: meta.base_domain ?? `${env.AMOCRM_SUBDOMAIN}.amocrm.ru`,
  };
}
