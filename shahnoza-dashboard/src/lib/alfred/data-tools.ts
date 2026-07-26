import type Anthropic from "@anthropic-ai/sdk";

/**
 * Alfred's live read tools. The prompt snapshot is only a summary — these let
 * the model query anything else on demand. All queries run on the CALLER'S
 * Supabase client, so RLS decides what each user's Alfred can see.
 * Read-only by design: no tool here mutates anything.
 */

export const ALFRED_DATA_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_tasks",
    description:
      "Search tasks with filters. Use for anything the OPEN TASKS snapshot doesn't show: done/completed tasks, a specific person's tasks, tasks matching a phrase, or counts by status.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "backlog", "in_progress", "review", "done", "all"],
          description: "Task status filter. 'all' includes done.",
        },
        assignee_name: {
          type: "string",
          description: "Filter to tasks assigned to this team member (partial name ok)",
        },
        query: { type: "string", description: "Match against task title" },
        limit: { type: "number", description: "Max rows, default 30, max 50" },
      },
    },
  },
  {
    name: "search_sales",
    description:
      "List individual sales (deals): date, amount, salesperson, refund state. Use for questions about specific sales, a month's deals, or per-person sales.",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM, e.g. 2026-07" },
        sales_person_name: { type: "string" },
        limit: { type: "number", description: "Max rows, default 30, max 50" },
      },
    },
  },
  {
    name: "search_leads",
    description:
      "Search leads/customers: name, phone, status, who they're assigned to. Use for lead pipeline questions or finding a specific customer.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Lead status, e.g. new, qualified, sold, lost" },
        query: { type: "string", description: "Match against lead name or phone" },
        limit: { type: "number", description: "Max rows, default 30, max 50" },
      },
    },
  },
  {
    name: "search_expenses",
    description:
      "List individual expenses: date, USD amount, description, who was paid. Use for questions about specific spending.",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        query: { type: "string", description: "Match against description or paid_to" },
        limit: { type: "number", description: "Max rows, default 30, max 50" },
      },
    },
  },
  {
    name: "search_payments",
    description:
      "List receivable instalments (customer payment schedule): debtor, amount in so'm, due date, status. Use for collection/debt questions beyond the snapshot's summary.",
    input_schema: {
      type: "object",
      properties: {
        only_unpaid: { type: "boolean", description: "Default true" },
        overdue_only: { type: "boolean" },
        limit: { type: "number", description: "Max rows, default 30, max 50" },
      },
    },
  },
  {
    name: "get_team_workload",
    description:
      "Per-person task counts: open tasks, done in the last 30 days. Use for workload and performance questions.",
    input_schema: { type: "object", properties: {} },
  },
];

function cap(limit: unknown, def = 30): number {
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50) : def;
}

function monthBounds(month: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to = new Date(Date.UTC(y, m, 1)).toISOString();
  return { from, to };
}

async function userMap(db: any): Promise<Map<string, string>> {
  const { data } = await db.from("users").select("id, full_name");
  return new Map((data || []).map((u: any) => [u.id, u.full_name ?? "—"]));
}

async function resolveUserId(db: any, name: string): Promise<string | null> {
  const { data } = await db
    .from("users")
    .select("id, full_name")
    .ilike("full_name", `%${name.trim()}%`)
    .limit(2);
  if (!data || data.length !== 1) return null;
  return data[0].id;
}

