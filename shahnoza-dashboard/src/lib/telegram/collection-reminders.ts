import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { formatUzs } from "@/lib/format";
import { sendMessage, tasksChatId } from "./bot";

/** Tashkent (UTC+5) date, `offsetDays` from today, as YYYY-MM-DD. */
function tashkentDate(offsetDays = 0): string {
  return new Date(Date.now() + 5 * 3600 * 1000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function dpd(due: string, today: string): number {
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000,
  );
}

/** Uzbek short date "25-iyul" for a YYYY-MM-DD. */
const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];
function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(day)}-${UZ_MONTHS[Number(m) - 1] ?? m}`;
}

/**
 * Daily collection nudge: overdue instalments + those due in the next 3 days,
 * posted to the tasks/finance group. No-ops (returns sent:false) when there's
 * nothing to chase. Folded into the daily cron.
 */
export async function sendCollectionReminders(): Promise<{ sent: boolean; overdue: number; soon: number }> {
  const db = requireAdminClient();
  const today = tashkentDate(0);
  const horizon = tashkentDate(3);

  const { data: rows } = await db
    .from("payments")
    .select("lead_id, amount_uzs, due_date, status")
    .not("lead_id", "is", null)
    .neq("status", "paid")
    .not("due_date", "is", null)
    .lte("due_date", horizon)
    .order("due_date", { ascending: true });

  if (!rows || rows.length === 0) return { sent: false, overdue: 0, soon: 0 };

  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean))) as string[];
  const { data: leads } = await db.from("leads").select("id, full_name").in("id", leadIds);
  const nameById = new Map((leads ?? []).map((l) => [l.id, l.full_name ?? "—"]));

  const overdue: string[] = [];
  const soon: string[] = [];
  let overdueUzs = 0;
  for (const r of rows) {
    const name = r.lead_id ? nameById.get(r.lead_id) ?? "—" : "—";
    const amt = Number(r.amount_uzs ?? 0);
    const days = dpd(r.due_date as string, today);
    if (days > 0) {
      overdueUzs += amt;
      overdue.push(`• ${name} — ${formatUzs(amt)} (${days} kun kechikdi)`);
    } else {
      soon.push(`• ${name} — ${formatUzs(amt)} (${shortDate(r.due_date as string)})`);
    }
  }

  if (overdue.length === 0 && soon.length === 0) return { sent: false, overdue: 0, soon: 0 };

  const parts: string[] = ["💰 *YIG'IM ESLATMASI*"];
  if (overdue.length) {
    parts.push(`\n🔴 *Kechikkan* (${overdue.length} ta · ${formatUzs(overdueUzs)}):\n${overdue.slice(0, 20).join("\n")}`);
  }
  if (soon.length) {
    parts.push(`\n🟡 *Yaqin muddat* (3 kun):\n${soon.slice(0, 20).join("\n")}`);
  }
  const ok = (await sendMessage(tasksChatId(), parts.join("\n"))) !== null;
  return { sent: ok, overdue: overdue.length, soon: soon.length };
}
