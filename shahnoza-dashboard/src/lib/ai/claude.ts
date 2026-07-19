import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, isAiConfigured, isServiceRoleConfigured } from "@/lib/env";

// Model for all AI features. Configurable — `claude-haiku-4-5` is ~5x cheaper
// and fine for the small task-parsing prompts if cost matters.
export const AI_MODEL = "claude-opus-4-8";

function client(): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

/** Best-effort audit/cost log (service role; never throws). */
async function logUsage(
  feature: string,
  model: string,
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
  userId: string | null | undefined,
  success: boolean,
): Promise<void> {
  try {
    if (!isServiceRoleConfigured()) return;
    const { requireAdminClient } = await import("@/lib/supabase/admin");
    await requireAdminClient()
      .from("ai_usage_log")
      .insert({
        user_id: userId ?? null,
        feature,
        model,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        success,
      });
  } catch {
    // logging is non-fatal
  }
}

function textOf(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** One structured Claude call → validated JSON matching `schema`. */
export async function callStructured<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  feature: string;
  userId?: string | null;
  maxTokens?: number;
}): Promise<T> {
  if (!isAiConfigured()) {
    throw new Error("AI sozlanmagan (ANTHROPIC_API_KEY yo'q).");
  }
  let usage: Anthropic.Usage | undefined;
  let ok = false;
  try {
    const resp = await client().messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      output_config: { format: { type: "json_schema", schema: opts.schema } },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    usage = resp.usage;
    const parsed = JSON.parse(textOf(resp)) as T;
    ok = true;
    return parsed;
  } finally {
    await logUsage(opts.feature, AI_MODEL, usage, opts.userId, ok);
  }
}

/** One plain-text Claude call (e.g. the weekly narrative summary). */
export async function callText(opts: {
  system: string;
  user: string;
  feature: string;
  userId?: string | null;
  maxTokens?: number;
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new Error("AI sozlanmagan (ANTHROPIC_API_KEY yo'q).");
  }
  let usage: Anthropic.Usage | undefined;
  let ok = false;
  try {
    const resp = await client().messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    usage = resp.usage;
    const text = textOf(resp);
    ok = true;
    return text;
  } finally {
    await logUsage(opts.feature, AI_MODEL, usage, opts.userId, ok);
  }
}
