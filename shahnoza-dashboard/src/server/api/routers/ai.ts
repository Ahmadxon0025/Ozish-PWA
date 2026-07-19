import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { isAiConfigured } from "@/lib/env";
import { callStructured } from "@/lib/ai/claude";
import { TASK_PRIORITIES } from "@/lib/constants";

/** Tashkent (UTC+5, no DST) calendar date — anchors relative dates like "ertaga". */
function tashkentToday(): string {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

const PRIORITY_ENUM = [...TASK_PRIORITIES];

export const aiRouter = createTRPCRouter({
  /** Whether the AI features are turned on (ANTHROPIC_API_KEY present). */
  status: protectedProcedure.query(() => ({ configured: isAiConfigured() })),

  /**
   * (A) Parse an Uzbek sentence into a structured task and pre-fill the form.
   * Resolves the person's name to a user id; never auto-creates the task.
   */
  parseTask: protectedProcedure
    .input(z.object({ text: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      const { data: users } = await ctx.supabase
        .from("users")
        .select("id, full_name")
        .eq("is_active", true);
      const names = (users ?? []).map((u) => u.full_name).filter(Boolean);

      const parsed = await callStructured<{
        title: string;
        assignee_name: string;
        priority: string;
        due_date: string;
        labels: string[];
      }>({
        feature: "task_capture",
        userId: ctx.appUser.id,
        system:
          `Siz vazifa yaratish yordamchisisiz. Bugungi sana (Toshkent): ${tashkentToday()}. ` +
          `Foydalanuvchi o'zbek tilida bitta jumla yozadi. Undan vazifa ma'lumotlarini ajrating. ` +
          `"ertaga" = +1 kun, "indinga" = +2 kun, hafta kunlari (dushanba, juma...) eng yaqin kelasi shu kun. ` +
          `Mas'ul ismini quyidagi ro'yxatdan mos kelganini yozing (aynan): ${names.join(", ") || "(yo'q)"}. ` +
          `Mos kelmasa assignee_name bo'sh qoldiring. Muhimlik: shoshilinch=urgent, muhim=high, oddiy=medium, past=low. ` +
          `Sana YYYY-MM-DD yoki bo'sh. Sarlavha qisqa va aniq bo'lsin.`,
        user: input.text,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            assignee_name: { type: "string" },
            priority: { type: "string", enum: PRIORITY_ENUM },
            due_date: { type: "string", description: "YYYY-MM-DD or empty" },
            labels: { type: "array", items: { type: "string" } },
          },
          required: ["title", "assignee_name", "priority", "due_date", "labels"],
        },
      });

      // Resolve the parsed name to a user id (case-insensitive contains).
      let assignedTo: string | null = null;
      const wanted = parsed.assignee_name.trim().toLowerCase();
      if (wanted) {
        const match = (users ?? []).find((u) =>
          (u.full_name ?? "").toLowerCase().includes(wanted) ||
          wanted.includes((u.full_name ?? "").toLowerCase()),
        );
        assignedTo = match?.id ?? null;
      }
      const dueOk = /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date);
      const priority = PRIORITY_ENUM.includes(parsed.priority as (typeof PRIORITY_ENUM)[number])
        ? parsed.priority
        : "medium";

      return {
        title: parsed.title,
        assignedTo,
        assigneeName: parsed.assignee_name || null,
        priority,
        dueDate: dueOk ? parsed.due_date : null,
        labels: Array.isArray(parsed.labels) ? parsed.labels.slice(0, 6) : [],
      };
    }),

  /** (B) Suggest a checklist of subtasks for a task. */
  breakdownSubtasks: protectedProcedure
    .input(z.object({ title: z.string().min(2), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const parsed = await callStructured<{ subtasks: string[] }>({
        feature: "subtask_breakdown",
        userId: ctx.appUser.id,
        system:
          "Siz loyiha rejalashtiruvchisiz. Berilgan vazifani 3-7 ta aniq, bajariladigan " +
          "ichki vazifaga (subtask) bo'ling. Har biri qisqa o'zbekcha jumla. Faqat kerakli qadamlar.",
        user: `Vazifa: ${input.title}${input.description ? `\nTavsif: ${input.description}` : ""}`,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            subtasks: { type: "array", items: { type: "string" } },
          },
          required: ["subtasks"],
        },
      });
      return { subtasks: (parsed.subtasks ?? []).slice(0, 8).filter((s) => s.trim()) };
    }),

  /** (D) Suggest a sensible priority + due date on task creation. */
  suggestMeta: protectedProcedure
    .input(z.object({ title: z.string().min(2), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const parsed = await callStructured<{ priority: string; due_date: string }>({
        feature: "priority_suggest",
        userId: ctx.appUser.id,
        maxTokens: 256,
        system:
          `Bugungi sana (Toshkent): ${tashkentToday()}. Vazifa uchun mos muhimlik va real muddat taklif qiling. ` +
          `Muhimlik: urgent/high/medium/low. Sana YYYY-MM-DD (odatda 1-7 kun ichida).`,
        user: `Vazifa: ${input.title}${input.description ? `\nTavsif: ${input.description}` : ""}`,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            priority: { type: "string", enum: PRIORITY_ENUM },
            due_date: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["priority", "due_date"],
        },
      });
      const dueOk = /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date);
      return {
        priority: PRIORITY_ENUM.includes(parsed.priority as (typeof PRIORITY_ENUM)[number])
          ? parsed.priority
          : "medium",
        dueDate: dueOk ? parsed.due_date : null,
      };
    }),
});
