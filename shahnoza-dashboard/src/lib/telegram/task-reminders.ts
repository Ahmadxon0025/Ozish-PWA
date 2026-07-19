import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { sendMessage, tasksChatId } from "./bot";

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

function bulletTitles(titles: string[], cap = 8): string {
  const shown = titles.slice(0, cap).map((t) => `  • ${t}`);
  if (titles.length > cap) shown.push(`  • …va yana ${titles.length - cap} ta`);
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

/**
 * A single person's open tasks, grouped overdue / today / upcoming — for the
 * `/vazifalarim` bot command. Returns null if they have no open tasks.
 */
export async function personalTasksText(
  db: ReturnType<typeof requireAdminClient>,
  userId: string,
  name: string,
): Promise<string | null> {
  const { data: tasks } = await db
    .from("tasks")
    .select("title, due_date, status")
    .eq("assigned_to", userId)
    .in("status", OPEN)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (!tasks || tasks.length === 0) return null;

  const today = tashDate(Date.now());
  const overdue: string[] = [];
  const dueToday: string[] = [];
  const upcoming: string[] = [];
  const noDate: string[] = [];
  for (const t of tasks) {
    if (!t.due_date) {
      noDate.push(`  • ${t.title}`);
      continue;
    }
    const due = tashDate(Date.parse(t.due_date));
    if (due < today) overdue.push(`  • ${t.title} (${due})`);
    else if (due === today) dueToday.push(`  • ${t.title}`);
    else upcoming.push(`  • ${t.title} (${due})`);
  }

  const out: string[] = [`📋 *Vazifalaringiz, ${name}*`];
  if (overdue.length) out.push(`\n🔴 *Muddati o'tgan (${overdue.length})*\n${overdue.join("\n")}`);
  if (dueToday.length) out.push(`\n🟡 *Bugun (${dueToday.length})*\n${dueToday.join("\n")}`);
  if (upcoming.length) out.push(`\n🔵 *Keyingi (${upcoming.length})*\n${upcoming.slice(0, 10).join("\n")}`);
  if (noDate.length) out.push(`\n⚪ *Muddatsiz (${noDate.length})*\n${noDate.slice(0, 10).join("\n")}`);
  return out.join("\n");
}

/**
 * Evening recap: everything the team marked **done today** (Tashkent day),
 * grouped by person. Returns null when nobody completed anything today.
 */
export async function buildDoneToday(): Promise<string | null> {
  const db = requireAdminClient();
  const today = tashDate(Date.now());
  // Start of the Tashkent day, expressed as a UTC instant.
  const startUtc = new Date(`${today}T00:00:00+05:00`).toISOString();

  const [{ data: tasks }, { data: users }] = await Promise.all([
    db
      .from("tasks")
      .select("title, assigned_to, completed_at")
      .eq("status", "done")
      .gte("completed_at", startUtc),
    db.from("users").select("id, full_name").eq("is_active", true),
  ]);
  if (!tasks || tasks.length === 0) return null;

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "—"]));
  const byUser = new Map<string, string[]>();
  const other: string[] = [];
  for (const t of tasks) {
    if (t.assigned_to && nameById.has(t.assigned_to)) {
      const arr =
        byUser.get(t.assigned_to) ??
        byUser.set(t.assigned_to, []).get(t.assigned_to)!;
      arr.push(t.title);
    } else {
      other.push(t.title);
    }
  }

  const lines: string[] = [`✅ *BUGUN BAJARILGAN VAZIFALAR* (${tasks.length})`];
  const entries = Array.from(byUser.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [uid, titles] of entries) {
    lines.push(`\n*${nameById.get(uid)}* — ${titles.length} ta:\n${bulletTitles(titles)}`);
  }
  if (other.length) {
    lines.push(`\n*Boshqa* — ${other.length} ta:\n${bulletTitles(other)}`);
  }
  return lines.join("\n");
}

