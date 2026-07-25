import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { getSmartAssignment } from "@/lib/alfred/smart-assignment";
import { predictDeadline } from "@/lib/alfred/deadline-predictor";
import { buildKnowledgeBase, getPersonalizedInsights, getRiskWarnings } from "@/lib/alfred/knowledge-base";
import { getUserKnowledge } from "@/lib/alfred/learning-engine";
import { AlfredChatService, type WorkspaceContext, type ConversationMessage } from "@/lib/alfred/chat-service";
import { AlfredActionExecutor } from "@/lib/alfred/action-executor";

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
        // Build workspace context
        const context = await buildWorkspaceContextForChat(ctx.supabase);

        // Initialize chat service
        const chatService = new AlfredChatService();

        // Process message
        const response = await chatService.chat(
          input.message,
          context,
          input.conversationHistory || []
        );

        return {
          success: true,
          response: response.message,
          proposal: response.proposal,
          thinking: response.thinking,
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

  executeAction: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        actionId: z.string(),
        actionType: z.enum(["assign", "update", "create", "notify"]),
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

        // Check that conversation belongs to user
        const { data: conversation } = await ctx.supabase
          .from("alfred_conversations")
          .select("id")
          .eq("id", input.conversationId)
          .eq("user_id", user.user.id)
          .single();

        if (!conversation) {
          return {
            success: false,
            error: "Conversation not found",
          };
        }

        // Execute action
        const executor = new AlfredActionExecutor(ctx.supabase, user.user.id);
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

// Helper function to build workspace context for chat
async function buildWorkspaceContextForChat(
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
