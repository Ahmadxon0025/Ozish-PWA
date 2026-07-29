import { type NextRequest } from "next/server";
import { isServiceRoleConfigured } from "@/lib/env";
import { verifyFeedToken, buildIcs, type IcsTask } from "@/lib/calendar/ics";

export const dynamic = "force-dynamic";

/**
 * Per-user iCalendar feed: /api/calendar/tasks.ics?u=<userId>&t=<token>
 * Subscribed to by Google/Apple/Outlook calendars. Token-authed (no cookies),
 * so it exposes only the requested user's tasks. Read-only.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!userId || !token || !verifyFeedToken(userId, token)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isServiceRoleConfigured()) {
    return new Response("Not configured", { status: 503 });
  }

  const { requireAdminClient } = await import("@/lib/supabase/admin");
  const db = requireAdminClient();

  // Tasks the user owns (assigned_to) or collaborates on (task_assignees).
  const { data: collabRows } = await db
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", userId);
  const collabIds = (collabRows ?? []).map((r) => r.task_id).filter(Boolean) as string[];

  const orClause = collabIds.length
    ? `assigned_to.eq.${userId},id.in.(${collabIds.join(",")})`
    : `assigned_to.eq.${userId}`;

  const { data: tasks } = await db
    .from("tasks")
    .select("id, title, status, priority, start_date, due_date, assigned_to")
    .neq("status", "cancelled")
    .or(orClause)
    .not("due_date", "is", null);

  // Resolve the primary assignee's display name for each task.
  const rows = tasks ?? [];
  const assigneeIds = Array.from(
    new Set(rows.map((t) => t.assigned_to).filter(Boolean) as string[]),
  );
  const { data: users } = assigneeIds.length
    ? await db.from("users").select("id, full_name").in("id", assigneeIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));

  const icsTasks: IcsTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    start_date: t.start_date,
    due_date: t.due_date,
    assignedName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null,
  }));

  const body = buildIcs(icsTasks, new Date());

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ozish-vazifalar.ics"',
      // Let calendar clients cache briefly; they poll on their own schedule.
      "Cache-Control": "public, max-age=1800",
    },
  });
}
