import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  roleProcedure,
  managerProcedure,
  superAdminProcedure,
} from "@/server/api/trpc";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { round2 } from "@/lib/business/currency";
import { groupBy, sum } from "./_helpers";

// Finance roles can read; managers (+super admin) can move money.
const financeProcedure = roleProcedure("super_admin", "owner", "sales_manager");

function toUsdAt(amount: number, currency: string, uzsPerUsd: number): number {
  if (currency === "USD") return round2(amount);
  return round2(uzsPerUsd > 0 ? amount / uzsPerUsd : 0);
}

export const accountsRouter = createTRPCRouter({
  /** Current CBU rate (UZS per 1 USD) + freshness. */
  currentRate: financeProcedure.query(async ({ ctx }) => {
    return getCurrentRate(ctx.supabase);
  }),

  /** All accounts with live balances (native currency + USD equivalent). */
  list: financeProcedure.query(async ({ ctx }) => {
    const [{ data: accounts }, { data: txns }, rate] = await Promise.all([
      ctx.supabase
        .from("accounts")
        .select("*")
        .order("sort_order", { ascending: true }),
      ctx.supabase
        .from("account_transactions")
        .select("account_id, direction, amount"),
      getCurrentRate(ctx.supabase),
    ]);

    const byAccount = groupBy(txns ?? [], (t) => t.account_id);
    const items = (accounts ?? []).map((a) => {
      const rows = byAccount.get(a.id) ?? [];
      const inflow = sum(
        rows.filter((r) => r.direction === "in"),
        (r) => r.amount,
      );
      const outflow = sum(
        rows.filter((r) => r.direction === "out"),
        (r) => r.amount,
      );
      const balance = round2(inflow - outflow);
      return {
        ...a,
        balance, // in the account's own currency
        balanceUsd: toUsdAt(balance, a.currency, rate.rate),
      };
    });

    const totalUsd = round2(sum(items, (i) => i.balanceUsd));
    return { items, totalUsd, rate };
  }),

  /** Ledger, optionally filtered to one account. */
  transactions: financeProcedure
    .input(
      z
        .object({
          accountId: z.string().uuid().optional(),
          limit: z.number().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("account_transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(input?.limit ?? 50);
      if (input?.accountId) q = q.eq("account_id", input.accountId);
      const { data: txns } = await q;

      const { data: accounts } = await ctx.supabase
        .from("accounts")
        .select("id, name, currency");
      const accName = new Map((accounts ?? []).map((a) => [a.id, a.name]));

      return (txns ?? []).map((t) => ({
        ...t,
        accountName: t.account_id ? accName.get(t.account_id) ?? "—" : "—",
      }));
    }),

  /** Deposit money into an account (e.g. incoming from abroad to the Visa card). */
  deposit: managerProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        amount: z.number().positive(),
        description: z.string().optional(),
        kind: z.enum(["deposit", "manual", "adjustment", "sale"]).default("deposit"),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccount(ctx.supabase, input.accountId);
      const rate = await getCurrentRate(ctx.supabase);
      const { error } = await ctx.supabase.from("account_transactions").insert({
        account_id: account.id,
        direction: "in",
        kind: input.kind,
        amount: input.amount,
        currency: account.currency,
        amount_usd: toUsdAt(input.amount, account.currency, rate.rate),
        rate: rate.rate,
        description: input.description ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        created_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Withdraw money from an account. */
  withdraw: managerProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        amount: z.number().positive(),
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccount(ctx.supabase, input.accountId);
      const rate = await getCurrentRate(ctx.supabase);
      const { error } = await ctx.supabase.from("account_transactions").insert({
        account_id: account.id,
        direction: "out",
        kind: "withdraw",
        amount: input.amount,
        currency: account.currency,
        amount_usd: toUsdAt(input.amount, account.currency, rate.rate),
        rate: rate.rate,
        description: input.description ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        created_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /**
   * Move money between accounts. If the accounts differ in currency the amount
   * is converted at the CBU rate (or an override), and both legs are recorded.
   * `amount` is expressed in the SOURCE account's currency.
   */
  transfer: managerProcedure
    .input(
      z.object({
        fromAccountId: z.string().uuid(),
        toAccountId: z.string().uuid(),
        amount: z.number().positive(),
        rate: z.number().positive().optional(), // override UZS-per-USD
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromAccountId === input.toAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bir xil hisob tanlandi." });
      }
      const [from, to] = await Promise.all([
        getAccount(ctx.supabase, input.fromAccountId),
        getAccount(ctx.supabase, input.toAccountId),
      ]);
      const current = await getCurrentRate(ctx.supabase);
      const rate = input.rate ?? current.rate;

      // Convert the source amount into the destination currency.
      let toAmount = input.amount;
      if (from.currency !== to.currency) {
        if (from.currency === "UZS" && to.currency === "USD") {
          toAmount = round2(input.amount / rate);
        } else if (from.currency === "USD" && to.currency === "UZS") {
          toAmount = round2(input.amount * rate);
        }
      }

      const outUsd = toUsdAt(input.amount, from.currency, rate);
      const inUsd = toUsdAt(toAmount, to.currency, rate);
      const group = randomUUID();
      const occurred = input.occurredAt ?? new Date().toISOString();
      const kind = from.currency === to.currency ? "transfer" : "conversion";

      const { error } = await ctx.supabase.from("account_transactions").insert([
        {
          account_id: from.id,
          direction: "out",
          kind,
          amount: input.amount,
          currency: from.currency,
          amount_usd: outUsd,
          rate,
          description: input.description ?? `→ ${to.name}`,
          transfer_group: group,
          occurred_at: occurred,
          created_by: ctx.appUser.id,
        },
        {
          account_id: to.id,
          direction: "in",
          kind,
          amount: toAmount,
          currency: to.currency,
          amount_usd: inUsd,
          rate,
          description: input.description ?? `← ${from.name}`,
          transfer_group: group,
          occurred_at: occurred,
          created_by: ctx.appUser.id,
        },
      ]);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true, toAmount, rate };
    }),

  createAccount: managerProcedure
    .input(
      z.object({
        name: z.string().min(1),
        kind: z.enum(["bank", "card", "cash", "visa", "other"]).default("bank"),
        currency: z.enum(["UZS", "USD"]).default("UZS"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error, data } = await ctx.supabase
        .from("accounts")
        .insert({ name: input.name, kind: input.kind, currency: input.currency })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  updateAccount: managerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      const { error } = await ctx.supabase
        .from("accounts")
        .update(patch as never)
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Manually refresh the CBU rate now (super admin). */
  refreshRate: superAdminProcedure.mutation(async ({ ctx }) => {
    const { refreshFxRate } = await import("@/lib/business/exchange-rate");
    return refreshFxRate(ctx.supabase);
  }),
});

async function getAccount(
  db: Parameters<typeof getCurrentRate>[0],
  id: string,
) {
  const { data } = await db
    .from("accounts")
    .select("id, name, currency")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Hisob topilmadi." });
  return data;
}
