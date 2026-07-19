import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { round2 } from "@/lib/business/currency";
import { callText } from "./claude";

const OPEN = ["backlog", "todo", "in_progress", "review"];

/**
 * Build a plain-language Uzbek weekly summary of team performance + a few
 * headline finance numbers. Sends AGGREGATES ONLY to the AI — no customer data,
 * no per-sale ledgers. Returns null if there's nothing to report.
 */
export async function buildWeeklySummary(): Promise<string | null> {
  const db = requireAdminClient();
  const now = new Date();
  const nowISO = now.toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const [
    { data: users },
    { data: completed },
    { data: open },
    { data: sales },
    { data: refunded },
    { data: expenses },
    { data: accounts },
    { data: txns },
    rate,
  ] = await Promise.all([
    db.from("users").select("id, full_name").eq("is_active", true),
    db
      .from("tasks")
      .select("assigned_to, due_date, completed_at")
      .eq("status", "done")
      .gte("completed_at", weekAgo),
    db.from("tasks").select("assigned_to, due_date, status").in("status", OPEN),
    db.from("sales").select("total_amount_usd").gte("sold_at", monthFrom).lt("sold_at", nowISO),
    db
      .from("sales")
      .select("refund_amount_usd")
      .eq("is_refunded", true)
      .gte("refunded_at", monthFrom)
      .lt("refunded_at", nowISO),
    db
      .from("expenses")
      .select("amount_usd")
      .gte("expense_date", monthFrom.slice(0, 10))
      .lt("expense_date", nowISO.slice(0, 10)),
    db.from("accounts").select("id, currency"),
    db.from("account_transactions").select("account_id, direction, amount"),
    getCurrentRate(db),
  ]);

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "—"]));

  // Per-person task stats (this week).
  type P = { name: string; done: number; withDue: number; onTime: number; overdue: number };
  const stat = new Map<string, P>();
  const ensure = (id: string) =>
    stat.get(id) ?? stat.set(id, { name: nameById.get(id) ?? "—", done: 0, withDue: 0, onTime: 0, overdue: 0 }).get(id)!;
  for (const t of completed ?? []) {
    if (!t.assigned_to) continue;
    const p = ensure(t.assigned_to);
    p.done += 1;
    if (t.due_date) {
      p.withDue += 1;
      if (t.completed_at && t.completed_at <= t.due_date) p.onTime += 1;
    }
  }
  for (const t of open ?? []) {
    if (!t.assigned_to) continue;
    if (t.due_date && t.due_date < nowISO) ensure(t.assigned_to).overdue += 1;
  }
  const people = Array.from(stat.values())
    .map((p) => ({
      name: p.name,
      completed: p.done,
      onTimePct: p.withDue ? Math.round((p.onTime / p.withDue) * 100) : null,
      overdue: p.overdue,
    }))
    .sort((a, b) => b.completed - a.completed);

  const totalCompleted = people.reduce((s, p) => s + p.completed, 0);
  const totalOverdue = people.reduce((s, p) => s + p.overdue, 0);

  // Finance month-to-date.
  const sum = (rows: { [k: string]: unknown }[] | null, key: string) =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const gross = round2(sum(sales, "total_amount_usd"));
  const refunds = round2(sum(refunded, "refund_amount_usd"));
  const opex = round2(sum(expenses, "amount_usd"));
  const commissions = round2(gross * 0.12);
  const netProfit = round2(gross - refunds - opex - commissions);

  const bal = new Map<string, number>();
  for (const t of txns ?? []) {
    if (!t.account_id) continue;
    const d = (t.direction === "in" ? 1 : -1) * Number(t.amount ?? 0);
    bal.set(t.account_id, (bal.get(t.account_id) ?? 0) + d);
  }
  let kassaUsd = 0;
  for (const a of accounts ?? []) {
    const b = bal.get(a.id) ?? 0;
    kassaUsd += a.currency === "USD" ? b : rate.rate > 0 ? b / rate.rate : 0;
  }
  kassaUsd = round2(kassaUsd);

  if (totalCompleted === 0 && (open ?? []).length === 0 && gross === 0) return null;

  const payload = {
    hafta: { bajarilgan: totalCompleted, muddati_otgan: totalOverdue },
    xodimlar: people,
    moliya_oy: {
      sotuv_usd: gross,
      qaytarim_usd: refunds,
      xarajat_usd: opex,
      sof_foyda_usd: netProfit,
      kassa_usd: kassaUsd,
    },
  };

  const text = await callText({
    feature: "weekly_summary",
    maxTokens: 1200,
    system:
      "Siz kichik biznes uchun haftalik hisobot yozuvchisiz. Berilgan JSON (faqat " +
      "umumlashtirilgan raqamlar) asosida O'ZBEK tilida qisqa, aniq haftalik xulosa yozing. " +
      "Telegram uchun: sarlavha, 3-6 ta muhim nuqta (kim yaxshi ishladi, kim ortda, muddati " +
      "o'tganlar, moliya holati), va 1-2 ta amaliy tavsiya. Emoji o'rtacha ishlating. Maxfiy " +
      "mijoz ma'lumoti yo'q — faqat jamlanma.",
    user: JSON.stringify(payload),
  });

  return text.trim() || null;
}
