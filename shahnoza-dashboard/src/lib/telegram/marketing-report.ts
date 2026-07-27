import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { monthRange, todayKey, currentMonthKey } from "@/lib/dates";
import { formatUzs } from "@/lib/format";

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "—";
}

export async function buildMarketingReport(): Promise<string> {
  const db = requireAdminClient();
  const month = monthRange();
  const monthKey = currentMonthKey();

  const [{ data: leads }, { data: sales }, { data: target }] =
    await Promise.all([
      db
        .from("leads")
        .select("id, source_name, utm_source, status, created_at")
        .gte("created_at", month.from)
        .lt("created_at", month.to),
      db
        .from("sales")
        .select("lead_id, total_amount_uzs, total_amount_usd")
        .gte("sold_at", month.from)
        .lt("sold_at", month.to),
      db
        .from("company_targets")
        .select("target_value")
        .eq("scope", "leads")
        .eq("metric", "count")
        .eq("month", monthKey)
        .maybeSingle(),
    ]);

  const allLeads = leads ?? [];
  const allSales = sales ?? [];
  const totalLeads = allLeads.length;
  const wonLeads = allLeads.filter((l) => l.status === "won").length;
  const lostLeads = allLeads.filter((l) => l.status === "lost").length;
  const activeLeads = allLeads.filter(
    (l) => l.status !== "won" && l.status !== "lost",
  ).length;

  const leadTarget = target?.target_value
    ? Number(target.target_value)
    : null;
  const targetLine = leadTarget
    ? `Oylik maqsad: ${totalLeads}/${leadTarget} (${pct(totalLeads, leadTarget)})`
    : "";

  // Group by source (source_name or utm_source fallback).
  type SourceStat = { leads: number; won: number; lost: number };
  const bySource = new Map<string, SourceStat>();
  for (const l of allLeads) {
    const src = l.source_name || l.utm_source || "Noma'lum";
    const s = bySource.get(src) ?? { leads: 0, won: 0, lost: 0 };
    s.leads++;
    if (l.status === "won") s.won++;
    if (l.status === "lost") s.lost++;
    bySource.set(src, s);
  }

  const sources = Array.from(bySource.entries())
    .sort((a, b) => b[1].leads - a[1].leads)
    .slice(0, 8);

  const sourceLines = sources
    .map(([name, s]) => {
      const conv = s.leads ? `${Math.round((s.won / s.leads) * 100)}%` : "—";
      return `• ${name}: ${s.leads} lead → ${s.won} sotuv (${conv})`;
    })
    .join("\n");

  // UTM breakdown (campaigns).
  const byCampaign = new Map<string, number>();
  for (const l of allLeads) {
    if (!l.utm_source) continue;
    const key = l.utm_source;
    byCampaign.set(key, (byCampaign.get(key) ?? 0) + 1);
  }
  const campaigns = Array.from(byCampaign.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const campaignLines =
    campaigns.length > 0
      ? campaigns.map(([name, count]) => `• ${name}: ${count} ta`).join("\n")
      : "— UTM ma'lumot yo'q";

  // Revenue by source.
  const saleLeadIds = new Set(allSales.map((s) => s.lead_id).filter(Boolean));
  const revBySource = new Map<string, number>();
  for (const l of allLeads) {
    if (!saleLeadIds.has(l.id)) continue;
    const src = l.source_name || l.utm_source || "Noma'lum";
    const sale = allSales.find((s) => s.lead_id === l.id);
    if (!sale) continue;
    const amt = Number(sale.total_amount_uzs ?? 0);
    revBySource.set(src, (revBySource.get(src) ?? 0) + amt);
  }
  const topRevSources = Array.from(revBySource.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const revLines =
    topRevSources.length > 0
      ? topRevSources
          .map(([name, amt]) => `• ${name}: ${formatUzs(amt)}`)
          .join("\n")
      : "— Sotuv yo'q";

  const parts = [
    `📣 *MARKETING HISOBOT* — ${todayKey()}`,
    ``,
    `🎯 *LEAD FUNNEL (bu oy)*`,
    `Jami: ${totalLeads} ta yangi lead`,
    `✅ Sotuv: ${wonLeads} (${pct(wonLeads, totalLeads)})`,
    `❌ Yo'qotilgan: ${lostLeads} (${pct(lostLeads, totalLeads)})`,
    `🔄 Faol: ${activeLeads}`,
    ...(targetLine ? [targetLine] : []),
    ``,
    `📊 *MANBALAR BO'YICHA*`,
    sourceLines || "— Ma'lumot yo'q",
    ``,
    `🔗 *UTM KANALLAR*`,
    campaignLines,
    ``,
    `💰 *DAROMAD MANBA BO'YICHA*`,
    revLines,
  ];

  return parts.join("\n");
}
