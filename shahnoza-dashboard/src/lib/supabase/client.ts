"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/** Browser Supabase client (RLS enforced via the user's session cookie). */
export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
  ) as unknown as SupabaseClient<Database>;
}
