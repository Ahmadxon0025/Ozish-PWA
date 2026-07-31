import "server-only";
import { env, isInstagramConfigured } from "@/lib/env";

/**
 * Instagram Graph API client for reels analytics. Read-only: pulls recent media
 * and per-post insights (reach, likes, comments, shares, saves, plays). Requires
 * an Instagram Business/Creator account + long-lived token (INSTAGRAM_ACCESS_TOKEN,
 * INSTAGRAM_USER_ID). Every call no-ops (returns []) when unconfigured, so the
 * feature stays dormant until a token is added.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface IgPost {
  externalId: string;
  permalink: string | null;
  caption: string | null;
  publishedAt: string | null;
  mediaType: string | null;
  views: number | null; // reels: plays
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  raw: unknown;
}

interface MediaNode {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Instagram API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Pull the account's recent media published on/after `sinceIso`. */
export async function fetchRecentMedia(sinceIso: string): Promise<IgPost[]> {
  if (!isInstagramConfigured()) return [];
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const uid = env.INSTAGRAM_USER_ID;
  const fields = "id,caption,permalink,timestamp,media_type,like_count,comments_count";
  const listUrl =
    `${GRAPH}/${uid}/media?fields=${encodeURIComponent(fields)}&limit=40&access_token=${token}`;

  let media: MediaNode[] = [];
  try {
    const data = (await getJson(listUrl)) as { data?: MediaNode[] };
    media = data.data ?? [];
  } catch (err) {
    console.error("Instagram media list failed:", err);
    return [];
  }

  const since = Date.parse(sinceIso);
  const recent = media.filter((m) => !m.timestamp || Date.parse(m.timestamp) >= since);

  const out: IgPost[] = [];
  for (const m of recent) {
    // Insight metric names differ by media type; reels report "plays"/"reach".
    // We request a superset and read whatever comes back.
    const metrics =
      m.media_type === "VIDEO" || m.media_type === "REELS"
        ? "reach,plays,likes,comments,shares,saved"
        : "reach,likes,comments,shares,saved";
    let insights: Record<string, number> = {};
    try {
      const ins = (await getJson(
        `${GRAPH}/${m.id}/insights?metric=${metrics}&access_token=${token}`,
      )) as { data?: { name: string; values?: { value: number }[] }[] };
      for (const row of ins.data ?? []) {
        insights[row.name] = row.values?.[0]?.value ?? 0;
      }
    } catch {
      insights = {}; // insights can 400 on very fresh or non-eligible media
    }
    out.push({
      externalId: m.id,
      permalink: m.permalink ?? null,
      caption: m.caption ?? null,
      publishedAt: m.timestamp ?? null,
      mediaType: m.media_type ?? null,
      views: insights.plays ?? null,
      reach: insights.reach ?? null,
      likes: insights.likes ?? m.like_count ?? null,
      comments: insights.comments ?? m.comments_count ?? null,
      shares: insights.shares ?? null,
      saves: insights.saved ?? null,
      raw: { media: m, insights },
    });
  }
  return out;
}
