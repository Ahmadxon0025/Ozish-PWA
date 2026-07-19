import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { callStructured } from "./claude";
import { TASK_PRIORITIES } from "@/lib/constants";

const PRIORITY_ENUM = [...TASK_PRIORITIES];

/** Tashkent (UTC+5, no DST) calendar date — anchors "ertaga", "indinga", etc. */
function tashkentToday(): string {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface CapturedTask {
  isTask: boolean;
  title: string;
  description: string | null;
  assigneeName: string | null;
  priority: string;
  dueDate: string | null;
}

/**
 * Parse a free-form Uzbek group message into a task (ClickUp-style capture).
 * Unlike the in-app parser this also returns `isTask=false` so ordinary chatter
 * (greetings, thanks, questions) is ignored instead of becoming a task.
 */
export async function parseTaskFromMessage(
  names: string[],
  text: string,
  userId: string | null,
): Promise<CapturedTask> {
  const parsed = await callStructured<{
    is_task: boolean;
    title: string;
    description: string;
    assignee_name: string;
    priority: string;
    due_date: string;
  }>({
    feature: "task_capture_telegram",
    userId,
    maxTokens: 400,
    system:
      `Siz vazifa yaratuvchi yordamchisiz. Bugungi sana (Toshkent): ${tashkentToday()}. ` +
      `Guruhga yozilgan xabarni tahlil qiling. Agar bu kimgadir topshiriq yoki bajariladigan vazifa bo'lsa ` +
      `is_task=true; agar oddiy suhbat, salom, rahmat, savol yoki e'lon bo'lsa is_task=false. ` +
      `"ertaga"=+1 kun, "indinga"=+2 kun, hafta kunlari (dushanba, juma...) eng yaqin kelasi shu kun. ` +
      `Mas'ul ismini quyidagi ro'yxatdan aynan mos kelganini yozing: ${names.join(", ") || "(yo'q)"}. ` +
      `Mos kelmasa assignee_name bo'sh qoldiring. Muhimlik: shoshilinch=urgent, muhim=high, oddiy=medium, past=low. ` +
      `Sarlavha qisqa buyruq shaklida bo'lsin (masalan "Video montaj qilish"). ` +
      `Qo'shimcha tafsilot bo'lsa description ga yozing, aks holda bo'sh. Sana YYYY-MM-DD yoki bo'sh.`,
    user: text,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        is_task: { type: "boolean" },
        title: { type: "string" },
        description: { type: "string" },
        assignee_name: { type: "string" },
        priority: { type: "string", enum: PRIORITY_ENUM },
        due_date: { type: "string", description: "YYYY-MM-DD or empty" },
      },
      required: [
        "is_task",
        "title",
        "description",
        "assignee_name",
        "priority",
        "due_date",
      ],
    },
  });

  const dueOk = /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date);
  const priority = PRIORITY_ENUM.includes(
    parsed.priority as (typeof PRIORITY_ENUM)[number],
  )
    ? parsed.priority
    : "medium";
  return {
    isTask: Boolean(parsed.is_task) && parsed.title.trim().length > 1,
    title: parsed.title.trim(),
    description: parsed.description?.trim() || null,
    assigneeName: parsed.assignee_name?.trim() || null,
    priority,
    dueDate: dueOk ? parsed.due_date : null,
  };
}

/** Case-insensitive name → user id (matches how the in-app parser resolves). */
export function resolveAssignee(
  users: { id: string; full_name: string | null }[],
  name: string | null,
): string | null {
  if (!name) return null;
  const wanted = name.toLowerCase().trim();
  if (!wanted) return null;
  const match = users.find(
    (u) =>
      (u.full_name ?? "").toLowerCase().includes(wanted) ||
      wanted.includes((u.full_name ?? "").toLowerCase()),
  );
  return match?.id ?? null;
}

/**
 * Insert a task captured from Telegram + its primary-assignee row (mirrors the
 * in-app `tasks.create` shape). Tagged with the "telegram" label so its origin
 * is visible in the app. Returns the new task id, or null on failure.
 */
export async function createCapturedTask(
  db: SupabaseClient<Database>,
  input: {
    title: string;
    description: string | null;
    assignedTo: string | null;
    createdBy: string | null;
    priority: string;
    dueDate: string | null;
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description,
      assigned_to: input.assignedTo,
      created_by: input.createdBy,
      priority: input.priority,
      status: "todo",
      due_date: input.dueDate,
      labels: ["telegram"],
    })
    .select("id")
    .single();
  if (error || !data) return null;

  if (input.assignedTo) {
    await db
      .from("task_assignees")
      .insert({ task_id: data.id, user_id: input.assignedTo, is_primary: true });
  }
  return data.id;
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "🔴 Shoshilinch",
  high: "🟠 Muhim",
  medium: "🟡 O'rtacha",
  low: "🔵 Past",
};

export function priorityLabel(p: string): string {
  return PRIORITY_LABEL[p] ?? p;
}
