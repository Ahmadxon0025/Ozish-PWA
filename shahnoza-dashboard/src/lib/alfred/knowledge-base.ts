import { requireAdminClient } from "@/lib/supabase/admin";
import {
  getUserKnowledge,
  getProjectLessons,
  getCollaborationInsights,
} from "./learning-engine";

/**
 * Alfred's Knowledge Base
 * Synthesizes all learned data into actionable insights
 */

export interface AlfredKnowledge {
  // Per-user insights
  userStrengths: Map<string, string[]>;
  userWeaknesses: Map<string, string[]>;
  userEstimationAccuracy: Map<string, number>;

  // Team insights
  strongPairs: Array<{ user1: string; user2: string; score: number }>;
  teamWorkStyle: string; // how the team collaborates

  // Project insights
  goodPractices: string[];
  badPractices: string[];
  riskFactors: string[];

  // Meta
  learningConfidence: number; // 0-1, how confident in this knowledge
  lastUpdated: string;
}

/**
 * Build comprehensive knowledge base from learned data
 */
export async function buildKnowledgeBase(): Promise<AlfredKnowledge> {
  const client = requireAdminClient();

  // Get all users for analysis
  const { data: users } = await client.from("users").select("id, full_name");
  if (!users) throw new Error("No users found");

  const userStrengths = new Map<string, string[]>();
  const userWeaknesses = new Map<string, string[]>();
  const userEstimationAccuracy = new Map<string, number>();

  // Analyze each user
  for (const user of users) {
    const knowledge = await getUserKnowledge(user.id);
    const patterns = knowledge.patterns;
    const risks = knowledge.risks;

    // Extract strengths from patterns
    const strengths = patterns
      .filter(p => p.pattern_type === "task_type_strength" && p.confidence_score > 0.7)
      .map(p => p.pattern_data?.taskType || "unknown");
    userStrengths.set(user.id, strengths);

    // Extract weaknesses from risks
    const weaknesses = risks
      .filter(r => r.severity === "high" || r.severity === "critical")
      .map(r => r.risk_name);
    userWeaknesses.set(user.id, weaknesses);

    // Get estimation accuracy
    const estimationPattern = patterns.find(
      p => p.pattern_type === "estimation_accuracy"
    );
    if (estimationPattern) {
      userEstimationAccuracy.set(
        user.id,
        estimationPattern.pattern_data?.accuracy || 0.5
      );
    }
  }

  // Get collaboration insights
  const collaborations = await getCollaborationInsights();
  const strongPairs = collaborations
    .filter(c => c.collaboration_score > 0.8)
    .map(c => ({
      user1: c.user_a_id,
      user2: c.user_b_id,
      score: c.collaboration_score,
    }));

  // Get project lessons
  const lessons = await getProjectLessons();
  const goodPractices = lessons
    .filter(l => l.lesson_type === "good_practice")
    .map(l => l.description);
  const badPractices = lessons
    .filter(l => l.lesson_type === "bad_practice")
    .map(l => l.description);

  // Get risks
  const { data: allRisks } = await client
    .from("alfred_risk_factors")
    .select("*")
    .order("severity");
  const riskFactors =
    allRisks?.map(r => `${r.risk_name}: ${r.description}`).slice(0, 10) || [];

  // Calculate learning confidence (how much we've learned)
  const { count } = await client
    .from("alfred_task_analytics")
    .select("id", { count: "exact" });
  const learningConfidence = Math.min(1, (count || 0) / 100); // 100 tasks = full confidence

  return {
    userStrengths,
    userWeaknesses,
    userEstimationAccuracy,
    strongPairs,
    teamWorkStyle: analyzeTeamWorkStyle(collaborations),
    goodPractices,
    badPractices,
    riskFactors,
    learningConfidence,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Analyze team collaboration style
 */
function analyzeTeamWorkStyle(collaborations: any[]): string {
  const avgCollaborationScore =
    collaborations.reduce((sum, c) => sum + c.collaboration_score, 0) /
    Math.max(1, collaborations.length);

  if (avgCollaborationScore > 0.8) {
    return "Highly collaborative - team works well together";
  } else if (avgCollaborationScore > 0.6) {
    return "Moderately collaborative - some strong pairs";
  } else if (avgCollaborationScore > 0.4) {
    return "Siloed - limited collaboration, potential issues";
  } else {
    return "Isolated - minimal collaboration, high risk";
  }
}

/**
 * Get personalized insights for a specific user
 */
export async function getPersonalizedInsights(
  userId: string,
  knowledge: AlfredKnowledge
): Promise<string[]> {
  const insights: string[] = [];

  // Strengths
  const strengths = knowledge.userStrengths.get(userId) || [];
  if (strengths.length > 0) {
    insights.push(
      `🎯 You excel at: ${strengths.join(", ")}`
    );
  }

  // Weaknesses
  const weaknesses = knowledge.userWeaknesses.get(userId) || [];
  if (weaknesses.length > 0) {
    insights.push(
      `⚠️ Watch out: ${weaknesses.join(", ")}`
    );
  }

  // Estimation accuracy
  const accuracy = knowledge.userEstimationAccuracy.get(userId) || 0.5;
  if (accuracy < 0.6) {
    insights.push(
      `📊 Your estimates tend to be optimistic — add 20-30% buffer`
    );
  } else if (accuracy > 0.85) {
    insights.push(`📊 Your estimates are spot-on — your accuracy is ${Math.round(accuracy * 100)}%`);
  }

  // Best collaborators
  const bestPairs = knowledge.strongPairs
    .filter(p => p.user1 === userId || p.user2 === userId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (bestPairs.length > 0) {
    insights.push(
      `🤝 You work best with: ${bestPairs.map(p => (p.user1 === userId ? p.user2 : p.user1)).join(", ")}`
    );
  }

  return insights;
}

/**
 * Get risk warnings for a proposed task
 */
export async function getRiskWarnings(
  userId: string,
  projectType: string,
  knowledge: AlfredKnowledge
): Promise<string[]> {
  const warnings: string[] = [];

  const userWeaknesses = knowledge.userWeaknesses.get(userId) || [];
  if (userWeaknesses.some(w => w.includes(projectType))) {
    warnings.push(
      `⚠️ This user has struggled with ${projectType} tasks before`
    );
  }

  const userAccuracy = knowledge.userEstimationAccuracy.get(userId) || 0.5;
  if (userAccuracy < 0.5) {
    warnings.push(`⚠️ Estimates may be unrealistic — add buffer`);
  }

  const relatedRisks = knowledge.riskFactors.filter(r =>
    r.toLowerCase().includes(projectType.toLowerCase())
  );
  warnings.push(...relatedRisks.slice(0, 2));

  return warnings;
}
