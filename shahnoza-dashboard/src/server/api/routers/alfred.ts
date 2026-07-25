import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { getSmartAssignment } from "@/lib/alfred/smart-assignment";
import { predictDeadline } from "@/lib/alfred/deadline-predictor";
import { buildKnowledgeBase, getPersonalizedInsights, getRiskWarnings } from "@/lib/alfred/knowledge-base";
import { getUserKnowledge } from "@/lib/alfred/learning-engine";

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
});
