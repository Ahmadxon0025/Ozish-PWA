import "server-only";
import webpush from "web-push";
import { env, isPushConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

let configured = false;

/** Lazily set the VAPID details once (idempotent). */
function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where to navigate when the notification is tapped (default /inbox). */
  url?: string;
  /** Collapse key so repeated pings for the same thing replace each other. */
  tag?: string;
}

/**
 * Send a push notification to every browser a user has registered. Best-effort:
 * stale/expired subscriptions (410/404) are pruned; failures never throw. Uses
 * the service-role client (bypasses RLS) so it works from any server context.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapid()) return;
  const db = createAdminClient();
  if (!db) return;

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/inbox",
    tag: payload.tag,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410 => the subscription is gone; drop it so we stop trying.
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("web push failed:", status ?? err);
        }
      }
    }),
  );
}
