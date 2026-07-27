import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { getSmartAssignment } from "@/lib/alfred/smart-assignment";
import { predictDeadline } from "@/lib/alfred/deadline-predictor";
import { buildKnowledgeBase, getPersonalizedInsights, getRiskWarnings } from "@/lib/alfred/knowledge-base";
import { getUserKnowledge } from "@/lib/alfred/learning-engine";
import { AlfredChatService, type WorkspaceContext, type ConversationMessage } from "@/lib/alfred/chat-service";
import { AlfredActionExecutor } from "@/lib/alfred/action-executor";
import { buildBusinessSnapshot } from "@/lib/alfred/workspace-data";
import { executeDataTool } from "@/lib/alfred/data-tools";
import { undoAlfredAction } from "@/lib/alfred/undo-action";
import { buildWorkspaceContextForChat } from "@/lib/alfred/workspace-context";

/** Dashboard route → human label + page-scoped suggestion (longest prefix wins). */
const PAGE_MAP: Array<{ prefix: string; label: string; suggestion: string }> = [
  { prefix: "/sales/list", label: "Sotuvlar ro'yxati", suggestion: "Sotuvlar ro'yxatini xulosalab ber" },
  { prefix: "/sales/team", label: "Sotuv jamoasi", suggestion: "Sotuvchilar samaradorligini solishtir" },
  { prefix: "/sales/goals", label: "Maqsadlar", suggestion: "Sotuv maqsadlariga yetyapmizmi?" },
  { prefix: "/sales/calls", label: "Qo'ng'iroq tahlili", suggestion: "Qo'ng'iroqlar sifati qanday?" },
  { prefix: "/sales", label: "Sotuv sharhi", suggestion: "Sotuv sharhini xulosalab ber" },
  { prefix: "/leads", label: "Leadlar", suggestion: "Leadlar holatini xulosalab ber" },
  { prefix: "/marketing", label: "Marketing tahlili", suggestion: "Lead manbalarini tahlil qil" },
  { prefix: "/finance/pnl", label: "P&L (Foyda)", suggestion: "Bu oy P&L ni tushuntirib ber" },
  { prefix: "/finance/cashflow", label: "Pul oqimi", suggestion: "Pul oqimini xulosalab ber" },
  { prefix: "/finance/accounts", label: "Hisoblar (Kassa)", suggestion: "Hisoblardagi pulni ko'rsat" },
  { prefix: "/finance", label: "Moliya", suggestion: "Moliyaviy holatni xulosalab ber" },
  { prefix: "/tasks", label: "Vazifalar", suggestion: "Vazifalar holatini xulosalab ber" },
  { prefix: "/dashboard", label: "Boshqaruv paneli", suggestion: "Bugungi holatni xulosalab ber" },
];

function pageInfo(path?: string | null) {
  if (!path || path === "/brain") return null;
  return PAGE_MAP.find((p) => path.startsWith(p.prefix)) ?? null;
}

/** Facts that change over time and must never be stored (same as migration 0036). */
const VOLATILE_MEMORY =
  /(\d+\s*(ta|bitim)\b)|overloaded|hozircha|bugungi|shu\s+(hafta|oy)da|balans|qoldiq|velocity|vazifa\/kun|kechikish\s+\d|\d+\s*so'?m/i;

