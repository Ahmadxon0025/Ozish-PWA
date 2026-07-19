import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import { toUsd } from "@/lib/business/currency";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import {
  insertAccountEntry,
  resolveDefaultAccountId,
  deleteRelatedEntries,
} from "@/lib/business/account-posting";
import { sum, groupBy, resolveMonth } from "./_helpers";

export const expensesRouter = createTRPCRouter({
  categories: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("expense_categories")
      .select("*")
      .order("display_order", { ascending: true });
    return data ?? [];
  }),

  list: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const [{ data: expenses }, { data: categories }, { data: users }, { data: accounts }] =
        await Promise.all([
          ctx.supabase
            .from("expenses")
            .select("*")
            .gte("expense_date", range.from.slice(0, 10))
            .lt("expense_date", range.to.slice(0, 10))
            .order("expense_date", { ascending: false }),
          ctx.supabase.from("expense_categories").select("id, name"),
          ctx.supabase.from("users").select("id, full_name"),
          ctx.supabase.from("accounts").select("id, name"),
        ]);

      const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
      const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const acctName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
      const rows = expenses ?? [];

      return {
        items: rows.map((e) => ({
          ...e,
          categoryName: e.category_id ? catName.get(e.category_id) ?? "—" : "—",
          createdByName: e.created_by ? userName.get(e.created_by) ?? "—" : "—",
          accountName: e.account_id ? acctName.get(e.account_id) ?? "—" : "—",
        })),
        totalUsd: sum(rows, (e) => e.amount_usd),
      };
    }),

  /** Totals grouped by category for a month (for the P&L breakdown). */
  byCategory: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const [{ data: expenses }, { data: categories }] = await Promise.all([
        ctx.supabase
          .from("expenses")
          .select("amount_usd, category_id")
          .gte("expense_date", range.from.slice(0, 10))
          .lt("expense_date", range.to.slice(0, 10)),
        ctx.supabase
          .from("expense_categories")
          .select("id, name, display_order")
          .order("display_order", { ascending: true }),
      ]);
      const byCat = groupBy(expenses ?? [], (e) => e.category_id);
      return (categories ?? []).map((c) => ({
        categoryId: c.id,
        name: c.name,
        amount: sum(byCat.get(c.id) ?? [], (e) => e.amount_usd),
      }));
    }),

  create: managerProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        amount: z.number().nonnegative(),
        currency: z.enum(["USD", "UZS"]).default("USD"),
        description: z.string().optional(),
        expenseDate: z.string(), // YYYY-MM-DD
        paidTo: z.string().optional(),
        receiptUrl: z.string().url().optional(),
        accountId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rate = await getCurrentRate(ctx.supabase);
      const amountUsd = toUsd(input.amount, input.currency, rate.rate);
      // Pick the account the money leaves from (default: first of that currency).
      const accountId =
        input.accountId === null
          ? null
          : (input.accountId ??
            (await resolveDefaultAccountId(ctx.supabase, input.currency)));

      const { error, data } = await ctx.supabase
        .from("expenses")
        .insert({
          category_id: input.categoryId,
          amount: input.amount,
          currency: input.currency,
          amount_usd: amountUsd,
          description: input.description ?? null,
          expense_date: input.expenseDate,
          paid_to: input.paidTo ?? null,
          receipt_url: input.receiptUrl ?? null,
          created_by: ctx.appUser.id,
          account_id: accountId,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      // Deduct from the account (money out).
      if (accountId) {
        await insertAccountEntry(ctx.supabase, {
          accountId,
          direction: "out",
          kind: "expense",
          amountUsd,
          amountUzs: input.currency === "UZS" ? input.amount : null,
          rate: rate.rate,
          description: input.description ?? "Xarajat",
          relatedType: "expense",
          relatedId: data.id,
          createdBy: ctx.appUser.id,
          occurredAt: `${input.expenseDate}T12:00:00Z`,
        });
      }
      return data;
    }),

  delete: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Remove the linked account movement first, then the expense.
      await deleteRelatedEntries(ctx.supabase, "expense", input.id);
      const { error } = await ctx.supabase.from("expenses").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
});
