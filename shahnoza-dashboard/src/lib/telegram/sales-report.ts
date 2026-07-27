import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { monthRange, todayKey, todayRange, yesterdayRange } from "@/lib/dates";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { formatUzs } from "@/lib/format";

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : "—";
}

type PersonSales = {
  name: string;
  monthCount: number;
  monthUzs: number;
  todayCount: number;
  todayUzs: number;
  leadsAssigned: number;
  leadsWon: number;
  leadsLost: number;
};

export async function buildSalesTeamReport(): Promise<string> {
  const db = requireAdminClient();
  const month = monthRange();
  const today = todayRange();
  const yesterday = yesterdayRange();

  const [
    { data: salesMonth },
    { data: salesToday },
    { data: salesYday },
    { data: leads },
    { data: users },
    rateRow,
  ] = await Promise.all([
    db
      .from("sales")
      .select("sales_person_id, total_amount_uzs, total_amount_usd")
      .gte("sold_at", month.from)
      .lt("sold_at", month.to),
    db
      .from("sales")
      .select("sales_person_id, total_amount_uzs, total_amount_usd")
      .gte("sold_at", today.from)
      .lt("sold_at", today.to),
    db
      .from("sales")
      .select("sales_person_id, total_amount_uzs, total_amount_usd")
      .gte("sold_at", yesterday.from)
      .lt("sold_at", yesterday.to),
    db
      .from("leads")
      .select("assigned_to, status")
      .gte("created_at", month.from)
      .lt("created_at", month.to),
    db.from("users").select("id, full_name, role").eq("is_active", true),
    getCurrentRate(db),
  ]);

  const rate = rateRow.rate;
  const saleUzs = (s: {
    total_amount_uzs: number | null;
    total_amount_usd: number | null;
  }) => s.total_amount_uzs ?? Math.round(Number(s.total_amount_usd ?? 0) * rate);

  const salesUsers = (users ?? []).filter(
    (u) => u.role === "sales" || u.role === "sales_manager",
  );
  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "—"]));

  const byPerson = new Map<string, PersonSales>();
  for (const u of salesUsers) {
    byPerson.set(u.id, {
      name: u.full_name ?? "—",
      monthCount: 0,
      monthUzs: 0,
      todayCount: 0,
      todayUzs: 0,
      leadsAssigned: 0,
      leadsWon: 0,
      leadsLost: 0,
    });
  }

  for (const s of salesMonth ?? []) {
    if (!s.sales_person_id) continue;
    const p = byPerson.get(s.sales_person_id);
    if (!p) continue;
    p.monthCount++;
    p.monthUzs += saleUzs(s);
  }

  for (const s of salesToday ?? []) {
    if (!s.sales_person_id) continue;
    const p = byPerson.get(s.sales_person_id);
    if (!p) continue;
    p.todayCount++;
    p.todayUzs += saleUzs(s);
  }

  for (const l of leads ?? []) {
    if (!l.assigned_to) continue;
    const p = byPerson.get(l.assigned_to);
    if (!p) continue;
    p.leadsAssigned++;
    if (l.status === "won") p.leadsWon++;
    if (l.status === "lost") p.leadsLost++;
  }

  // Overall totals.
  const totalMonthUzs = (salesMonth ?? []).reduce((s, r) => s + saleUzs(r), 0);
  const totalMonthCount = salesMonth?.length ?? 0;
  const totalTodayUzs = (salesToday ?? []).reduce((s, r) => s + saleUzs(r), 0);
  const totalTodayCount = salesToday?.length ?? 0;
  const totalYdayCount = salesYday?.length ?? 0;
  const totalYdayUzs = (salesYday ?? []).reduce((s, r) => s + saleUzs(r), 0);

  const totalLeads = (leads ?? []).length;
  const totalWon = (leads ?? []).filter((l) => l.status === "won").length;

  const people = Array.from(byPerson.values()).sort(
    (a, b) => b.monthUzs - a.monthUzs,
  );
  const medals = ["🥇", "🥈", "🥉"];

  const personLines = people
    .map((p, i) => {
      const medal = i < 3 ? `${medals[i]} ` : "• ";
      const conv = p.leadsAssigned
        ? `${Math.round((p.leadsWon / p.leadsAssigned) * 100)}%`
        : "—";
      return [
        `${medal}*${p.name}*`,
        `  Bu oy: ${p.monthCount} ta (${formatUzs(p.monthUzs)})`,
        `  Bugun: ${p.todayCount} ta (${formatUzs(p.todayUzs)})`,
        `  Leadlar: ${p.leadsAssigned} → ${p.leadsWon} sotuv (${conv})`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `👥 *SOTUV JAMOASI* — ${todayKey()}`,
    ``,
    `📊 *UMUMIY*`,
    `Bu oy: ${totalMonthCount} ta sotuv (${formatUzs(totalMonthUzs)})`,
    `Kecha: ${totalYdayCount} ta (${formatUzs(totalYdayUzs)})`,
    `Bugun: ${totalTodayCount} ta (${formatUzs(totalTodayUzs)})`,
    `Konversiya: ${pct(totalWon, totalLeads)} (${totalWon}/${totalLeads})`,
    ``,
    `👤 *SOTUVCHILAR*`,
    ``,
    personLines || "— Sotuv xodimlari yo'q",
  ].join("\n");
}

export async function buildPerSalespersonReports(): Promise<
  { name: string; text: string }[]
> {
  const db = requireAdminClient();
  const month = monthRange();
  const today = todayRange();

  const [
    { data: salesMonth },
    { data: salesToday },
    { data: leads },
    { data: users },
    { data: tasks },
    rateRow,
  ] = await Promise.all([
    db
      .from("sales")
      .select(
        "sales_person_id, total_amount_uzs, total_amount_usd, sold_at, lead_id",
      )
      .gte("sold_at", month.from)
      .lt("sold_at", month.to),
    db
      .from("sales")
      .select("sales_person_id, total_amount_uzs, total_amount_usd")
      .gte("sold_at", today.from)
      .lt("sold_at", today.to),
    db
      .from("leads")
      .select("id, full_name, assigned_to, status, stage_name, last_activity_at")
      .gte("created_at", month.from)
      .lt("created_at", month.to),
    db.from("users").select("id, full_name, role").eq("is_active", true),
    db
      .from("tasks")
      .select("assigned_to, status, due_date")
      .neq("status", "done"),
    getCurrentRate(db),
  ]);

  const rate = rateRow.rate;
  const saleUzs = (s: {
    total_amount_uzs: number | null;
    total_amount_usd: number | null;
  }) => s.total_amount_uzs ?? Math.round(Number(s.total_amount_usd ?? 0) * rate);

  const salesUsers = (users ?? []).filter(
    (u) => u.role === "sales" || u.role === "sales_manager",
  );

  const todayStr = new Date(Date.now() + 5 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const reports: { name: string; text: string }[] = [];

  for (const user of salesUsers) {
    const myMonthSales = (salesMonth ?? []).filter(
      (s) => s.sales_person_id === user.id,
    );
    const myTodaySales = (salesToday ?? []).filter(
      (s) => s.sales_person_id === user.id,
    );
    const myLeads = (leads ?? []).filter((l) => l.assigned_to === user.id);
    const myTasks = (tasks ?? []).filter((t) => t.assigned_to === user.id);

    const monthUzs = myMonthSales.reduce((s, r) => s + saleUzs(r), 0);
    const todayUzs = myTodaySales.reduce((s, r) => s + saleUzs(r), 0);
    const wonLeads = myLeads.filter((l) => l.status === "won").length;
    const lostLeads = myLeads.filter((l) => l.status === "lost").length;
    const activeLeads = myLeads.filter(
      (l) => l.status !== "won" && l.status !== "lost",
    );
    const conv = myLeads.length
      ? `${Math.round((wonLeads / myLeads.length) * 100)}%`
      : "—";

    const staleLeads = activeLeads.filter((l) => {
      if (!l.last_activity_at) return true;
      const daysIdle =
        (Date.now() - new Date(l.last_activity_at).getTime()) / 86_400_000;
      return daysIdle > 3;
    });

    const overdueTasks = myTasks.filter(
      (t) => t.due_date && t.due_date < todayStr,
    );
    const todayTasks = myTasks.filter(
      (t) => t.due_date && t.due_date.slice(0, 10) === todayStr,
    );

    // Commentary.
    const notes: string[] = [];
    if (staleLeads.length > 0) {
      notes.push(
        `⚠️ ${staleLeads.length} ta lead 3+ kun javobsiz — qayta aloqa qiling`,
      );
    }
    if (overdueTasks.length > 0) {
      notes.push(`🔴 ${overdueTasks.length} ta vazifa muddati o'tgan`);
    }
    if (wonLeads > 0 && myLeads.length > 0) {
      const convRate = Math.round((wonLeads / myLeads.length) * 100);
      if (convRate >= 30) {
        notes.push(`💪 Konversiya ${convRate}% — ajoyib natija!`);
      } else if (convRate < 15) {
        notes.push(
          `📉 Konversiya ${convRate}% — lead sifatini tekshiring`,
        );
      }
    }
    if (myMonthSales.length === 0) {
      notes.push(`⚠️ Bu oy hali sotuv yo'q`);
    }

    const staleLines =
      staleLeads.length > 0
        ? staleLeads
            .slice(0, 5)
            .map((l) => `  • ${l.full_name ?? "Nomsiz"}`)
            .join("\n")
        : "";

    const text = [
      `📋 *${user.full_name ?? "—"}* — shaxsiy hisobot`,
      ``,
      `💰 *SOTUV*`,
      `Bu oy: ${myMonthSales.length} ta (${formatUzs(monthUzs)})`,
      `Bugun: ${myTodaySales.length} ta (${formatUzs(todayUzs)})`,
      ``,
      `🎯 *LEADLAR*`,
      `Jami: ${myLeads.length} | Sotuv: ${wonLeads} | Yo'qotilgan: ${lostLeads}`,
      `Konversiya: ${conv}`,
      `Faol: ${activeLeads.length} | Javobsiz (3+ kun): ${staleLeads.length}`,
      ...(staleLines ? [``, `🔇 *JAVOBSIZ LEADLAR*`, staleLines] : []),
      ``,
      `📝 *VAZIFALAR*`,
      `Muddati o'tgan: ${overdueTasks.length} | Bugun: ${todayTasks.length}`,
      ...(notes.length > 0 ? [``, `💬 *IZOH*`, ...notes] : []),
    ].join("\n");

    reports.push({ name: user.full_name ?? "—", text });
  }

  return reports;
}
