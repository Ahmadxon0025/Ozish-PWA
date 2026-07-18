import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { UserRow } from "@/types/database";

export interface SessionContext {
  authId: string;
  email: string;
  appUser: UserRow | null;
}

/**
 * Resolve the current auth user + their app profile row (with role).
 * Cached per-request so multiple callers don't re-hit Supabase.
 * Returns null when not signed in.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: appUser } = await supabase
      .from("users")
      .select("*")
      .eq("auth_id", user.id)
      .maybeSingle();

    return {
      authId: user.id,
      email: user.email ?? "",
      appUser: appUser ?? null,
    };
  },
);
