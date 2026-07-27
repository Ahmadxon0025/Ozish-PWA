import "server-only";
import type { WorkspaceContext } from "@/lib/alfred/chat-service";

/**
 * Workspace snapshot (team + tasks + metrics) for Alfred's system prompt.
 * Pass the caller's RLS client in the web app or the admin client for
 * server-initiated contexts (Telegram bridge).
 */
export async function buildWorkspaceContextForChat(
  supabase: any
): Promise<WorkspaceContext> {
  try {
    // Get all users
    const { data: users } = (await supabase
      .from("users")
      .select("id, full_name")) as any;

    // Get all tasks with enough detail for Alfred to answer real questions
    const { data: tasks } = (await supabase
      .from("tasks")
      .select("id, title, assigned_to, status, due_date, priority, created_at")
      .order("created_at", { ascending: false })) as any;

    if (!users || !tasks) {
      return {
        tasks: {
          total: 0,
          byStatus: {},
          unassigned: 0,
          overdue: 0,
        },
        taskList: [],
        users: [],
        metrics: {
          teamVelocity: 0,
          completionRate: 0,
          averageDelay: 0,
        },
      };
    }

    const nameById = new Map<string, string>(
      users.map((u: any) => [u.id, u.full_name])
    );
    const now = new Date();

    const assigneeNames = (assigned: any): string => {
      const ids = Array.isArray(assigned) ? assigned : assigned ? [assigned] : [];
      const names = ids
        .map((id: string) => nameById.get(id))
        .filter(Boolean);
      return names.length > 0 ? names.join(", ") : "Unassigned";
    };

    // Count tasks by status
    const byStatus: Record<string, number> = {};
    let unassignedCount = 0;
    let overdueCount = 0;

    tasks.forEach((task: any) => {
      // Count by status
      if (task.status) {
        byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      }

      // Count unassigned
      if (!task.assigned_to) {
        unassignedCount++;
      }

      // Count overdue (incomplete tasks past their due date)
      if (
        task.status !== "done" &&
        task.due_date &&
        new Date(task.due_date) < now
      ) {
        overdueCount++;
      }
    });

    // Detailed list of open tasks (bounded to keep the prompt small)
    const taskList = tasks
      .filter((t: any) => t.status !== "done")
      .slice(0, 60)
      .map((t: any) => ({
        id: t.id,
        title: t.title ?? "Untitled",
        status: t.status ?? "unknown",
        assignees: assigneeNames(t.assigned_to),
        dueDate: t.due_date ? String(t.due_date).slice(0, 10) : null,
        priority: t.priority ?? null,
        isOverdue:
          t.status !== "done" && t.due_date
            ? new Date(t.due_date) < now
            : false,
      }));

    // Count per user
    const userTaskMap = new Map<string, number>();
    tasks.forEach((task: any) => {
      if (task.assigned_to) {
        const assignee = Array.isArray(task.assigned_to)
          ? task.assigned_to[0]
          : task.assigned_to;
        userTaskMap.set(assignee, (userTaskMap.get(assignee) || 0) + 1);
      }
    });

    // Build user list
    const userList = users.map((user: any) => ({
      id: user.id,
      name: user.full_name,
      taskCount: userTaskMap.get(user.id) || 0,
      isOverloaded: (userTaskMap.get(user.id) || 0) > 10,
    }));

    // Calculate metrics
    const completedCount = byStatus["done"] || 0;
    const completionRate =
      tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    return {
      tasks: {
        total: tasks.length,
        byStatus,
        unassigned: unassignedCount,
        overdue: overdueCount,
      },
      taskList,
      users: userList,
      metrics: {
        teamVelocity: tasks.length > 0 ? (tasks.length / 30).toFixed(1) as any : 0,
        completionRate,
        averageDelay: 3, // placeholder
      },
    };
  } catch (error) {
    console.error("Error building workspace context:", error);
    return {
      tasks: {
        total: 0,
        byStatus: {},
        unassigned: 0,
        overdue: 0,
      },
      taskList: [],
      users: [],
      metrics: {
        teamVelocity: 0,
        completionRate: 0,
        averageDelay: 0,
      },
    };
  }
}
