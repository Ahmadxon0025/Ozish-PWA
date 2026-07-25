import type { SupabaseClient } from "@supabase/supabase-js";

export interface AlfredKnowledge {
  userStrengths: Map<string, string[]>;
  userWeaknesses: Map<string, string[]>;
  userEstimationAccuracy: Map<string, number>;
  strongPairs: Array<{ user1: string; user2: string; score: number }>;
  teamWorkStyle: string;
  goodPractices: string[];
  badPractices: string[];
  riskFactors: string[];
  learningConfidence: number;
  lastUpdated: string;
}

export async function buildKnowledgeBase(): Promise<AlfredKnowledge> {
  return {
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
  };
}

export async function getPersonalizedInsights(
  userId: string,
  knowledge: AlfredKnowledge
): Promise<string[]> {
  const insights: string[] = [];

  const strengths = knowledge.userStrengths.get(userId) || [];
  if (strengths.length > 0) {
    insights.push(`🎯 You excel at: ${strengths.join(", ")}`);
  }

  const weaknesses = knowledge.userWeaknesses.get(userId) || [];
  if (weaknesses.length > 0) {
    insights.push(`⚠️ Watch out: ${weaknesses.join(", ")}`);
  }

  const accuracy = knowledge.userEstimationAccuracy.get(userId) || 0.5;
  if (accuracy < 0.6) {
    insights.push(
      "📊 Your estimates tend to be optimistic — add 20-30% buffer"
    );
  } else if (accuracy > 0.85) {
    insights.push(
      `📊 Your estimates are spot-on — your accuracy is ${Math.round(accuracy * 100)}%`
    );
  }

  return insights;
}

export async function getRiskWarnings(
  userId: string,
  projectType: string,
  knowledge: AlfredKnowledge
): Promise<string[]> {
  const warnings: string[] = [];

  const userWeaknesses = knowledge.userWeaknesses.get(userId) || [];
  if (userWeaknesses.some((w) => w.includes(projectType))) {
    warnings.push(
      `⚠️ This user has struggled with ${projectType} tasks before`
    );
  }

  const userAccuracy = knowledge.userEstimationAccuracy.get(userId) || 0.5;
  if (userAccuracy < 0.5) {
    warnings.push("⚠️ Estimates may be unrealistic — add buffer");
  }

  return warnings;
}
