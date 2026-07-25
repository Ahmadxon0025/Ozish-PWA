import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  runAlfredAnalysis,
  updateTaskDeadline,
  reassignTask,
} from "@/lib/alfred/orchestrator";
import {
  buildKnowledgeBase,
  getPersonalizedInsights,
  getRiskWarnings,
} from "@/lib/alfred/knowledge-base";

export const alfredRouter = createTRPCRouter({
  /**
   * Trigger Alfred's on-demand analysis
   * Analyzes all tasks, workloads, deadlines, and sends suggestions to Telegram
   */
  analyze: protectedProcedure.query(async () => {
    try {
      const analysis = await runAlfredAnalysis();
      return {
        success: true,
        analysis,
        suggestionsCount: analysis?.rescheduleSuggestions.length || 0,
        alertsCount: analysis?.workloadAlerts.length || 0,
      };
    } catch (error) {
      console.error("Alfred analysis failed:", error);
      return {
        success: false,
        error: "Analysis failed",
      };
    }
  }),

  /**
   * Implement Alfred's suggestion: update task deadline
   */
  updateDeadline: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        newDeadline: z.string(), // YYYY-MM-DD
      })
    )
    .mutation(async ({ input }) => {
      try {
        const success = await updateTaskDeadline(
          input.taskId,
          input.newDeadline
        );
        return { success };
      } catch (error) {
        console.error("Failed to update deadline:", error);
        return { success: false };
      }
    }),

  /**
   * Implement Alfred's suggestion: reassign task
   */
  reassignTask: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        newAssigneeId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const success = await reassignTask(input.taskId, input.newAssigneeId);
        return { success };
      } catch (error) {
        console.error("Failed to reassign task:", error);
        return { success: false };
      }
    }),

  /**
   * Get Alfred's current analysis (cached)
   */
  getAnalysis: protectedProcedure.query(async () => {
    try {
      const analysis = await runAlfredAnalysis();
      return analysis;
    } catch (error) {
      console.error("Failed to get analysis:", error);
      return null;
    }
  }),

  /**
   * Build and return Alfred's knowledge base
   * Contains all learned insights about team, project, patterns
   */
  getKnowledge: protectedProcedure.query(async () => {
    try {
      const knowledge = await buildKnowledgeBase();
      return {
        success: true,
        knowledge,
        learningConfidence: knowledge.learningConfidence,
      };
    } catch (error) {
      console.error("Failed to build knowledge base:", error);
      return { success: false, knowledge: null };
    }
  }),

  /**
   * Get personalized insights for the current user
   */
  getMyInsights: protectedProcedure.query(async ({ ctx }) => {
    try {
      const knowledge = await buildKnowledgeBase();
      const insights = await getPersonalizedInsights(ctx.appUser.id, knowledge);
      return { success: true, insights };
    } catch (error) {
      console.error("Failed to get insights:", error);
      return { success: false, insights: [] };
    }
  }),

  /**
   * Get risk warnings for a proposed task assignment
   */
  getRiskWarnings: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        projectType: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const knowledge = await buildKnowledgeBase();
        const warnings = await getRiskWarnings(input.userId, input.projectType, knowledge);
        return { success: true, warnings };
      } catch (error) {
        console.error("Failed to get risk warnings:", error);
        return { success: false, warnings: [] };
      }
    }),
});
