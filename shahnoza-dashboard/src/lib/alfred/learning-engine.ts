import { requireAdminClient } from "@/lib/supabase/admin";

/**
 * Alfred's Learning Engine
 * Continuously learns from project history, team patterns, and outcomes
 */

interface TaskCompletionData {
  taskId: string;
  assigneeId: string;
  estimatedDays: number;
  actualDays: number;
  daysLate: number;
  wasReworked: boolean;
  qualityScore: number; // 1-5
  collaborators: string[];
  projectType: string; // design, dev, research, etc
  lesson?: string;
}

interface TeamPattern {
  userId: string;
  patternType: string; // 'productivity_time', 'task_type_strength', etc
  patternData: any;
  confidenceScore: number;
}

/**
 * Record task completion and learn from it
 */
export async function learnFromTaskCompletion(data: TaskCompletionData) {
  try {
    const client = requireAdminClient();

    // 1. Store task analytics
    await client.from("alfred_task_analytics").insert({
      task_id: data.taskId,
      assigned_to: data.assigneeId,
      estimated_days: data.estimatedDays,
      actual_days: data.actualDays,
      days_late: data.daysLate,
      was_reworked: data.wasReworked,
      quality_score: data.qualityScore,
      collaboration_score: Math.max(1, 5 - Math.abs(data.daysLate)),
      project_type: data.projectType,
      team_size: data.collaborators.length + 1,
      learned_lesson: data.lesson,
      completed_at: new Date().toISOString(),
    });

    // 2. Update team patterns
    await updateTeamPatterns(data);

    // 3. Extract and store lessons
    if (data.lesson) {
      await storeLessonLearned(data);
    }

    // 4. Update collaboration pairs
    await updateCollaborationMetrics(data);

    // 5. Detect risks
    await detectRisks(data);
  } catch (error) {
    console.error("❌ Learning from task failed:", error);
  }
}

/**
 * Analyze and update patterns for a user based on their task
 */
async function updateTeamPatterns(data: TaskCompletionData) {
  const client = requireAdminClient();

  // Calculate accuracy of estimation
  const estimationAccuracy = Math.max(
    0,
    1 - Math.abs(data.actualDays - data.estimatedDays) / Math.max(1, data.estimatedDays)
  );

  // Store/update estimation pattern
  await client.from("alfred_team_patterns").upsert({
    user_id: data.assigneeId,
    pattern_type: "estimation_accuracy",
    pattern_data: {
      estimated: data.estimatedDays,
      actual: data.actualDays,
      accuracy: estimationAccuracy,
    },
    confidence_score: Math.min(1, estimationAccuracy),
  });

  // Task type strength pattern
  if (data.qualityScore >= 4) {
    await client.from("alfred_team_patterns").insert({
      user_id: data.assigneeId,
      pattern_type: "task_type_strength",
      pattern_data: {
        taskType: data.projectType,
        qualityScore: data.qualityScore,
        averageTime: data.actualDays,
      },
      confidence_score: 0.8,
    });
  }

  // Workload capacity pattern
  await client.from("alfred_team_patterns").insert({
    user_id: data.assigneeId,
    pattern_type: "workload_capacity",
    pattern_data: {
      tasksTaken: 1,
      averageCompletionDays: data.actualDays,
      latenessRate: data.daysLate > 0 ? 1 : 0,
    },
    confidence_score: 0.7,
  });
}

/**
 * Store lessons learned from successes and failures
 */
async function storeLessonLearned(data: TaskCompletionData) {
  const client = requireAdminClient();

  const isSuccess = data.qualityScore >= 4 && data.daysLate <= 0;
  const lessonType = isSuccess ? "good_practice" : "bad_practice";

  await client.from("alfred_project_knowledge").insert({
    lesson_type: lessonType,
    description: data.lesson,
    context: {
      projectType: data.projectType,
      teamSize: data.collaborators.length + 1,
      qualityScore: data.qualityScore,
      daysLate: data.daysLate,
    },
    impact_score: Math.min(
      10,
      Math.max(1, Math.abs(data.daysLate) + (10 - data.qualityScore))
    ),
    tags: [data.projectType, isSuccess ? "success" : "failure"],
  });
}

