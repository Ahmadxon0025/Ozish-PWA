import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import { toUsd } from "@/lib/business/currency";
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
      const [{ data: expenses }, { data: categories }, { data: users }] =
        await Promise.all([
          ctx.supabase
            .from("expenses")
            .select("*")
            .gte("expense_date", range.from.slice(0, 10))
            .lt("expense_date", range.to.slice(0, 10))
            .order("expense_date", { ascending: false }),
          ctx.supabase.from("expense_categories").select("id, name"),
          ctx.supabase.from("users").select("id, full_name"),
        ]);

      const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
      const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const rows = expenses ?? [];

      return {
        items: rows.map((e) => ({
          ...e,
          categoryName: e.category_id ? catName.get(e.category_id) ?? "—" : "—",
          createdByName: e.created_by ? userName.get(e.created_by) ?? "—" : "—",
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const amountUsd = toUsd(input.amount, input.currency);
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
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  delete: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("expenses").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
});
