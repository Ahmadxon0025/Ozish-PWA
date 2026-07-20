import "server-only";
import { callStructured } from "./claude";

export interface CallAnalysis {
  score: number;
  scores: {
    rapport: number;
    discovery: number;
    pitch: number;
    objections: number;
    closing: number;
    nextStep: number;
  };
  outcome: "won" | "followup" | "lost" | "unknown";
  summary: string;
  strengths: string[];
  improvements: string[];
  redFlags: string[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        rapport: { type: "integer", minimum: 0, maximum: 100 },
        discovery: { type: "integer", minimum: 0, maximum: 100 },
        pitch: { type: "integer", minimum: 0, maximum: 100 },
        objections: { type: "integer", minimum: 0, maximum: 100 },
        closing: { type: "integer", minimum: 0, maximum: 100 },
        nextStep: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["rapport", "discovery", "pitch", "objections", "closing", "nextStep"],
    },
    outcome: { type: "string", enum: ["won", "followup", "lost", "unknown"] },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 5 },
    improvements: { type: "array", items: { type: "string" }, maxItems: 5 },
    redFlags: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: [
    "score",
    "scores",
    "outcome",
    "summary",
    "strengths",
    "improvements",
    "redFlags",
  ],
} as const;

/**
 * Analyze a sales-call transcript for a children's-massage online course and
 * score the rep against a sales rubric. Everything in Uzbek.
 */
export async function analyzeCall(
  transcript: string,
  userId: string | null,
): Promise<CallAnalysis> {
  return callStructured<CallAnalysis>({
    feature: "call_review",
    userId,
    maxTokens: 1500,
    system:
      `Siz sotuv bo'yicha murabbiy (sales coach)siz. "Shahnoza" — bolalar massaji ` +
      `onlayn-kurs biznesi. Sizga sotuvchi va mijoz o'rtasidagi qo'ng'iroq matni (transcript) beriladi. ` +
      `Uni quyidagi mezonlar bo'yicha 0-100 ball bilan baholang: ` +
      `rapport (aloqa/ishonch), discovery (ehtiyojni aniqlash), pitch (kurs taqdimoti), ` +
      `objections (e'tirozlar bilan ishlash — narx, vaqt, ishonch), closing (yopish/sotuvga undash), ` +
      `nextStep (aniq keyingi qadam belgilanganmi). ` +
      `Umumiy 'score' — o'rtacha va umumiy taassurot. ` +
      `outcome: won (sotildi), followup (keyin bog'lanish), lost (rad), unknown. ` +
      `strengths — sotuvchi nima yaxshi qildi; improvements — nimani yaxshilash kerak (aniq, amaliy maslahatlar); ` +
      `redFlags — jiddiy xatolar (masalan mijozni tinglamadi, yolg'on va'da, qo'polik). ` +
      `Javob O'zbek tilida, qisqa va aniq. summary — 1-2 gap.`,
    user: `Qo'ng'iroq matni:\n\n${transcript.slice(0, 12000)}`,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
}
