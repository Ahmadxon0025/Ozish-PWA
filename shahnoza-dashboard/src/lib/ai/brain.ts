import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env, isAiConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_MODEL } from "./claude";
import { monthRange, todayRange, yesterdayRange } from "@/lib/dates";
import { computeCommissions } from "@/lib/business/commission";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { round2 } from "@/lib/business/currency";
import { notifyTaskCreated } from "@/lib/notify/task-events";

type Db = SupabaseClient<Database>;

/** Tashkent (UTC+5) calendar date. */
function tashToday(): string {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
const sumBy = <T>(rows: T[], f: (r: T) => number | null) =>
  rows.reduce((s, r) => s + Number(f(r) ?? 0), 0);

function rangeFor(period: string) {
  if (period === "today") return todayRange();
  if (period === "yesterday") return yesterdayRange();
  return monthRange(); // default: this month
}

// --- Tool implementations --------------------------------------------------

async function getSalesSummary(db: Db, period: string) {
  const r = rangeFor(period);
  const [{ data: sales }, { data: users }] = await Promise.all([
    db
      .from("sales")
      .select("total_amount_usd, total_amount_uzs, sales_person_id, lead_id, is_refunded")
      .gte("sold_at", r.from)
      .lt("sold_at", r.to),
    db.from("users").select("id, full_name"),
  ]);
  const rows = sales ?? [];
  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
  const byPersonMap = new Map<string, { count: number; uzs: number }>();
  for (const s of rows) {
    const key = s.sales_person_id ?? "—";
    const b = byPersonMap.get(key) ?? { count: 0, uzs: 0 };
    b.count += 1;
    b.uzs += Number(s.total_amount_uzs ?? 0);
    byPersonMap.set(key, b);
  }
  const byPerson = Array.from(byPersonMap.entries())
    .map(([id, v]) => ({ name: id === "—" ? "—" : nameById.get(id) ?? "—", ...v }))
    .sort((a, b) => b.uzs - a.uzs);
  return {
    period,
    count: rows.length,
    totalUzs: sumBy(rows, (s) => s.total_amount_uzs),
    totalUsd: round2(sumBy(rows, (s) => s.total_amount_usd)),
    byPerson,
  };
}

async function getLeadFunnel(db: Db) {
  const { data: leads } = await db.from("leads").select("status, utm_source");
  const rows = leads ?? [];
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const l of rows) {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    const src = l.utm_source || "Noma'lum";
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  const won = byStatus["won"] ?? 0;
  return {
    total: rows.length,
    byStatus,
    bySource,
    conversionPct: rows.length ? Math.round((won / rows.length) * 100) : 0,
  };
}

async function getTaskStatus(db: Db, personName?: string) {
  const { data: users } = await db.from("users").select("id, full_name");
  const today = tashToday();
  const tashDay = (iso: string) =>
    new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 10);
  let personId: string | null = null;
  if (personName) {
    const wanted = personName.toLowerCase();
    personId =
      (users ?? []).find((u) => (u.full_name ?? "").toLowerCase().includes(wanted))?.id ??
      null;
  }
  let q = db.from("tasks").select("assigned_to, status, due_date");
  if (personId) q = q.eq("assigned_to", personId);
  const { data: tasks } = await q;
  const rows = (tasks ?? []).filter((t) => t.status !== "cancelled");
  const open = rows.filter((t) => t.status !== "done");
  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
  const byPersonMap = new Map<string, { open: number; overdue: number; done: number }>();
  for (const t of rows) {
    const key = t.assigned_to ?? "—";
    const b = byPersonMap.get(key) ?? { open: 0, overdue: 0, done: 0 };
    if (t.status === "done") b.done += 1;
    else {
      b.open += 1;
      if (t.due_date && tashDay(t.due_date) < today) b.overdue += 1;
    }
    byPersonMap.set(key, b);
  }
  const byPerson = Array.from(byPersonMap.entries())
    .map(([id, v]) => ({ name: id === "—" ? "—" : nameById.get(id) ?? "—", ...v }))
    .sort((a, b) => b.open - a.open);
  return {
    person: personName ?? null,
    openTotal: open.length,
    overdueTotal: open.filter((t) => t.due_date && tashDay(t.due_date) < today).length,
    dueTodayTotal: open.filter((t) => t.due_date && tashDay(t.due_date) === today).length,
    byPerson: personId ? byPerson : byPerson.slice(0, 12),
  };
}