/** Execute one read tool. Returns JSON-serializable data; never throws. */
export async function executeDataTool(
  db: any,
  name: string,
  input: any
): Promise<any> {
  try {
    switch (name) {
      case "search_tasks": {
        let q = db
          .from("tasks")
          .select("id, title, status, priority, due_date, completed_at, assigned_to, created_at");
        if (input?.status && input.status !== "all") {
          q = q.eq("status", input.status);
        }
        if (input?.query) q = q.ilike("title", `%${input.query}%`);
        if (input?.assignee_name) {
          const uid = await resolveUserId(db, input.assignee_name);
          if (!uid) return { error: `"${input.assignee_name}" topilmadi yoki bir nechta mos keldi` };
          q = q.eq("assigned_to", uid);
        }
        const { data, error } = await q
          .order("created_at", { ascending: false })
          .limit(cap(input?.limit));
        if (error) return { error: error.message };
        const names = await userMap(db);
        return {
          count: (data || []).length,
          tasks: (data || []).map((t: any) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            due_date: t.due_date ? String(t.due_date).slice(0, 10) : null,
            completed_at: t.completed_at ? String(t.completed_at).slice(0, 10) : null,
            assignee: names.get(t.assigned_to) ?? "biriktirilmagan",
          })),
        };
      }

      case "search_sales": {
        let q = db
          .from("sales")
          .select("sold_at, total_amount_usd, total_amount_uzs, sales_person_id, is_refunded, refund_amount_usd");
        if (input?.month) {
          const b = monthBounds(input.month);
          if (!b) return { error: "month formati YYYY-MM bo'lishi kerak" };
          q = q.gte("sold_at", b.from).lt("sold_at", b.to);
        }
        if (input?.sales_person_name) {
          const uid = await resolveUserId(db, input.sales_person_name);
          if (!uid) return { error: `"${input.sales_person_name}" topilmadi` };
          q = q.eq("sales_person_id", uid);
        }
        const { data, error } = await q
          .order("sold_at", { ascending: false })
          .limit(cap(input?.limit));
        if (error) return { error: error.message };
        const names = await userMap(db);
        return {
          count: (data || []).length,
          sales: (data || []).map((s: any) => ({
            sold_at: String(s.sold_at).slice(0, 10),
            amount_usd: Number(s.total_amount_usd ?? 0),
            amount_uzs: Number(s.total_amount_uzs ?? 0),
            sales_person: names.get(s.sales_person_id) ?? "—",
            refunded: !!s.is_refunded,
          })),
        };
      }

      case "search_leads": {
        let q = db
          .from("leads")
          .select("full_name, phone, status, assigned_to, created_at");
        if (input?.status) q = q.eq("status", input.status);
        if (input?.query) {
          q = q.or(`full_name.ilike.%${input.query}%,phone.ilike.%${input.query}%`);
        }
        const { data, error } = await q
          .order("created_at", { ascending: false })
          .limit(cap(input?.limit));
        if (error) return { error: error.message };
        const names = await userMap(db);
        return {
          count: (data || []).length,
          leads: (data || []).map((l: any) => ({
            name: l.full_name ?? "—",
            phone: l.phone ?? null,
            status: l.status,
            assigned: names.get(l.assigned_to) ?? "biriktirilmagan",
            created: String(l.created_at).slice(0, 10),
          })),
        };
      }

      case "search_expenses": {
        let q = db
          .from("expenses")
          .select("expense_date, amount_usd, description, paid_to");
        if (input?.month) {
          const b = monthBounds(input.month);
          if (!b) return { error: "month formati YYYY-MM bo'lishi kerak" };
          q = q.gte("expense_date", b.from.slice(0, 10)).lt("expense_date", b.to.slice(0, 10));
        }
        if (input?.query) {
          q = q.or(`description.ilike.%${input.query}%,paid_to.ilike.%${input.query}%`);
        }
        const { data, error } = await q
          .order("expense_date", { ascending: false })
          .limit(cap(input?.limit));
        if (error) return { error: error.message };
        return {
          count: (data || []).length,
          expenses: (data || []).map((e: any) => ({
            date: e.expense_date,
            amount_usd: Number(e.amount_usd ?? 0),
            description: e.description ?? null,
            paid_to: e.paid_to ?? null,
          })),
        };
      }

      case "search_payments": {
        const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
        let q = db
          .from("payments")
          .select("lead_id, amount_uzs, due_date, status")
          .not("lead_id", "is", null)
          .not("due_date", "is", null);
        if (input?.only_unpaid !== false) q = q.neq("status", "paid");
        if (input?.overdue_only) q = q.lt("due_date", today);
        const { data, error } = await q
          .order("due_date", { ascending: true })
          .limit(cap(input?.limit));
        if (error) return { error: error.message };
        const ids = Array.from(new Set((data || []).map((r: any) => r.lead_id)));
        let leadNames = new Map<string, string>();
        if (ids.length) {
          const { data: leads } = await db.from("leads").select("id, full_name").in("id", ids);
          leadNames = new Map((leads || []).map((l: any) => [l.id, l.full_name ?? "—"]));
        }
        return {
          count: (data || []).length,
          payments: (data || []).map((p: any) => ({
            debtor: leadNames.get(p.lead_id) ?? "—",
            amount_uzs: Number(p.amount_uzs ?? 0),
            due_date: p.due_date,
            status: p.status,
            overdue: p.due_date < today,
          })),
        };
      }

      case "get_team_workload": {
        const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const [{ data: users }, { data: open }, { data: done }] = await Promise.all([
          db.from("users").select("id, full_name").eq("is_active", true),
          db.from("tasks").select("assigned_to").neq("status", "done"),
          db.from("tasks").select("assigned_to").eq("status", "done").gte("completed_at", monthAgo),
        ]);
        const openCount = new Map<string, number>();
        for (const t of open || []) openCount.set(t.assigned_to, (openCount.get(t.assigned_to) ?? 0) + 1);
        const doneCount = new Map<string, number>();
        for (const t of done || []) doneCount.set(t.assigned_to, (doneCount.get(t.assigned_to) ?? 0) + 1);
        return {
          team: (users || []).map((u: any) => ({
            name: u.full_name,
            open_tasks: openCount.get(u.id) ?? 0,
            done_last_30d: doneCount.get(u.id) ?? 0,
          })),
        };
      }

      default:
        return { error: `Noma'lum tool: ${name}` };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Tool xatosi" };
  }
}
