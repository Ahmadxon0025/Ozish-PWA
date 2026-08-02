import { z } from "zod";
import { createTRPCRouter, roleProcedure } from "@/server/api/trpc";

// Funnel + cost data is manager/owner territory (ROAS touches spend).
const managerProcedure = roleProcedure("super_admin", "owner", "sales_manager");

/** Add a value to a Map<K, Set<V>> bucket. */
function addToSet<K, V>(map: Map<K, Set<V>>, key: K, val: V) {
  const s = map.get(key);
  if (s) s.add(val);
  else map.set(key, new Set([val]));
}

export const marketingRouter = createTRPCRouter({
  /**
   * Per-funnel report over a rolling window: distinct persons per stage
   * (the funnel chart), buyers, revenue, ad spend, and the funnel's headline
   * metric (cost/buyer, ROAS, or cost/enrolled). All counts dedupe by person,
   * so the same human can't inflate a stage.
   */
  funnelReport: managerProcedure
    .input(z.object({ days: z.number().int().positive().max(3650).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const now = new Date();
      const fromISO = new Date(now.getTime() - days * 86_400_000).toISOString();
      const toISO = now.toISOString();

      const [{ data: funnels }, { data: stages }, { data: events }, { data: spend }] =
        await Promise.all([
          ctx.supabase
            .from("funnels")
            .select("*")
            .eq("is_active", true)
            .order("position", { ascending: true }),
          ctx.supabase
            .from("funnel_stages")
            .select("*")
            .order("position", { ascending: true }),
          ctx.supabase
            .from("funnel_events")
            .select("person_id, funnel_id, stage_key, event_type, amount_uzs, occurred_at")
            .gte("occurred_at", fromISO)
            .lte("occurred_at", toISO),
          ctx.supabase
            .from("ad_spend_daily")
            .select("funnel_id, spend_uzs, spend_usd, date")
            .gte("date", fromISO.slice(0, 10))
            .lte("date", toISO.slice(0, 10)),
        ]);

      const funnelList = funnels ?? [];
      type StageRow = NonNullable<typeof stages>[number];
      const stagesByFunnel = new Map<string, StageRow[]>();
      for (const s of stages ?? []) {
        const arr = stagesByFunnel.get(s.funnel_id) ?? [];
        arr.push(s);
        stagesByFunnel.set(s.funnel_id, arr);
      }

      // Distinct persons per (funnel, stage); buyers + revenue per funnel.
      const stageSets = new Map<string, Set<string>>(); // `${funnelId}:${stageKey}` → persons
      const buyerSet = new Map<string, Set<string>>(); // funnelId → persons with a sale
      const revenue = new Map<string, number>();
      for (const e of events ?? []) {
        if (!e.funnel_id || !e.person_id) continue;
        addToSet(stageSets, `${e.funnel_id}:${e.stage_key}`, e.person_id);
        if (e.event_type === "sale") {
          addToSet(buyerSet, e.funnel_id, e.person_id);
          revenue.set(e.funnel_id, (revenue.get(e.funnel_id) ?? 0) + Number(e.amount_uzs ?? 0));
        }
      }

      const spendUzs = new Map<string, number>();
      const spendUsd = new Map<string, number>();
      for (const s of spend ?? []) {
        if (!s.funnel_id) continue;
        spendUzs.set(s.funnel_id, (spendUzs.get(s.funnel_id) ?? 0) + Number(s.spend_uzs ?? 0));
        spendUsd.set(s.funnel_id, (spendUsd.get(s.funnel_id) ?? 0) + Number(s.spend_usd ?? 0));
      }

      const out = funnelList.map((f) => {
        const st = (stagesByFunnel.get(f.id) ?? []).map((s) => ({
          key: s.key,
          name: s.name,
          count: stageSets.get(`${f.id}:${s.key}`)?.size ?? 0,
        }));
        const buyers = buyerSet.get(f.id)?.size ?? 0;
        const revenueUzs = revenue.get(f.id) ?? 0;
        const sUzs = spendUzs.get(f.id) ?? 0;
        const sUsd = spendUsd.get(f.id) ?? 0;
        return {
          key: f.key,
          name: f.name,
          temperature: f.temperature,
          goalMetric: f.goal_metric,
          description: f.description,
          stages: st,
          buyers,
          revenueUzs,
          spendUzs: sUzs,
          spendUsd: sUsd,
          // cost per buyer / enrolled — same formula; the funnel's goal picks which label to show.
          costPerBuyerUzs: buyers > 0 && sUzs > 0 ? Math.round(sUzs / buyers) : null,
          roas: sUzs > 0 && revenueUzs > 0 ? Math.round((revenueUzs / sUzs) * 100) / 100 : null,
        };
      });

      return {
        period: { from: fromISO.slice(0, 10), to: toISO.slice(0, 10), days },
        funnels: out,
        totalEvents: (events ?? []).length,
      };
    }),
});
