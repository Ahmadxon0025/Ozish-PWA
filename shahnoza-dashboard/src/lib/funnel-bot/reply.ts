import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { getFunnelBot } from "./telegram";

/**
 * Send a human reply to a subscriber from the inbox: deliver via the bot, stop
 * any running drip (a human has taken over), and log it as an outgoing message.
 */
export async function sendHumanReply(subscriberId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const db = requireAdminClient() as any;
  const { data: sub } = await db
    .from("funnel_bot_subscribers")
    .select("id, chat_id")
    .eq("id", subscriberId)
    .maybeSingle();
  if (!sub?.chat_id) return { ok: false, error: "Obunachi topilmadi" };

  const bot = getFunnelBot();
  if (!bot) return { ok: false, error: "Bot sozlanmagan" };
  try {
    await bot.api.sendMessage(sub.chat_id, text, { link_preview_options: { is_disabled: true } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Yuborilmadi" };
  }

  // Human took over → stop the drip, log the message, mark the conversation.
  await db
    .from("funnel_bot_runs")
    .update({ status: "stopped" })
    .eq("subscriber_id", subscriberId)
    .in("status", ["running", "waiting", "delayed"]);
  await db.from("funnel_bot_log").insert({
    subscriber_id: subscriberId,
    step_id: null,
    direction: "out",
    kind: "human",
    detail: text,
  });
  await db
    .from("funnel_bot_subscribers")
    .update({ status: "replied", updated_at: new Date().toISOString() })
    .eq("id", subscriberId);

  return { ok: true };
}
