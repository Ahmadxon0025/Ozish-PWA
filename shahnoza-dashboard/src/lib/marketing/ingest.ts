import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Funnel-event ingestion + person stitching (Phase B keystone).
 *
 * The customer-facing funnel bot lives OUTSIDE this repo. On each meaningful
 * step it POSTs to /api/funnel/event, which calls ingestFunnelEvent(). This
 * module is the receiving side: it resolves-or-creates the person (progressive
 * identity, keyed on telegram_id), stamps attribution from the start payload,
 * and records the event into the funnel_events spine — so a self-serve sale in
 * the bot is traceable all the way back to the ad that produced it.
 */

type Db = SupabaseClient<Database>;

export type FunnelEventType =
  | "bot_start"
  | "lesson_view"
  | "lead"
  | "phone_captured"
  | "checkout_started"
  | "call_booked"
  | "call_done"
  | "sale";

export interface IngestInput {
  event: FunnelEventType | string;
  telegramId?: string | null;
  telegramUsername?: string | null;
  funnel?: string | null; // cold | warm | hot (explicit; overrides payload decode)
  payload?: string | null; // raw start payload, e.g. "cold_ad1234"
  adId?: string | null;
  campaignId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  phone?: string | null;
  fullName?: string | null;
  amocrmLeadId?: number | null;
  assetKey?: string | null; // marketing_assets.key for content views
  watchedPct?: number | null;
  amountUzs?: number | null;
  occurredAt?: string | null; // ISO; defaults to now
  metadata?: Record<string, unknown> | null;
}

const FUNNEL_KEYS = new Set(["cold", "warm", "hot"]);

// Used only to track the furthest stage a person reached (denormalized).
const STAGE_ORDER = [
  "impression",
  "click",
  "bot_start",
  "lesson_view",
  "lead",
  "phone_captured",
  "checkout_started",
  "call_booked",
  "call_done",
  "sale",
];

/**
 * Decode a start payload like "cold_ad1234" / "warm-1234" / "hot" into a funnel
 * key + ad id. The funnel key is the leading token (cold|warm|hot); the rest is
 * the ad id. Unknown formats return {} (event still records, just unattributed).
 */
export function decodePayload(payload?: string | null): {
  funnel?: string;
  adId?: string;
} {
  if (!payload) return {};
  const parts = payload.trim().split(/[_\-.:]/);
  const first = parts[0]?.toLowerCase();
  if (first && FUNNEL_KEYS.has(first)) {
    const adId = parts.slice(1).join("-") || undefined;
    return { funnel: first, adId };
  }
  return {};
}

async function resolveFunnelId(db: Db, key?: string | null): Promise<string | null> {
  if (!key) return null;
  const { data } = await db.from("funnels").select("id").eq("key", key).maybeSingle();
  return data?.id ?? null;
}

/** Insert one funnel event, upserting/stitching the person by telegram_id. */
export async function ingestFunnelEvent(db: Db, input: IngestInput) {
  const decoded = decodePayload(input.payload);
  const funnelKey = (input.funnel ?? decoded.funnel ?? null)?.toLowerCase() ?? null;
  const adId = input.adId ?? decoded.adId ?? null;
  const funnelId = await resolveFunnelId(db, funnelKey);
  const now = input.occurredAt ?? new Date().toISOString();
  const stageKey = String(input.event);

  // 1. Resolve or create the person (progressive identity, keyed on telegram_id).
  let personId: string | null = null;
  if (input.telegramId) {
    const { data: existing } = await db
      .from("persons")
      .select(
        "id, touched_funnels, furthest_stage, phone, full_name, amocrm_lead_id",
      )
      .eq("telegram_id", input.telegramId)
      .maybeSingle();

    if (existing) {
      personId = existing.id;
      const touched = existing.touched_funnels ?? [];
      const patch: Database["public"]["Tables"]["persons"]["Update"] = {
        last_funnel_id: funnelId ?? undefined,
        last_touch_at: now,
      };
      if (funnelKey && !touched.includes(funnelKey)) {
        patch.touched_funnels = [...touched, funnelKey];
      }
      if (input.telegramUsername) patch.telegram_username = input.telegramUsername;
      if (input.phone && !existing.phone) patch.phone = input.phone;
      if (input.fullName && !existing.full_name) patch.full_name = input.fullName;
      if (input.amocrmLeadId && !existing.amocrm_lead_id) {
        patch.amocrm_lead_id = input.amocrmLeadId;
      }
      if (input.event === "sale") patch.is_buyer = true;
      const newIdx = STAGE_ORDER.indexOf(stageKey);
      const curIdx = existing.furthest_stage
        ? STAGE_ORDER.indexOf(existing.furthest_stage)
        : -1;
      if (newIdx > curIdx) patch.furthest_stage = stageKey;
      await db.from("persons").update(patch).eq("id", existing.id);
    } else {
      const { data: created, error } = await db
        .from("persons")
        .insert({
          telegram_id: input.telegramId,
          telegram_username: input.telegramUsername ?? null,
          phone: input.phone ?? null,
          full_name: input.fullName ?? null,
          amocrm_lead_id: input.amocrmLeadId ?? null,
          first_funnel_id: funnelId,
          first_touch_at: now,
          last_funnel_id: funnelId,
          last_touch_at: now,
          start_payload: input.payload ?? null,
          ad_id: adId,
          utm_source: input.utmSource ?? null,
          utm_medium: input.utmMedium ?? null,
          utm_campaign: input.utmCampaign ?? null,
          utm_content: input.utmContent ?? null,
          touched_funnels: funnelKey ? [funnelKey] : [],
          furthest_stage: stageKey,
          is_buyer: input.event === "sale",
        })
        .select("id")
        .single();
      if (error) {
        // Race: a concurrent event created the person first — re-select.
        const { data: again } = await db
          .from("persons")
          .select("id")
          .eq("telegram_id", input.telegramId)
          .maybeSingle();
        personId = again?.id ?? null;
      } else {
        personId = created?.id ?? null;
      }
    }
  }

  // 2. Content views → asset_views (watch % when the host reports it).
  let assetId: string | null = null;
  if (input.assetKey) {
    const { data: asset } = await db
      .from("marketing_assets")
      .select("id")
      .eq("key", input.assetKey)
      .maybeSingle();
    assetId = asset?.id ?? null;
    if (assetId && personId) {
      await db.from("asset_views").insert({
        person_id: personId,
        asset_id: assetId,
        opened_at: now,
        watched_pct: input.watchedPct ?? null,
        completed: (input.watchedPct ?? 0) >= 90,
        last_event_at: now,
      });
    }
  }

  // 3. Record the event on the spine.
  const { data: evt, error: evtErr } = await db
    .from("funnel_events")
    .insert({
      person_id: personId,
      funnel_id: funnelId,
      stage_key: stageKey,
      event_type: String(input.event),
      occurred_at: now,
      source: "telegram",
      ad_id: adId,
      campaign_id: input.campaignId ?? null,
      asset_id: assetId,
      amount_uzs: input.amountUzs ?? null,
      metadata: (input.metadata ?? null) as Database["public"]["Tables"]["funnel_events"]["Insert"]["metadata"],
    })
    .select("id")
    .single();
  if (evtErr) throw new Error(evtErr.message);

  return {
    personId,
    funnel: funnelKey,
    stageKey,
    eventId: evt?.id ?? null,
  };
}