/**
 * Evening scorecard: each person's tasks for **today** — the ones they
 * finished (✅) and the ones still due today but open (⬜), with a done/total
 * count. Returns null when there's nothing for today.
 */
export async function buildTodayRecap(): Promise<string | null> {
  const db = requireAdminClient();
  const today = tashDate(Date.now());
  const startUtc = new Date(`${today}T00:00:00+05:00`).toISOString();

  const [{ data: doneTasks }, { data: openTasks }, { data: users }] =
    await Promise.all([
      db
        .from("tasks")
        .select("title, assigned_to")
        .eq("status", "done")
        .gte("completed_at", startUtc),
      db
        .from("tasks")
        .select("title, assigned_to, due_date")
        .in("status", OPEN)
        .not("due_date", "is", null),
      db.from("users").select("id, full_name").eq("is_active", true),
    ]);

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "—"]));
  const OTHER = "__other__";
  type Bucket = { done: string[]; open: string[] };
  const byUser = new Map<string, Bucket>();
  const bucketFor = (id: string | null): Bucket => {
    const key = id && nameById.has(id) ? id : OTHER;
    let b = byUser.get(key);
    if (!b) {
      b = { done: [], open: [] };
      byUser.set(key, b);
    }
    return b;
  };

  for (const t of doneTasks ?? []) bucketFor(t.assigned_to).done.push(t.title);
  for (const t of openTasks ?? []) {
    if (!t.due_date) continue;
    if (tashDate(Date.parse(t.due_date)) !== today) continue; // only due today
    bucketFor(t.assigned_to).open.push(t.title);
  }

  const people = Array.from(byUser.entries()).filter(
    ([, b]) => b.done.length || b.open.length,
  );
  if (people.length === 0) return null;

  // Most finished first, then biggest workload.
  people.sort((a, b) => {
    const [, ba] = a;
    const [, bb] = b;
    return (
      bb.done.length - ba.done.length ||
      bb.done.length + bb.open.length - (ba.done.length + ba.open.length)
    );
  });

  const doneTotal = people.reduce((s, [, b]) => s + b.done.length, 0);
  const allTotal = people.reduce((s, [, b]) => s + b.done.length + b.open.length, 0);
  const lines: string[] = [
    `📋 *BUGUNGI VAZIFALAR* — ${doneTotal}/${allTotal} bajarildi`,
  ];
  const cap = 10;
  for (const [key, b] of people) {
    const name = key === OTHER ? "Boshqa" : nameById.get(key);
    const total = b.done.length + b.open.length;
    const rows = [
      ...b.done.map((t) => `  ✅ ${t}`),
      ...b.open.map((t) => `  ⬜ ${t}`),
    ];
    const shown = rows.slice(0, cap);
    if (rows.length > cap) shown.push(`  • …va yana ${rows.length - cap} ta`);
    lines.push(`\n*${name}* — ${b.done.length}/${total} bajarildi\n${shown.join("\n")}`);
  }
  return lines.join("\n");
}

/** Send the evening "today's tasks" scorecard to the tasks group. */
export async function sendTodayRecap(): Promise<{ group: number }> {
  const groupText = await buildTodayRecap();
  if (!groupText) return { group: 0 };
  const ok = (await sendMessage(tasksChatId(), groupText)) !== null;
  return { group: ok ? 1 : 0 };
}

/** Send the daily task reminders (team summary + personal DMs). */
export async function sendTaskReminders(): Promise<{
  group: number;
  dms: number;
}> {
  const { groupText, perUser } = await buildTaskReminders();
  if (!groupText) return { group: 0, dms: 0 };

  // Task reminders go to the dedicated tasks group (not the finance chat).
  const groupOk = (await sendMessage(tasksChatId(), groupText)) !== null;
  let dms = 0;
  for (const u of perUser) {
    if ((await sendMessage(u.telegramId, u.text)) !== null) dms += 1;
  }
  return { group: groupOk ? 1 : 0, dms };
}
