import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. BYPASSES RLS — server-only. Use exclusively for
 * system operations that need elevated privileges: cron sync jobs, user
 * provisioning, commission/bonus generation, integration token storage.
 *
 * Returns null when the service role key isn't configured (so the app still
 * builds/renders before secrets are set).
 */
export function createAdminClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Same as createAdminClient but throws when unconfigured. */
export function requireAdminClient() {
  const client = createAdminClient();
  if (!client) {
    throw new Error(
      "Supabase service role not configured (SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return client;
}
