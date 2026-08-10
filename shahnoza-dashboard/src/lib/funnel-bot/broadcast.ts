import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { getFunnelBot, personalize } from "./telegram";

// Synchronous send, capped so it comfortably finishes inside the serverless
// time limit. For the current audience size this is plenty; larger lists would
// move to a queued/cron send later.
const MAX_RECIPIENTS = 300;
const BATCH = 15;

export interface BroadcastInput {
  status?: string | null;
  segment?: string | null;
  text: string;
  createdBy?: string | null;
}

/** Send a one-off message to every subscriber matching the filter. */
export async function runBroadcast(input: BroadcastInput): Promise<{ total: number; sent: number; failed: number }> {
  const db = requireAdminClient() as any;
  let q = db.from("funnel_bot_subscribers").select("chat_id, first_name");
  if (input.status) q = q.eq("status", input.status);
  if (input.segment) q = q.eq("segment", input.segment);
  const { data } = await q.limit(MAX_RECIPIENTS);
  const recipients = (data ?? []) as Array<{ chat_id: string; first_name: string | null }>;

  const bot = getFunnelBot();
  let sent = 0;
  let failed = 0;
  if (bot) {
    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (r) => {
          try {
            await bot.api.sendMessage(r.chat_id, personalize(input.text, r.first_name), {
              link_preview_options: { is_disabled: true },
            });
            sent += 1;
          } catch {
            failed += 1;
          }
        }),
      );
    }
  }

  const total = recipients.length;
  // Record history — but never fail the broadcast if the table isn't applied yet.
  try {
    await db.from("funnel_bot_broadcasts").insert({
      filter_status: input.status ?? null,
      filter_segment: input.segment ?? null,
      text: input.text,
      total,
      sent,
      failed,
      status: "done",
      created_by: input.createdBy ?? null,
    });
  } catch {
    /* history table optional */
  }

  return { total, sent, failed };
}