export const alfredRouter = createTRPCRouter({
  getAnalysis: protectedProcedure.query(async ({ ctx }) => {
    try {
      const client = ctx.supabase;

      // Get all users for team status
      const { data: users } = await client
        .from("users")
        .select("id, full_name");

      if (!users) {
        return {
          userWorkloads: [],
          criticalTasks: [],
          timestamp: new Date().toISOString(),
        };
      }

      // Get tasks for team workload analysis
      const { data: tasks } = (await client
        .from("tasks")
        .select("id, title, assigned_to, status")) as any;

      const userWorkloads = users.map((user) => {
        const userTasks = tasks?.filter((t: any) => {
          if (typeof t.assigned_to === "string") return t.assigned_to === user.id;
          if (Array.isArray(t.assigned_to)) return t.assigned_to.includes(user.id);
          return false;
        }) || [];

        const incompleteTasks = userTasks.filter((t: any) => t.status !== "done");
        let workloadStatus: "light" | "normal" | "overloaded" = "normal";
        if (incompleteTasks.length > 10) workloadStatus = "overloaded";
        if (incompleteTasks.length < 3) workloadStatus = "light";

        return {
          userId: user.id,
          userName: user.full_name,
          totalTasks: userTasks.length,
          incompleteTasks: incompleteTasks.length,
          workloadStatus,
        };
      });

      // Get critical tasks (urgent or overdue)
      const { data: criticalTasks } = (await client
        .from("tasks")
        .select("id, title, assigned_to, due_date, priority")
        .or("priority.eq.urgent,due_date.lt.now()")) as any;

      const criticalTasksFormatted = (criticalTasks || []).slice(0, 5).map((t: any) => {
        const assigneeId = Array.isArray(t.assigned_to)
          ? t.assigned_to[0]
          : t.assigned_to;
        const assignee = users?.find((u) => u.id === assigneeId);
        return {
          taskId: t.id,
          taskTitle: t.title,
          assigneeName: assignee?.full_name || "Unknown",
          priority: t.priority,
        };
      });

      return {
        userWorkloads,
        criticalTasks: criticalTasksFormatted,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting analysis:", error);
      return {
        userWorkloads: [],
        criticalTasks: [],
        timestamp: new Date().toISOString(),
      };
    }
  }),

  getKnowledge: protectedProcedure.query(async ({ ctx }) => {
    try {
      const knowledge = await buildKnowledgeBase();
      return { knowledge, success: true };
    } catch (error) {
      console.error("Error building knowledge base:", error);
      return {
        knowledge: {
          userStrengths: new Map(),
          userWeaknesses: new Map(),
          userEstimationAccuracy: new Map(),
          strongPairs: [],
          teamWorkStyle: "Team collaboration data loading...",
          goodPractices: [],
          badPractices: [],
          riskFactors: [],
          learningConfidence: 0,
          lastUpdated: new Date().toISOString(),
        },
        success: false,
      };
    }
  }),

  smartAssign: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        estimate_hours: z.number().optional(),
        category: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const analysis = await getSmartAssignment({
          title: input.title,
          description: input.description || "",
          estimatedHours: input.estimate_hours || 8,
          category: input.category || "general",
        });

        return {
          success: true,
          analysis,
        };
      } catch (error) {
        console.error("Smart assign error:", error);
        return {
          success: false,
          analysis: {
            topRecommendation: null,
            recommendations: [],
            criticalRisks: ["Unable to generate recommendations"],
            teamDynamicsAdvice: "",
            deadlineAdvice: "",
            confidence: 0,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  getAnalysisForTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const { data: task } = await ctx.supabase
          .from("tasks")
          .select("*")
          .eq("id", input.taskId)
          .single();

        if (!task) {
          return { success: false, error: "Task not found" };
        }

        const analysis = await getSmartAssignment({
          title: task.title,
          description: task.description || "",
          estimatedHours: task.estimate_hours || 8,
          category: task.category || "general",
        });

        return {
          success: true,
          analysis,
        };
      } catch (error) {
        console.error("Error analyzing task:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  predictDeadlineForTask: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        taskHours: z.number(),
        taskType: z.string(),
        priority: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const prediction = await predictDeadline(
          input.userId,
          input.taskHours,
          input.taskType,
          input.priority || "normal",
          ctx.supabase
        );

        return {
          success: true,
          prediction,
        };
      } catch (error) {
        console.error("Deadline prediction error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  getMyInsights: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { data: user } = await ctx.supabase.auth.getUser();
      if (!user.user) {
        return {
          success: false,
          insights: [],
          error: "User not authenticated",
        };
      }

      const knowledge = await buildKnowledgeBase();
      const insights = await getPersonalizedInsights(user.user.id, knowledge);

      return {
        success: true,
        insights,
      };
    } catch (error) {
      console.error("Error getting insights:", error);
      return {
        success: false,
        insights: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }),

  getRiskWarningsForTask: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        projectType: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const knowledge = await buildKnowledgeBase();
        const warnings = await getRiskWarnings(input.userId, input.projectType, knowledge);

        return {
          success: true,
          warnings,
        };
      } catch (error) {
        console.error("Error getting risk warnings:", error);
        return {
          success: false,
          warnings: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  chat: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        conversationId: z.string().uuid().optional(),
        page: z.string().max(200).optional(),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Build workspace context (tasks + deterministic business snapshot,
        // both through the caller's client so RLS decides visibility)
        const context = await buildWorkspaceContextForChat(ctx.supabase);
        context.currentUserName = ctx.appUser?.full_name ?? undefined;
        context.currentPage = pageInfo(input.page)?.label ?? undefined;
        context.today = new Date(Date.now() + 5 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
        try {
          context.business = await buildBusinessSnapshot(ctx.supabase);
        } catch (error) {
          console.error("Business snapshot failed:", error);
        }

        // Load long-term memories (best-effort — chat works without them)
        const memories = await loadMemories(ctx.admin);
        context.memories = memories;

        // Initialize chat service
        const chatService = new AlfredChatService();

        // Process message — the tool executor runs on the caller's client,
        // so every live query Alfred makes is RLS-filtered to this user.
        const response = await chatService.chat(
          input.message,
          context,
          input.conversationHistory || [],
          (name, toolInput) => executeDataTool(ctx.supabase, name, toolInput)
        );

        // Persist the exchange. Memory extraction is a SEPARATE call
        // (extractMemory) the client fires after the answer renders, so it
        // never adds to this response's latency.
        let conversationId: string | null = input.conversationId ?? null;
        if (ctx.admin && ctx.appUser) {
          conversationId = await persistConversation(
            ctx.admin,
            ctx.appUser.id,
            conversationId,
            input.message,
            response.message
          );
        }

        // Tier A/B task actions run automatically — reversible, so no
        // approval click. Each execution is logged and returns an undo handle.
        const executed: Array<{
          logId: string | null;
          success: boolean;
          message: string;
        }> = [];
        if (response.proposal && ctx.appUser) {
          const executor = new AlfredActionExecutor(
            ctx.supabase,
            ctx.appUser.id
          );
          for (const action of response.proposal.actions) {
            const result = await executor.execute({
              conversationId,
              actionId: action.id,
              actionType: action.type,
              data: action.data ?? {},
            });
            executed.push({
              logId: result.logId ?? null,
              success: result.success,
              message: result.message || result.error || "Bajarildi",
            });
          }
        }

        return {
          success: true,
          response: response.message,
          proposal: response.proposal,
          thinking: response.thinking,
          followUps: response.followUps,
          conversationId,
          executed,
        };
      } catch (error) {
        console.error("Chat error - Full details:", {
          error: error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          apiKeySet: !!process.env.ANTHROPIC_API_KEY,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          response: "Sorry, I encountered an error processing your message.",
        };
      }
    }),

  /** Data-derived suggestion chips for the empty-chat hero. */
  getSuggestions: protectedProcedure
    .input(z.object({ page: z.string().max(200).optional() }).optional())
    .query(async ({ input, ctx }) => {
    const suggestions: string[] = [];
    const scoped = pageInfo(input?.page);
    if (scoped) suggestions.push(scoped.suggestion);
    try {
      const today = new Date(Date.now() + 5 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const db = ctx.supabase as any;
      const [overdueTasks, duePayments] = await Promise.all([
        db
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .neq("status", "done")
          .lt("due_date", today),
        db
          .from("payments")
          .select("id", { count: "exact", head: true })
          .neq("status", "paid")
          .not("due_date", "is", null)
          .lte("due_date", today),
      ]);

      const overdue = overdueTasks.count ?? 0;
      const due = duePayments.count ?? 0;
      if (overdue > 0)
        suggestions.push(`Qaysi vazifalar kechikmoqda? (${overdue} ta)`);
      if (due > 0)
        suggestions.push(`Kimlardan to'lov undirishimiz kerak? (${due} ta)`);
    } catch (error) {
      console.error("Suggestions failed:", error);
    }

    suggestions.push("Bu oy moliyaviy holat qanday?");
    if (suggestions.length < 3) suggestions.push("Jamoa yuklamasi qanday?");
    return {
      suggestions: suggestions.slice(0, 3),
      pageLabel: scoped?.label ?? null,
    };
  }),

  /**
   * Load a conversation: the latest active one by default (panel hydration),
   * or a specific one by id (reopening from history).
   */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid().optional() }).optional())
    .query(async ({ input, ctx }) => {
    if (!ctx.admin || !ctx.appUser) return { conversation: null };
    try {
      let query = (ctx.admin as any)
        .from("alfred_conversations")
        .select("id, messages")
        .eq("user_id", ctx.appUser.id);
      if (input?.conversationId) {
        query = query.eq("id", input.conversationId);
      } else {
        query = query.eq("active", true).order("updated_at", { ascending: false });
      }
      const { data } = await query.limit(1).maybeSingle();

      if (!data) return { conversation: null };
      return {
        conversation: {
          id: data.id as string,
          messages: ((data.messages as any[]) || []).slice(-60).map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: String(m.content ?? ""),
          })),
        },
      };
    } catch (error) {
      console.error("Error loading conversation:", error);
      return { conversation: null };
    }
  }),

  /** Past conversations for the history dropdown, newest first. */
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.admin || !ctx.appUser) return { conversations: [] };
    try {
      const { data } = await (ctx.admin as any)
        .from("alfred_conversations")
        .select("id, title, updated_at, active")
        .eq("user_id", ctx.appUser.id)
        .order("updated_at", { ascending: false })
        .limit(30);
      return {
        conversations: (data || []).map((c: any) => ({
          id: c.id as string,
          title: (c.title as string) || "Suhbat",
          updatedAt: c.updated_at as string,
          active: !!c.active,
        })),
      };
    } catch (error) {
      console.error("Error listing conversations:", error);
      return { conversations: [] };
    }
  }),

  /** Alfred's long-term memories, for the inspectable-memory view. */
  listMemories: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.admin) return { memories: [] };
    try {
      const { data } = await (ctx.admin as any)
        .from("alfred_memories")
        .select("id, content, category, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(100);
      return {
        memories: (data || []).map((m: any) => ({
          id: m.id as string,
          content: m.content as string,
          category: m.category as string,
          createdAt: m.created_at as string,
        })),
      };
    } catch (error) {
      console.error("Error listing memories:", error);
      return { memories: [] };
    }
  }),

  /**
   * Off-path memory extraction: the client calls this AFTER the answer is
   * shown, so it adds nothing to the chat response latency. Returns candidate
   * facts (already deduped against stored memory) for the consent card —
   * nothing is saved here.
   */
  extractMemory: protectedProcedure
    .input(
      z.object({
        userMessage: z.string(),
        assistantMessage: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.admin) return { candidates: [] };
      try {
        const memories = await loadMemories(ctx.admin);
        const known = new Set(
          memories.map((m) => m.content.trim().toLowerCase())
        );
        const chatService = new AlfredChatService();
        const candidates = (
          await chatService.extractMemories(
            input.userMessage,
            input.assistantMessage,
            memories.map((m) => m.content)
          )
        ).filter((m) => !known.has(m.content.trim().toLowerCase()));
        return { candidates };
      } catch (error) {
        console.error("Memory extraction failed:", error);
        return { candidates: [] };
      }
    }),

  /** Save memory candidates the user explicitly approved (consent-first). */
  saveMemories: protectedProcedure
    .input(
      z.object({
        memories: z
          .array(
            z.object({
              content: z.string().min(1).max(500),
              category: z.enum(["team", "person", "process", "preference", "general"]),
            })
          )
          .min(1)
          .max(3),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.admin || !ctx.appUser) return { saved: 0 };
      try {
        const { data: existing } = await (ctx.admin as any)
          .from("alfred_memories")
          .select("content")
          .eq("active", true)
          .limit(200);
        const seen = new Set(
          ((existing as any[]) || []).map((m) =>
            String(m.content).trim().toLowerCase()
          )
        );
        const fresh = input.memories.filter(
          (m) =>
            !seen.has(m.content.trim().toLowerCase()) &&
            !VOLATILE_MEMORY.test(m.content)
        );
        if (fresh.length === 0) return { saved: 0 };
        const { error } = await (ctx.admin as any).from("alfred_memories").insert(
          fresh.map((m) => ({
            content: m.content.trim(),
            category: m.category,
            source: "chat",
            created_by: ctx.appUser!.id,
          }))
        );
        if (error) {
          console.error("Memory save failed:", error.message);
          return { saved: 0 };
        }
        return { saved: fresh.length };
      } catch (error) {
        console.error("Memory save failed:", error);
        return { saved: 0 };
      }
    }),

  /** 👍/👎 on an answer — the quality signal. Logged to ai_usage_log. */
  rateAnswer: protectedProcedure
    .input(z.object({ helpful: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.admin || !ctx.appUser) return { success: true };
      try {
        await (ctx.admin as any).from("ai_usage_log").insert({
          user_id: ctx.appUser.id,
          feature: "alfred_feedback",
          model: "claude-sonnet-5",
          success: input.helpful,
        });
      } catch (error) {
        console.error("Feedback log failed:", error);
      }
      return { success: true };
    }),

  /** Forget a memory (soft delete — an agent that learned wrong must be correctable). */
  deleteMemory: protectedProcedure
    .input(z.object({ memoryId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.admin) return { success: false };
      try {
        await (ctx.admin as any)
          .from("alfred_memories")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", input.memoryId);
        return { success: true };
      } catch (error) {
        console.error("Error deleting memory:", error);
        return { success: false };
      }
    }),

  /** Archive the current conversation so the next message starts a fresh one. */
  newConversation: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.admin || !ctx.appUser) return { success: true };
    try {
      await (ctx.admin as any)
        .from("alfred_conversations")
        .update({ active: false })
        .eq("user_id", ctx.appUser.id)
        .eq("active", true);
    } catch (error) {
      console.error("Error archiving conversation:", error);
    }
    return { success: true };
  }),

  /**
   * Undo a previously executed Alfred action using the state captured at
   * execution time. Reversal runs under the caller's RLS client; the log row
   * is marked cancelled so an action can only be undone once.
   */
  undoAction: protectedProcedure
    .input(z.object({ actionLogId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.admin || !ctx.appUser) {
        return { success: false, error: "Server not configured" };
      }
      return undoAlfredAction({
        opsDb: ctx.supabase,
        logDb: ctx.admin,
        actionLogId: input.actionLogId,
        actorId: ctx.appUser.id,
      });
    }),

  executeAction: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        actionId: z.string(),
        actionType: z.enum([
          "assign",
          "update",
          "create",
          "notify",
          "expense",
          "expense_update",
          "expense_delete",
          "sale",
          "payment",
          "lead_update",
        ]),
        data: z.record(z.any()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { data: user } = await ctx.supabase.auth.getUser();
        if (!user.user) {
          return {
            success: false,
            error: "Not authenticated",
          };
        }

        // Check that conversation belongs to user (server-side, admin client)
        if (!ctx.admin || !ctx.appUser) {
          return { success: false, error: "Server not configured" };
        }
        const { data: conversation } = await (ctx.admin as any)
          .from("alfred_conversations")
          .select("id")
          .eq("id", input.conversationId)
          .eq("user_id", ctx.appUser.id)
          .single();

        if (!conversation) {
          return {
            success: false,
            error: "Conversation not found",
          };
        }

        // Execute action. Actor must be the app-level user id (public.users.id)
        // — the action-log RLS policy maps auth.uid() through users.auth_id.
        const executor = new AlfredActionExecutor(ctx.supabase, ctx.appUser.id);
        const result = await executor.execute(input);

        return result;
      } catch (error) {
        console.error("Action execution error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
});