async function getFinanceSummary(db: Db, period: string) {
  const r = rangeFor(period === "today" || period === "yesterday" ? "month" : period);
  const [{ data: sales }, { data: expenses }, { data: accs }, { data: txns }, rate] =
    await Promise.all([
      db
        .from("sales")
        .select("total_amount_usd, total_amount_uzs, sales_person_id, is_refunded, refund_amount_usd")
        .gte("sold_at", r.from)
        .lt("sold_at", r.to),
      db
        .from("expenses")
        .select("amount_usd")
        .gte("expense_date", r.from.slice(0, 10))
        .lt("expense_date", r.to.slice(0, 10)),
      db.from("accounts").select("id, currency"),
      db.from("account_transactions").select("account_id, direction, amount"),
      getCurrentRate(db),
    ]);
  const srows = sales ?? [];
  const revenueUsd = round2(sumBy(srows, (s) => s.total_amount_usd));
  const revenueUzs = sumBy(srows, (s) => s.total_amount_uzs);
  const expensesUsd = round2(sumBy(expenses ?? [], (e) => e.amount_usd));
  const commissions = round2(
    sumBy(
      computeCommissions(
        srows.map((s, i) => ({
          id: String(i),
          sales_person_id: s.sales_person_id,
          total_amount_usd: s.total_amount_usd,
          is_refunded: s.is_refunded,
          refund_amount_usd: s.refund_amount_usd,
        })),
      ),
      (c) => c.amountUsd,
    ),
  );
  const netUsd = round2(revenueUsd - expensesUsd - commissions);
  // Kassa (cash) balance across accounts, in USD.
  const bal = new Map<string, number>();
  for (const t of txns ?? []) {
    if (!t.account_id) continue;
    bal.set(
      t.account_id,
      (bal.get(t.account_id) ?? 0) + (t.direction === "in" ? 1 : -1) * Number(t.amount ?? 0),
    );
  }
  let kassaUsd = 0;
  for (const a of accs ?? []) {
    const b = bal.get(a.id) ?? 0;
    kassaUsd += a.currency === "USD" ? b : rate.rate > 0 ? b / rate.rate : 0;
  }
  const toUzs = (usd: number) => Math.round(usd * rate.rate);
  return {
    period: r === monthRange() ? "month" : period,
    revenueUzs: revenueUzs || toUzs(revenueUsd),
    expensesUzs: toUzs(expensesUsd),
    commissionsUzs: toUzs(commissions),
    netProfitUzs: toUzs(netUsd),
    kassaUzs: toUzs(round2(kassaUsd)),
    rate: rate.rate,
  };
}

async function createTaskTool(
  db: Db,
  createdBy: string | null,
  input: { title: string; assigneeName?: string; dueDate?: string; priority?: string },
) {
  const { data: users } = await db.from("users").select("id, full_name").eq("is_active", true);
  let assignedTo: string | null = null;
  if (input.assigneeName) {
    const wanted = input.assigneeName.toLowerCase();
    assignedTo =
      (users ?? []).find((u) => (u.full_name ?? "").toLowerCase().includes(wanted))?.id ?? null;
  }
  const primary = assignedTo ?? createdBy;
  const priority = ["low", "medium", "high", "urgent"].includes(input.priority ?? "")
    ? input.priority!
    : "medium";
  const { data, error } = await db
    .from("tasks")
    .insert({
      title: input.title,
      assigned_to: primary,
      created_by: createdBy,
      priority,
      status: "todo",
      due_date: input.dueDate || null,
    })
    .select("id, title")
    .single();
  if (error || !data) return { ok: false, error: error?.message };
  if (primary) {
    await db.from("task_assignees").insert({ task_id: data.id, user_id: primary, is_primary: true });
  }
  await notifyTaskCreated({
    taskId: data.id,
    title: data.title,
    assignedTo: primary,
    createdBy,
    priority,
    dueDate: input.dueDate || null,
    isSubtask: false,
  });
  const assigneeName = primary
    ? (users ?? []).find((u) => u.id === primary)?.full_name ?? null
    : null;
  return { ok: true, taskId: data.id, title: data.title, assignee: assigneeName };
}

