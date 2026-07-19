import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { broadcast, sendMessage } from "./bot";

const OPEN = ["backlog", "todo", "in_progress", "review"];

/** Tashkent (UTC+5, no DST) calendar date for a timestamp. */
function tashDate(ms: number): string {
  return new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

type Row = { title: string };
type Person = {
  name: string;
  telegramId: string | null;
  overdue: Row[];
  today: Row[];
};

function listTasks(rows: Row[], cap = 6): string {
  const shown = rows.slice(0, cap).map((r) => `  • ${r.title}`);
  if (rows.length > cap) shown.push(`  • …va yana ${rows.length - cap} ta`);
  return shown.join("\n");
}

/**
 * Build the daily task reminder: which people have tasks due **today** or
 * **overdue** (open tasks with a due date). Returns a team summary for the
 * group, plus personalised DM texts for users who have a Telegram id.
 */
export async function buildTaskReminders(): Promise<{
  groupText: string | null;
  perUser: { telegramId: string; text: string }[];
}> {
  const db = requireAdminClient();
  const [{ data: tasks }, { data: users }] = await Promise.all([
    db
      .from("tasks")
      .select("title, due_date, assigned_to, status")
      .in("status", OPEN)
      .not("due_date", "is", null),
    db.from("users").select("id, full_name, telegram_id").eq("is_active", true),
  ]);

  const today = tashDate(Date.now());
  const byUser = new Map<string, Person>();
  const uById = new Map(
    (users ?? []).map((u) => [u.id, { name: u.full_name ?? "—", tg: u.telegram_id }]),
  );

  for (const t of tasks ?? []) {
    if (!t.assigned_to || !t.due_date) continue;
    const u = uById.get(t.assigned_to);
    if (!u) continue;
    const due = tashDate(Date.parse(t.due_date));
    const bucket = due < today ? "overdue" : due === today ? "today" : null;
    if (!bucket) continue; // future — not a reminder
    const p =
      byUser.get(t.assigned_to) ??
      byUser
        .set(t.assigned_to, {
          name: u.name,
          telegramId: u.tg,
          overdue: [],
          today: [],
        })
        .get(t.assigned_to)!;
    p[bucket].push({ title: t.title });
  }

  const people = Array.from(byUser.values()).filter(
    (p) => p.overdue.length || p.today.length,
  );
  if (people.length === 0) return { groupText: null, perUser: [] };

  // Team summary (sorted: most overdue first).
  people.sort((a, b) => b.overdue.length - a.overdue.length);
  const lines: string[] = ["📋 *VAZIFALAR ESLATMASI*"];
  const overdueTotal = people.reduce((s, p) => s + p.overdue.length, 0);
  const todayTotal = people.reduce((s, p) => s + p.today.length, 0);
  if (overdueTotal) {
    lines.push(`\n🔴 *Muddati o'tgan (${overdueTotal})*`);
    for (const p of people.filter((x) => x.overdue.length)) {
      lines.push(`*${p.name}* — ${p.overdue.length} ta:\n${listTasks(p.overdue)}`);
    }
  }
  if (todayTotal) {
    lines.push(`\n🟡 *Bugun muddati (${todayTotal})*`);
    for (const p of people.filter((x) => x.today.length)) {
      lines.push(`*${p.name}* — ${p.today.length} ta:\n${listTasks(p.today)}`);
    }
  }
  const groupText = lines.join("\n");

  // Personal DMs (best-effort; only users with a Telegram id).
  const perUser: { telegramId: string; text: string }[] = [];
  for (const p of people) {
    if (!p.telegramId) continue;
    const t: string[] = [`Salom, *${p.name}*! Bugungi eslatma:`];
    if (p.overdue.length) t.push(`\n🔴 *Muddati o'tgan (${p.overdue.length})*\n${listTasks(p.overdue)}`);
    if (p.today.length) t.push(`\n🟡 *Bugun muddati (${p.today.length})*\n${listTasks(p.today)}`);
    perUser.push({ telegramId: p.telegramId, text: t.join("\n") });
  }

  return { groupText, perUser };
}

/** Send the daily task reminders (team summary + personal DMs). */
export async function sendTaskReminders(): Promise<{
  group: number;
  dms: number;
}> {
  const { groupText, perUser } = await buildTaskReminders();
  if (!groupText) return { group: 0, dms: 0 };

  const results = await broadcast(groupText);
  let dms = 0;
  for (const u of perUser) {
    if ((await sendMessage(u.telegramId, u.text)) !== null) dms += 1;
  }
  return { group: results.filter((r) => r.ok).length, dms };
}
