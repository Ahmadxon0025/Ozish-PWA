import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, tasksChatId } from "@/lib/telegram/bot";
import { priorityLabel } from "@/lib/ai/task-capture";
import { sendPushToUser } from "@/lib/push/web-push";

interface NewTaskInfo {
  taskId: string;
  title: string;
  assignedTo: string | null;
  createdBy: string | null;
  priority: string;
  dueDate: string | null;
  /** Subtasks skip the group announcement (avoid spam) but still DM/push. */
  isSubtask: boolean;
}

/** Human-friendly Tashkent (UTC+5) date, with time only when it's set. */
function formatDueUz(due: string | null): string {
  if (!due) return "muddat yo'q";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(due);
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return due;
  const t = new Date(parsed.getTime() + 5 * 3600 * 1000);
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dateStr = `${dd}.${mm}.${t.getUTCFullYear()}`;
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const min = String(t.getUTCMinutes()).padStart(2, "0");
  if (dateOnly || (hh === "00" && min === "00")) return dateStr;
  return `${dateStr} ${hh}:${min}`;
}

/**
 * Fan out a "new task" event to Telegram (group announcement + a private DM to
 * the assignee) and a web-push notification to the assignee. Best-effort: every
 * channel is optional and failures never bubble up to the task creation.
 */
export async function notifyTaskCreated(info: NewTaskInfo): Promise<void> {
  try {
    const db = createAdminClient();
    let assigneeName: string | null = null;
    let assigneeTg: string | null = null;
    let creatorName: string | null = null;

    if (db) {
      const ids = Array.from(
        new Set([info.assignedTo, info.createdBy].filter(Boolean)),
      ) as string[];
      if (ids.length) {
        const { data } = await db
          .from("users")
          .select("id, full_name, telegram_id")
          .in("id", ids);
        const byId = new Map((data ?? []).map((u) => [u.id, u]));
        if (info.assignedTo) {
          const a = byId.get(info.assignedTo);
          assigneeName = a?.full_name ?? null;
          assigneeTg = a?.telegram_id ?? null;
        }
        if (info.createdBy) creatorName = byId.get(info.createdBy)?.full_name ?? null;
      }
    }

    const selfAssigned = !!info.assignedTo && info.assignedTo === info.createdBy;
    const due = formatDueUz(info.dueDate);

    // 1) Group announcement (top-level tasks only).
    if (!info.isSubtask) {
      const lines = [
        "🆕 *Yangi vazifa*",
        `📌 ${info.title}`,
        `👤 ${assigneeName ?? "Belgilanmagan"}`,
        `📅 ${due}`,
        `⚡️ ${priorityLabel(info.priority)}`,
      ];
      if (creatorName && !selfAssigned) lines.push(`✍️ ${creatorName} qo'shdi`);
      await sendMessage(tasksChatId(), lines.join("\n"));
    }

    // 2) Private Telegram DM to the assignee (not when self-assigned).
    if (assigneeTg && !selfAssigned) {
      const dm = [
        "📌 *Sizga yangi vazifa*",
        info.title,
        `📅 Muddat: ${due}`,
        `⚡️ ${priorityLabel(info.priority)}`,
        creatorName ? `✍️ ${creatorName}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await sendMessage(assigneeTg, dm);
    }

    // 3) Web push to the assignee's devices (not when self-assigned).
    if (info.assignedTo && !selfAssigned) {
      await sendPushToUser(info.assignedTo, {
        title: "Yangi vazifa",
        body: info.title,
        url: `/tasks/${info.taskId}`,
        tag: `task-${info.taskId}`,
      });
    }
  } catch (err) {
    console.error("notifyTaskCreated failed:", err);
  }
}
