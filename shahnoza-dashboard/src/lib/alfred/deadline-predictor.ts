import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeadlinePrediction {
  estimatedDays: number;
  minDays: number;
  maxDays: number;
  recommendedDate: string;
  confidence: number;
  reasoning: string[];
  risks: string[];
  riskMitigations: string[];
}

export async function predictDeadline(
  userId: string,
  taskHours: number,
  taskType: string,
  priority: string = "normal",
  client?: SupabaseClient
): Promise<DeadlinePrediction> {
  try {
    const now = new Date();
    const hoursPerDay = 8;
    const baseDays = Math.ceil(taskHours / hoursPerDay);

    // Apply priority multiplier
    let priorityMultiplier = 1;
    if (priority === "urgent") priorityMultiplier = 0.75;
    if (priority === "low") priorityMultiplier = 1.25;

    const estimatedDays = Math.max(1, Math.ceil(baseDays * priorityMultiplier));
    const recommendedDate = new Date(now);
    recommendedDate.setDate(recommendedDate.getDate() + estimatedDays);

    return {
      estimatedDays,
      minDays: Math.max(1, estimatedDays - 2),
      maxDays: estimatedDays + 3,
      recommendedDate: recommendedDate.toISOString().split("T")[0],
      confidence: 0.7,
      reasoning: [
        `Task estimated at ${taskHours} hours`,
        `${estimatedDays} business days for completion`,
        `Priority level: ${priority}`,
      ],
      risks: estimatedDays > 5 ? ["Long duration may introduce scope creep"] : [],
      riskMitigations:
        estimatedDays > 5
          ? ["Break into smaller milestones", "Weekly check-ins"]
          : [],
    };
  } catch (error) {
    console.error("Deadline prediction error:", error);
    const now = new Date();
    const defaultDate = new Date(now);
    defaultDate.setDate(defaultDate.getDate() + 3);

    return {
      estimatedDays: 3,
      minDays: 2,
      maxDays: 5,
      recommendedDate: defaultDate.toISOString().split("T")[0],
      confidence: 0.5,
      reasoning: ["Using default estimate"],
      risks: [],
      riskMitigations: [],
    };
  }
}

export async function checkDeadlineRealism(
  userId: string,
  proposedDays: number,
  taskType: string,
  client?: SupabaseClient
): Promise<{
  isRealistic: boolean;
  advice: string;
  confidence: number;
}> {
  return {
    isRealistic: proposedDays >= 2,
    advice: proposedDays < 2 ? "Consider extending deadline" : "Deadline is achievable",
    confidence: 0.7,
  };
}
