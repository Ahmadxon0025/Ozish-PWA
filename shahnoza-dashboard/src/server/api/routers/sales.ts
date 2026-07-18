import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import { monthRange } from "@/lib/dates";
import { commissionForSale } from "@/lib/business/commission";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { insertAccountEntry } from "@/lib/business/account-posting";
import { PAYMENT_PROVIDERS } from "@/lib/constants";
import { sum, groupBy, resolveMonth } from "./_helpers";

const listInput = z.object({
  search: z.string().optional(),
  salesPersonId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  onlyRefunded: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(25),
  sortBy: z.enum(["sold_at", "total_amount_usd"]).default("sold_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const salesRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    let query = ctx.supabase
      .from("sales")
      .select("*", { count: "exact" })
      .order(input.sortBy, { ascending: input.sortDir === "asc" });

    if (input.salesPersonId) query = query.eq("sales_person_id", input.salesPersonId);
    if (input.productId) query = query.eq("product_id", input.productId);
    if (input.onlyRefunded) query = query.eq("is_refunded", true);
    if (input.from) query = query.gte("sold_at", input.from);
    if (input.to) query = query.lt("sold_at", input.to);

    const fromIdx = (input.page - 1) * input.pageSize;
    query = query.range(fromIdx, fromIdx + input.pageSize - 1);

    const { data: sales, count, error } = await query;
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    const rows = sales ?? [];
    const [{ data: products }, { data: users }] = await Promise.all([
      ctx.supabase.from("products").select("id, name"),
      ctx.supabase.from("users").select("id, full_name"),
    ]);
    const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
    const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));

    const items = rows
      .map((s) => ({
        ...s,
        productName: s.product_id ? productName.get(s.product_id) ?? "—" : "—",
        salesPersonName: s.sales_person_id
          ? userName.get(s.sales_person_id) ?? "—"
          : "—",
      }))
      .filter((s) =>
        input.search
          ? [s.productName, s.salesPersonName, s.notes ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(input.search.toLowerCase())
          : true,
      );

    return {
      items,
      total: count ?? items.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  /** Overview: totals by product and by traffic source for a month. */
  overview: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const [{ data: sales }, { data: products }] = await Promise.all([
        ctx.supabase
          .from("sales")
          .select("total_amount_usd, product_id, sold_at, is_refunded, refund_amount_usd")
          .gte("sold_at", range.from)
          .lt("sold_at", range.to),
        ctx.supabase.from("products").select("id, name"),
      ]);
      const rows = sales ?? [];
      const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
      const byProduct = groupBy(rows, (s) => s.product_id);
      const productBreakdown = Array.from(byProduct.entries()).map(
        ([pid, prows]) => ({
          productId: pid,
          name: productName.get(pid) ?? "—",
          count: prows.length,
          amount: sum(prows, (r) => r.total_amount_usd),
        }),
      );

      return {
        totalAmount: sum(rows, (r) => r.total_amount_usd),
        totalCount: rows.length,
        refunds: sum(rows, (r) => (r.is_refunded ? r.refund_amount_usd : 0)),
        productBreakdown,
      };
    }),

  /** Sales-team leaderboard with commissions for a month. */
  team: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const [{ data: sales }, { data: users }] = await Promise.all([
        ctx.supabase
          .from("sales")
          .select("total_amount_usd, sales_person_id, is_refunded, refund_amount_usd")
          .gte("sold_at", range.from)
          .lt("sold_at", range.to),
        ctx.supabase
          .from("users")
          .select("id, full_name, avatar_url, role")
          .in("role", ["sales", "sales_manager"]),
      ]);

      const byPerson = groupBy(sales ?? [], (s) => s.sales_person_id);
      return (users ?? [])
        .map((u) => {
          const rows = byPerson.get(u.id) ?? [];
          const revenue = sum(rows, (r) => r.total_amount_usd);
          const commission = sum(rows, (r) =>
            commissionForSale({
              totalAmountUsd: r.total_amount_usd,
              isRefunded: r.is_refunded,
              refundAmountUsd: r.refund_amount_usd,
            }),
          );
          return {
            userId: u.id,
            name: u.full_name,
            avatarUrl: u.avatar_url,
            role: u.role,
            count: rows.length,
            revenue,
            commission,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);
    }),

  /** Individual sales-person detail. */
  byPerson: protectedProcedure
    .input(z.object({ userId: z.string().uuid(), month: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input.month);
      const [{ data: user }, { data: sales }] = await Promise.all([
        ctx.supabase
          .from("users")
          .select("id, full_name, email, phone, avatar_url, role")
          .eq("id", input.userId)
          .maybeSingle(),
        ctx.supabase
          .from("sales")
          .select("*")
          .eq("sales_person_id", input.userId)
          .gte("sold_at", range.from)
          .lt("sold_at", range.to)
          .order("sold_at", { ascending: false }),
      ]);

      const rows = sales ?? [];
      const revenue = sum(rows, (r) => r.total_amount_usd);
      const commission = sum(rows, (r) =>
        commissionForSale({
          totalAmountUsd: r.total_amount_usd,
          isRefunded: r.is_refunded,
          refundAmountUsd: r.refund_amount_usd,
        }),
      );
      return { user: user ?? null, sales: rows, revenue, commission, count: rows.length };
    }),

  /** Manually record a sale (managers/super admin). */
  create: managerProcedure
    .input(
      z.object({
        leadId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        salesPersonId: z.string().uuid().optional(),
        totalAmountUsd: z.number().nonnegative(),
        totalAmountUzs: z.number().nonnegative().optional(),
        paymentProvider: z.enum(PAYMENT_PROVIDERS).optional(),
        paymentType: z.string().optional(),
        soldAt: z.string(),
        notes: z.string().optional(),
        accountId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error, data } = await ctx.supabase
        .from("sales")
        .insert({
          lead_id: input.leadId ?? null,
          product_id: input.productId ?? null,
          sales_person_id: input.salesPersonId ?? null,
          total_amount_usd: input.totalAmountUsd,
          total_amount_uzs: input.totalAmountUzs ?? null,
          payment_provider: input.paymentProvider ?? null,
          payment_type: input.paymentType ?? null,
          sold_at: input.soldAt,
          notes: input.notes ?? null,
          account_id: input.accountId ?? null,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      // Credit the account the payment landed in (money in).
      if (input.accountId) {
        const rate = await getCurrentRate(ctx.supabase);
        await insertAccountEntry(ctx.supabase, {
          accountId: input.accountId,
          direction: "in",
          kind: "sale",
          amountUsd: input.totalAmountUsd,
          amountUzs: input.totalAmountUzs ?? null,
          rate: rate.rate,
          description: "Sotuv",
          relatedType: "sale",
          relatedId: data.id,
          createdBy: ctx.appUser.id,
          occurredAt: input.soldAt,
        });
      }
      return data;
    }),

  /** Mark a sale refunded. */
  refund: managerProcedure
    .input(
      z.object({
        saleId: z.string().uuid(),
        refundAmountUsd: z.number().nonnegative(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: sale, error } = await ctx.supabase
        .from("sales")
        .update({
          is_refunded: true,
          refund_amount_usd: input.refundAmountUsd,
          refund_reason: input.reason ?? null,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", input.saleId)
        .select("account_id")
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      // Money leaves the account it was credited to.
      if (sale?.account_id && input.refundAmountUsd > 0) {
        const rate = await getCurrentRate(ctx.supabase);
        await insertAccountEntry(ctx.supabase, {
          accountId: sale.account_id,
          direction: "out",
          kind: "sale",
          amountUsd: input.refundAmountUsd,
          rate: rate.rate,
          description: "Qaytarish (refund)",
          relatedType: "sale_refund",
          relatedId: input.saleId,
          createdBy: ctx.appUser.id,
        });
      }
      return { ok: true };
    }),
});