/** Load active long-term memories, newest first. Returns [] on any failure. */
async function loadMemories(
  admin: any
): Promise<Array<{ content: string; category: string }>> {
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("alfred_memories")
      .select("content, category")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) {
      console.error("Memory load failed:", error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error("Memory load failed:", error);
    return [];
  }
}

/**
 * Append one user/assistant exchange to the active conversation, creating it
 * if needed. Returns the conversation id (or null if persistence failed).
 */
async function persistConversation(
  admin: any,
  userId: string,
  conversationId: string | null,
  userMessage: string,
  assistantMessage: string
): Promise<string | null> {
  try {
    const now = new Date().toISOString();
    const newMessages = [
      { role: "user", content: userMessage, ts: now },
      { role: "assistant", content: assistantMessage, ts: now },
    ];

    if (conversationId) {
      const { data: conv } = await admin
        .from("alfred_conversations")
        .select("id, messages")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (conv) {
        const messages = [...((conv.messages as any[]) || []), ...newMessages].slice(-100);
        await admin
          .from("alfred_conversations")
          .update({ messages, updated_at: now })
          .eq("id", conversationId);
        return conversationId;
      }
    }

    // Semantic title (haiku, best-effort). Falls back to a trimmed first
    // message; strictly validates the model output so conversational replies
    // ("Men sizning suhbatingizdan...") never leak in as titles.
    const fallbackTitle = userMessage.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80);
    let title = fallbackTitle || "Suhbat";
    try {
      const { callText } = await import("@/lib/ai/claude");
      const generated = await callText({
        feature: "alfred_title",
        system:
          "Berilgan xabar uchun 2-5 so'zlik MAVZU sarlavhasi yoz (masalan 'Kechikkan vazifalar', 'Iyul P&L'). Xabar tilida. FAQAT sarlavha — gap emas, izoh emas, qo'shtirnoqsiz, o'zing haqingda yozma.",
        user: userMessage.slice(0, 300),
        maxTokens: 24,
      });
      const clean = generated
        .trim()
        .split("\n")[0]
        .replace(/^["'«»\s]+|["'«».\s]+$/g, "")
        .slice(0, 60);
      const wordCount = clean.split(/\s+/).length;
      const looksLikeSentence =
        /^(men|sen|siz|bu suhbat|mana|quyida|assalom|salom)\b/i.test(clean) ||
        /\b(xabar|sarlavha|suhbat)\b/i.test(clean) ||
        wordCount > 8 ||
        clean.length < 2;
      if (clean && !looksLikeSentence) title = clean;
    } catch {
      // title generation is cosmetic — never block the chat
    }

    const { data: created, error } = await admin
      .from("alfred_conversations")
      .insert({
        user_id: userId,
        title,
        messages: newMessages,
        active: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Conversation create failed:", error.message);
      return null;
    }
    return created?.id ?? null;
  } catch (error) {
    console.error("Conversation persist failed:", error);
    return conversationId;
  }
}

// Helper function to build workspace context for chat
