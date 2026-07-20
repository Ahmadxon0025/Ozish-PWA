import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import { monthRange } from "@/lib/dates";
import { commissionForSale } from "@/lib/business/commission";
import { round2 } from "@/lib/business/currency";
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
  /** Active products for the sale form dropdown. */
  products: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("products")
      .select("id, name, price_usd, price_uzs")
      .eq("is_active", true)
      .order("price_usd", { ascending: true });
    return data ?? [];
  }),

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

  /** Overview: totals + breakdowns (product / person / source / provider),
   *  avg deal, lead→sale conversion, and month-over-month change. */
  overview: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      // Previous month = same-length window ending at this month's start.
      const prevStart = new Date(range.from);
      prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
      const prevFrom = prevStart.toISOString();

      const [
        { data: sales },
        { data: products },
        { data: users },
        { data: prevSales },
        { data: monthLeads },
      ] = await Promise.all([
        ctx.supabase
          .from("sales")
          .select(
            "total_amount_usd, product_id, sold_at, is_refunded, refund_amount_usd, sales_person_id, lead_id, payment_provider",
          )
          .gte("sold_at", range.from)
          .lt("sold_at", range.to),
        ctx.supabase.from("products").select("id, name"),
        ctx.supabase.from("users").select("id, full_name"),
        ctx.supabase
          .from("sales")
          .select("total_amount_usd")
          .gte("sold_at", prevFrom)
          .lt("sold_at", range.from),
        ctx.supabase
          .from("leads")
          .select("id, sold_at, status")
          .gte("created_at", range.from)
          .lt("created_at", range.to),
      ]);
      const rows = sales ?? [];
      const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
      const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));

      const byProduct = groupBy(rows, (s) => s.product_id);
      const productBreakdown = Array.from(byProduct.entries())
        .map(([pid, prows]) => ({
          productId: pid,
          name: productName.get(pid) ?? "—",
          count: prows.length,
          amount: sum(prows, (r) => r.total_amount_usd),
        }))
        .sort((a, b) => b.amount - a.amount);

      const byPersonMap = groupBy(rows, (s) => s.sales_person_id);
      const byPerson = Array.from(byPersonMap.entries())
        .map(([uid, prows]) => ({
          userId: uid,
          name: uid ? userName.get(uid) ?? "—" : "—",
          count: prows.length,
          amount: sum(prows, (r) => r.total_amount_usd),
        }))
        .sort((a, b) => b.amount - a.amount);

      const byProviderMap = groupBy(rows, (s) => s.payment_provider ?? "—");
      const byProvider = Array.from(byProviderMap.entries())
        .map(([provider, prows]) => ({
          provider,
          count: prows.length,
          amount: sum(prows, (r) => r.total_amount_usd),
        }))
        .sort((a, b) => b.amount - a.amount);

      // By traffic source: follow each sale's lead → utm_source / source name.
      const leadIds = Array.from(
        new Set(rows.map((r) => r.lead_id).filter(Boolean)),
      ) as string[];
      const sourceByLead = new Map<string, string>();
      if (leadIds.length) {
        const { data: leads } = await ctx.supabase
          .from("leads")
          .select("id, utm_source, traffic_source_id")
          .in("id", leadIds);
        const tsIds = Array.from(
          new Set((leads ?? []).map((l) => l.traffic_source_id).filter(Boolean)),
        ) as string[];
        const tsName = new Map<string, string>();
        if (tsIds.length) {
          const { data: ts } = await ctx.supabase
            .from("traffic_sources")
            .select("id, name")
            .in("id", tsIds);
          for (const t of ts ?? []) tsName.set(t.id, t.name);
        }
        for (const l of leads ?? []) {
          const name =
            l.utm_source ||
            (l.traffic_source_id ? tsName.get(l.traffic_source_id) : null) ||
            "Noma'lum";
          sourceByLead.set(l.id, name);
        }
      }
      const bySourceMap = new Map<string, { count: number; amount: number }>();
      for (const r of rows) {
        const src = r.lead_id
          ? sourceByLead.get(r.lead_id) ?? "Noma'lum"
          : "To'g'ridan-to'g'ri";
        const b = bySourceMap.get(src) ?? { count: 0, amount: 0 };
        b.count += 1;
        b.amount += Number(r.total_amount_usd ?? 0);
        bySourceMap.set(src, b);
      }
      const bySource = Array.from(bySourceMap.entries())
        .map(([source, v]) => ({ source, count: v.count, amount: round2(v.amount) }))
        .sort((a, b) => b.amount - a.amount);

      const totalAmount = sum(rows, (r) => r.total_amount_usd);
      const totalCount = rows.length;
      const prevAmount = sum(prevSales ?? [], (r) => r.total_amount_usd);
      const deltaPct =
        prevAmount > 0
          ? Math.round(((totalAmount - prevAmount) / prevAmount) * 100)
          : null;

      const leadsCreated = (monthLeads ?? []).length;
      const soldLeads = (monthLeads ?? []).filter(
        (l) => l.sold_at || l.status === "won",
      ).length;
      const conversionPct =
        leadsCreated > 0 ? Math.round((soldLeads / leadsCreated) * 100) : null;

      return {
        totalAmount,
        totalCount,
        refunds: sum(rows, (r) => (r.is_refunded ? r.refund_amount_usd : 0)),
        avgDeal: totalCount > 0 ? round2(totalAmount / totalCount) : 0,
        prevAmount,
        deltaPct,
        conversion: { leadsCreated, sold: soldLeads, pct: conversionPct },
        productBreakdown,
        byPerson,
        byProvider,
        bySource,
      };
    }),

  /** Channel ROI: per traffic source (Manba) — leads, ad spend, cost-per-lead,
   *  CAC and ROAS. Ad spend comes from the Reklama expense categories. so'm. */
  channelRoi: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const [{ data: leads }, { data: expenses }, { data: cats }, rate] =
        await Promise.all([
          ctx.supabase
            .from("leads")
            .select("source_name, utm_source, status, amount_uzs")
            .gte("created_at", range.from)
            .lt("created_at", range.to),
          ctx.supabase
            .from("expenses")
            .select("amount_usd, category_id")
            .gte("expense_date", range.from.slice(0, 10))
            .lt("expense_date", range.to.slice(0, 10)),
          ctx.supabase.from("expense_categories").select("id, name"),
          getCurrentRate(ctx.supabase),
        ]);

      const catName = new Map((cats ?? []).map((c) => [c.id, c.name ?? ""]));
      const adChannel = (name: string): string | null => {
        const n = name.toLowerCase();
        if (!/reklama|target|ads?\b/.test(n)) return null;
        if (n.includes("facebook") || n.includes("fb")) return "Facebook";
        if (n.includes("instagram") || n.includes("insta")) return "Instagram";
        if (n.includes("telegram")) return "Telegram";
        if (n.includes("target")) return "Target";
        return "Boshqa reklama";
      };
      const toUzs = (usd: number) => Math.round(usd * rate.rate);

      const spend = new Map<string, number>();
      for (const e of expenses ?? []) {
        const ch = adChannel(e.category_id ? catName.get(e.category_id) ?? "" : "");
        if (!ch) continue;
        spend.set(ch, (spend.get(ch) ?? 0) + toUzs(Number(e.amount_usd ?? 0)));
      }

      const chLeads = new Map<string, { leads: number; won: number; revenue: number }>();
      for (const l of leads ?? []) {
        const ch =
          (l.source_name || "").trim() || (l.utm_source || "").trim() || "Noma'lum";
        const b = chLeads.get(ch) ?? { leads: 0, won: 0, revenue: 0 };
        b.leads += 1;
        if (l.status === "won") {
          b.won += 1;
          b.revenue += Number(l.amount_uzs ?? 0);
        }
        chLeads.set(ch, b);
      }

      const channels = new Set<string>([...chLeads.keys(), ...spend.keys()]);
      const rows = Array.from(channels)
        .map((channel) => {
          const l = chLeads.get(channel) ?? { leads: 0, won: 0, revenue: 0 };
          const sp = spend.get(channel) ?? 0;
          return {
            channel,
            leads: l.leads,
            won: l.won,
            revenueUzs: l.revenue,
            spendUzs: sp,
            costPerLeadUzs: l.leads > 0 && sp > 0 ? Math.round(sp / l.leads) : null,
            cacUzs: l.won > 0 && sp > 0 ? Math.round(sp / l.won) : null,
            roas: sp > 0 ? Math.round((l.revenue / sp) * 100) / 100 : null,
          };
        })
        .sort((a, b) => b.leads - a.leads || b.spendUzs - a.spendUzs);

      const totalSpend = Array.from(spend.values()).reduce((a, b) => a + b, 0);
      const totalLeads = (leads ?? []).length;
      return {
        rows,
        totalSpendUzs: totalSpend,
        totalLeads,
        costPerLeadUzs:
          totalLeads > 0 && totalSpend > 0 ? Math.round(totalSpend / totalLeads) : null,
      };
    }),

  /** Sales-team leaderboard with commissions + monthly targets (so'm). */
  team: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const monthKey = range.from.slice(0, 10); // first-of-month DATE
      const [{ data: sales }, { data: users }, { data: targets }] = await Promise.all([
        ctx.supabase
          .from("sales")
          .select(
            "total_amount_usd, total_amount_uzs, sales_person_id, is_refunded, refund_amount_usd",
          )
          .gte("sold_at", range.from)
          .lt("sold_at", range.to),
        ctx.supabase
          .from("users")
          .select("id, full_name, avatar_url, role")
          .in("role", ["sales", "sales_manager"]),
        ctx.supabase
          .from("sales_targets")
          .select("user_id, target_uzs, target_deals")
          .eq("month", monthKey),
      ]);

      const byPerson = groupBy(sales ?? [], (s) => s.sales_person_id);
      const targetByUser = new Map(
        (targets ?? []).map((t) => [t.user_id, t]),
      );
      return (users ?? [])
        .map((u) => {
          const rows = byPerson.get(u.id) ?? [];
          const revenue = sum(rows, (r) => r.total_amount_usd);
          const revenueUzs = sum(rows, (r) => r.total_amount_uzs);
          const commission = sum(rows, (r) =>
            commissionForSale({
              totalAmountUsd: r.total_amount_usd,
              isRefunded: r.is_refunded,
              refundAmountUsd: r.refund_amount_usd,
            }),
          );
          const t = targetByUser.get(u.id);
          return {
            userId: u.id,
            name: u.full_name,
            avatarUrl: u.avatar_url,
            role: u.role,
            count: rows.length,
            revenue,
            revenueUzs,
            commission,
            targetUzs: Number(t?.target_uzs ?? 0),
            targetDeals: Number(t?.target_deals ?? 0),
          };
        })
        .sort((a, b) => b.revenueUzs - a.revenueUzs);
    }),

  /** Set a rep's monthly target (so'm + deals). Managers only. */
  setTarget: managerProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        month: z.string(), // YYYY-MM or YYYY-MM-DD
        targetUzs: z.number().nonnegative(),
        targetDeals: z.number().int().nonnegative().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const monthKey = `${input.month.slice(0, 7)}-01`;
      const { error } = await ctx.supabase.from("sales_targets").upsert(
        {
          user_id: input.userId,
          month: monthKey,
          target_uzs: input.targetUzs,
          target_deals: input.targetDeals,
        },
        { onConflict: "user_id,month" },
      );
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
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