// --- Tool schema (Anthropic) ----------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_sales_summary",
    description:
      "Sotuv (savdo) ma'lumotlari: jami summa (so'm), bitimlar soni, xodimlar kesimida. Bugun/kecha/oy uchun.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "yesterday", "month"] } },
      required: ["period"],
    },
  },
  {
    name: "get_lead_funnel",
    description: "Leadlar voronkasi: umumiy son, holatlar kesimida, manba kesimida, konversiya %.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_task_status",
    description:
      "Vazifalar holati: ochiq, muddati o'tgan, bugun muddati, xodimlar kesimida. Bitta odam uchun personName bering.",
    input_schema: {
      type: "object",
      properties: { personName: { type: "string", description: "Xodim ismi (ixtiyoriy)" } },
    },
  },
  {
    name: "get_finance_summary",
    description:
      "Moliya (bu oy): tushum, xarajat, komissiya, sof foyda, kassa qoldig'i — hammasi so'mda.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["month"] } },
    },
  },
  {
    name: "create_task",
    description: "Yangi vazifa yaratish. Xodimga biriktirish uchun assigneeName bering.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        assigneeName: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      },
      required: ["title"],
    },
  },
];

async function runTool(
  db: Db,
  createdBy: string | null,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_sales_summary":
      return getSalesSummary(db, String(input.period ?? "month"));
    case "get_lead_funnel":
      return getLeadFunnel(db);
    case "get_task_status":
      return getTaskStatus(db, input.personName ? String(input.personName) : undefined);
    case "get_finance_summary":
      return getFinanceSummary(db, "month");
    case "create_task":
      return createTaskTool(db, createdBy, input as never);
    default:
      return { error: `unknown tool ${name}` };
  }
}

const SYSTEM = (canWrite: boolean) =>
  `Siz "Shahnoza" biznesining AI miyasisiz (ERP yordamchi) — bolalar massaji onlayn-kurs biznesi. ` +
  `Bugun (Toshkent): ${tashToday()}. ` +
  `Foydalanuvchi savoliga javob berish uchun mavjud tool'lardan foydalaning — taxmin qilmang, ma'lumotni tool orqali oling. ` +
  `Pulni doim SO'M (UZS) da, minglik ajratib ko'rsating (masalan 1 200 000 so'm). ` +
  `Javob QISQA, aniq va O'zbek tilida bo'lsin. Telegram uchun sodda matn, kerak bo'lsa emoji va ro'yxat ishlating. ` +
  (canWrite
    ? `Vazifa yaratish so'ralsa create_task ishlating.`
    : `Siz faqat o'qiy olasiz — vazifa yaratmang.`) +
  ` Agar ma'lumot bo'lmasa, halol ayting.`;

export interface BrainResult {
  text: string;
  rounds: number;
}

/**
 * The ERP "brain": answers a natural-language business question by calling
 * read/write tools over the live data. Used by the app and the Telegram bot.
 */
export async function runBrain(
  question: string,
  opts: { userId?: string | null; canWrite?: boolean; feature?: string } = {},
): Promise<BrainResult> {
  if (!isAiConfigured()) throw new Error("AI sozlanmagan (ANTHROPIC_API_KEY yo'q).");
  const db = createAdminClient();
  if (!db) throw new Error("Server sozlanmagan.");
  const canWrite = opts.canWrite ?? false;
  const tools = canWrite ? TOOLS : TOOLS.filter((t) => t.name !== "create_task");

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  const MAX_ROUNDS = 6;
  let rounds = 0;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    rounds++;
    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1200,
      system: SYSTEM(canWrite),
      tools,
      messages,
    });
    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const out = await runTool(db, opts.userId ?? null, block.name, block.input as never);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(out),
          });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { text: text || "Javob topilmadi.", rounds };
  }
  return { text: "Savol juda murakkab — aniqroq so'rang.", rounds };
}
