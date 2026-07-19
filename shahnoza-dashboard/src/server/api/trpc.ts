import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole, UserRow } from "@/types/database";

/**
 * tRPC context. Built once per request.
 *  - supabase: user-scoped client (RLS enforced) for normal reads/writes
 *  - admin:    service-role client (RLS bypassed) for system/admin ops (nullable)
 *  - appUser:  the current user's profile row (with role), or null
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let appUser: UserRow | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("auth_id", user.id)
      .maybeSingle();
    appUser = data ?? null;
  }

  return {
    headers: opts.headers,
    supabase,
    admin: createAdminClient(),
    authUser: user,
    appUser,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Requires a signed-in, active user with an assigned role. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Tizimga kiring." });
  }
  if (!ctx.appUser) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Profil topilmadi. Administrator bilan bog'laning.",
    });
  }
  if (ctx.appUser.is_active === false) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Hisobingiz faol emas.",
    });
  }
  if (!ctx.appUser.role) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Rol tayinlanmagan. Administrator kutilmoqda.",
    });
  }
  return next({
    ctx: { ...ctx, appUser: ctx.appUser, authUser: ctx.authUser },
  });
});

/** Gate a procedure to a set of roles. */
export function roleProcedure(...roles: UserRole[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.appUser.role as UserRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Bu amal uchun ruxsat yo'q.",
      });
    }
    return next({ ctx });
  });
}

export const superAdminProcedure = roleProcedure("super_admin");
export const managerProcedure = roleProcedure("super_admin", "sales_manager");
