import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
  assignedName?: string | null;
  assignees?: Array<{ userId: string; name: string; isPrimary: boolean }>;
  subtaskTotal?: number;
  subtaskDone?: number;
};

interface PersonTasks {
  userId: string;
  name: string;
  overdue: Task[];
  today: Task[];
  thisWeek: Task[];
  completed: Task[];
}

/** Fetch all tasks grouped by person. */
export async function getTeamTasks(): Promise<PersonTasks[]> {
  const supabase = createServerSupabase();

  // Get all active users (not just current user)
  const { data: users } = (await supabase
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name")) as { data: Array<{ id: string; full_name: string | null }> | null };

  if (!users || users.length === 0) return [];

  // Fetch all tasks for the whole team
  const { data: tasks } = (await supabase
    .from("tasks")
    .select(
      `id, title, due_date, status, priority, assigned_to,
       task_assignees(user_id, users(full_name)),
       subtasks(id, status)`
    )
    .neq("status", "done")
    .order("due_date", { ascending: true })) as { data: any[] | null };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Group tasks by assigned user
  const tasksByPerson: Record<string, PersonTasks> = {};

  users.forEach((user) => {
    tasksByPerson[user.id] = {
      userId: user.id,
      name: user.full_name || "Unknown",
      overdue: [],
      today: [],
      thisWeek: [],
      completed: [],
    };
  });

  // Distribute tasks
  tasks?.forEach((task) => {
    if (!task.assigned_to || !tasksByPerson[task.assigned_to]) return;

    const due = task.due_date?.slice(0, 10);
    const taskObj = task as Task;

    if (!due || due >= today) {
      if (due === today) {
        tasksByPerson[task.assigned_to].today.push(taskObj);
      } else if (due && due <= endOfWeek) {
        tasksByPerson[task.assigned_to].thisWeek.push(taskObj);
      }
    } else {
      // Overdue
      tasksByPerson[task.assigned_to].overdue.push(taskObj);
    }
  });

  return Object.values(tasksByPerson).filter(
    (p) => p.overdue.length + p.today.length + p.thisWeek.length > 0
  );
}

/** Format team tasks for Telegram message. */
export function formatTeamTasksMessage(people: PersonTasks[]): string {
  if (people.length === 0) {
    return "📋 Hech qanday ochiq vazifa yo'q!";
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `📋 BUGUNGI OPERATSION HISOBOTI\n`;
  msg += `🕐 ${dateStr} | ${timeStr}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalOverdue = 0;
  let totalToday = 0;
  let totalThisWeek = 0;

  people.forEach((person) => {
    const hasOverdue = person.overdue.length > 0;
    const hasToday = person.today.length > 0;
    const hasWeek = person.thisWeek.length > 0;

    if (!hasOverdue && !hasToday && !hasWeek) return;

    msg += `👤 ${person.name.toUpperCase()}\n`;

    if (hasOverdue) {
      totalOverdue += person.overdue.length;
      msg += `  🔴 MUDDATI O'TGAN (${person.overdue.length})\n`;
      person.overdue.slice(0, 3).forEach((task) => {
        const dueDate = task.due_date?.slice(0, 10) || "?";
        msg += `    • ${task.title}\n`;
        msg += `      ⏰ ${dueDate}\n`;
      });
      if (person.overdue.length > 3) {
        msg += `    ... va ${person.overdue.length - 3} ta ko'proq\n`;
      }
    }

    if (hasToday) {
      totalToday += person.today.length;
      msg += `  🟠 BUGUN (${person.today.length})\n`;
      person.today.slice(0, 3).forEach((task) => {
        const time = task.due_date?.slice(11, 16) || "—";
        msg += `    • ${task.title}\n`;
        if (time !== "—") msg += `      🕐 ${time}\n`;
      });
      if (person.today.length > 3) {
        msg += `    ... va ${person.today.length - 3} ta ko'proq\n`;
      }
    }

    if (hasWeek) {
      totalThisWeek += person.thisWeek.length;
      msg += `  🟡 HAFTA (${person.thisWeek.length})\n`;
      person.thisWeek.slice(0, 2).forEach((task) => {
        const date = task.due_date?.slice(0, 10) || "?";
        msg += `    • ${task.title} (${date})\n`;
      });
      if (person.thisWeek.length > 2) {
        msg += `    ... va ${person.thisWeek.length - 2} ta ko'proq\n`;
      }
    }

    msg += "\n";
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 UMUMIY STATISTIKA:\n`;
  msg += `  👥 ${people.length} kishi\n`;
  msg += `  🔴 ${totalOverdue} muddati o'tgan\n`;
  msg += `  🟠 ${totalToday} bugun\n`;
  msg += `  🟡 ${totalThisWeek} hafta\n`;

  if (totalOverdue > 0) {
    msg += `\n⚠️ DIQQAT: ${totalOverdue} ta muddati o'tgan vazifa bor!\n`;
  }

  msg += `\n🤖 Operatsion Bot | Ishlar erkin ko'chishi uchun`;

  return msg;
}

/** Format personalized message for one user. */
export function formatPersonalTasksMessage(person: PersonTasks): string {
  let msg = `Hey ${person.name}! 👋\n\n`;

  if (person.overdue.length === 0 && person.today.length === 0) {
    msg += `Bugun uchun vazifa yo'q! ✅`;
    return msg;
  }

  if (person.overdue.length > 0) {
    msg += `🔴 MUDDATI O'TGAN (URKIN!):\n`;
    person.overdue.forEach((task) => {
      const dueDate = task.due_date?.slice(0, 10) || "?";
      msg += `  ❌ ${task.title} (${dueDate} edi)\n`;
    });
    msg += `\n`;
  }

  if (person.today.length > 0) {
    msg += `🟠 BUGUN BAJARISH KERAK:\n`;
    person.today.forEach((task, i) => {
      const time = task.due_date?.slice(11, 16) || "—";
      msg += `  ${i + 1}. ${task.title}`;
      if (time !== "—") msg += ` (${time})`;
      msg += `\n`;
    });
    msg += `\n`;
  }

  if (person.thisWeek.length > 0) {
    msg += `🟡 HAFTA (${person.thisWeek.length}):\n`;
  }

  msg += `💪 Bugunning oxiriga ${person.today.length} ta ishni tugallaysiz degan umid qilaman!\n`;

  return msg;
}
