import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Server Supabase client bound to the request cookies. RLS is enforced with the
 * signed-in user's session, so use this for all normal per-user reads/writes.
 *
 * The result is cast to supabase-js's `SupabaseClient<Database>` because
 * @supabase/ssr's own return type mis-infers `.from()` rows as `never` against
 * supabase-js 2.110's type internals. The runtime object is a real supabase-js
 * client, so the cast is sound.
 */
export function createServerSupabase(): SupabaseClient<Database> {
  const cookieStore = cookies();

  return createServerClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // Session refresh is handled by the middleware instead.
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