/**
 * Track who works well together
 */
async function updateCollaborationMetrics(data: TaskCompletionData) {
  const client = requireAdminClient();

  for (const collaboratorId of data.collaborators) {
    const successRate = data.qualityScore >= 4 && data.daysLate <= 0 ? 1 : 0;

    // Check if pair exists
    const { data: existing } = await client
      .from("alfred_collaboration_pairs")
      .select("*")
      .or(
        `and(user_a_id.eq.${data.assigneeId},user_b_id.eq.${collaboratorId}),and(user_a_id.eq.${collaboratorId},user_b_id.eq.${data.assigneeId})`
      )
      .maybeSingle();

    if (existing) {
      // Update existing pair
      const newScore =
        (existing.collaboration_score * existing.joint_project_count +
          successRate) /
        (existing.joint_project_count + 1);

      await client
        .from("alfred_collaboration_pairs")
        .update({
          collaboration_score: newScore,
          joint_project_count: existing.joint_project_count + 1,
          success_rate: newScore,
        })
        .eq("id", existing.id);
    } else {
      // Create new pair
      const [userA, userB] = [data.assigneeId, collaboratorId].sort();
      await client.from("alfred_collaboration_pairs").insert({
        user_a_id: userA,
        user_b_id: userB,
        collaboration_score: successRate,
        joint_project_count: 1,
        success_rate: successRate,
      });
    }
  }
}

/**
 * Detect and track risk factors
 */
async function detectRisks(data: TaskCompletionData) {
  const client = requireAdminClient();

  if (data.daysLate > 5) {
    await client.from("alfred_risk_factors").insert({
      risk_name: `High lateness on ${data.projectType} tasks`,
      severity: data.daysLate > 10 ? "critical" : "high",
      description: `${data.projectType} tasks by this user often run ${data.daysLate}+ days late`,
      detected_in: [data.projectType],
      mitigation: "Add buffer time or redistribute to stronger resource",
      occurrence_count: 1,
    });
  }

  if (data.wasReworked && data.qualityScore < 3) {
    await client.from("alfred_risk_factors").insert({
      risk_name: "Quality & Rework Pattern",
      severity: "high",
      description: `Repeated rework on ${data.projectType} tasks indicates process or skill gap`,
      detected_in: [data.projectType],
      mitigation: "Pair with mentor or add QA checkpoint",
      occurrence_count: 1,
    });
  }
}

/**
 * Get learned knowledge about a user
 */
export async function getUserKnowledge(userId: string) {
  const client = requireAdminClient();

  const [patterns, risks, collaborations] = await Promise.all([
    client
      .from("alfred_team_patterns")
      .select("*")
      .eq("user_id", userId),
    client
      .from("alfred_risk_factors")
      .select("*")
      .order("severity"),
    client
      .from("alfred_collaboration_pairs")
      .select("*")
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order("collaboration_score", { ascending: false }),
  ]);

  return {
    patterns: patterns.data || [],
    risks: risks.data || [],
    strongCollaborators: collaborations.data
      ?.filter(c => c.collaboration_score > 0.7)
      .slice(0, 5) || [],
  };
}

/**
 * Get project lessons
 */
export async function getProjectLessons(projectType?: string) {
  const client = requireAdminClient();

  let query = client
    .from("alfred_project_knowledge")
    .select("*")
    .order("impact_score", { ascending: false });

  if (projectType) {
    query = query.contains("tags", [projectType]);
  }

  const { data } = await query;
  return data || [];
}

/**
 * Get team collaboration insights
 */
export async function getCollaborationInsights() {
  const client = requireAdminClient();

  const { data } = await client
    .from("alfred_collaboration_pairs")
    .select("*")
    .order("collaboration_score", { ascending: false })
    .limit(20);

  return data || [];
}
