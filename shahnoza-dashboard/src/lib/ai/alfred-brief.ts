import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { buildBusinessSnapshot, renderBusinessSnapshot } from "@/lib/alfred/workspace-data";
import { callText } from "./claude";

/**
 * Alfred's morning brief: a short Uzbek narrative that synthesizes today's
 * numbers (cash, receivables, month P&L, overdue tasks) with Alfred's
 * long-term memories. Numbers are computed deterministically here and passed
 * to the model verbatim — the model only narrates and prioritizes.
 * Returns null when there's nothing to say or AI is unavailable.
 */
export async function buildAlfredBrief(): Promise<string | null> {
  const db = requireAdminClient();

  const snapshot = await buildBusinessSnapshot(db);

  // Overdue + today's tasks
  const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: openTasks } = await db
    .from("tasks")
    .select("title, due_date, assigned_to, status")
    .neq("status", "done")
    .not("due_date", "is", null)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(20);

  const { data: users } = await db.from("users").select("id, full_name");
  const nameById = new Map((users ?? []).map((u: any) => [u.id, u.full_name ?? "—"]));
  const assignees = (assigned: any): string => {
    const ids = Array.isArray(assigned) ? assigned : assigned ? [assigned] : [];
    const names = ids.map((id: string) => nameById.get(id)).filter(Boolean);
    return names.length > 0 ? names.join(", ") : "biriktirilmagan";
  };

  const taskLines = (openTasks ?? [])
    .map(
      (t: any) =>
        `- "${t.title}" (${t.due_date}${t.due_date < today ? " — KECHIKKAN" : " — bugun"}) → ${assignees(t.assigned_to)}`
    )
    .join("\n");

  // Alfred's long-term memories give the brief its judgment
  let memoryLines = "(xotira bo'sh)";
  try {
    const { data: memories } = await (db as any)
      .from("alfred_memories")
      .select("content, category")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(20);
    if (memories && memories.length > 0) {
      memoryLines = memories
        .map((m: any) => `- [${m.category}] ${m.content}`)
        .join("\n");
    }
  } catch {
    // memories table may not exist yet — brief still works
  }

  const data = `BUGUNGI SANA: ${today}

${renderBusinessSnapshot(snapshot)}

MUDDATI KELGAN/O'TGAN VAZIFALAR:
${taskLines || "(yo'q)"}

ALFRED XOTIRASI:
${memoryLines}`;

  try {
    const text = await callText({
      feature: "alfred_brief",
      system: `Sen Alfred — jamoaning aqlli yordamchisisan. Quyidagi ma'lumotlardan ertalabki qisqa brif yoz (o'zbek tilida).

QOIDALAR:
- Faqat yuqoridagi raqamlarni aynan keltir — hech qachon o'zing hisoblama yoki taxmin qilma.
- Eng muhim 3-5 ta narsani ustuvorlik tartibida ber: avval pul (to'lovlar, qarzlar), keyin kechikkan ishlar.
- Xotiradagi bilimlardan foydalanib maslahatni jamoaga moslashtir.
- Qisqa bo'lsin: maksimum 12 qator. Har band yangi qatordan, emoji bilan.
- Agar hammasi yaxshi bo'lsa, buni ayt va bitta ustuvor ishni taklif qil.`,
      user: data,
      maxTokens: 800,
    });
    return text.trim() || null;
  } catch (error) {
    console.error("Alfred brief failed:", error);
    return null;
  }
}
