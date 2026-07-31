import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isInstagramConfigured, isAiConfigured } from "@/lib/env";
import { callStructured } from "@/lib/ai/claude";

type Db = SupabaseClient<Database>;

/**
 * Pull recent Instagram media + insights and upsert them into reel_metrics,
 * matching each post to a planned reel by its published_link. No-ops without an
 * Instagram token. Returns the number of posts synced.
 */
export async function syncInstagram(db: Db, sinceIso: string): Promise<number> {
  if (!isInstagramConfigured()) return 0;
  const { fetchRecentMedia } = await import("@/lib/instagram/client");
  let posts;
  try {
    posts = await fetchRecentMedia(sinceIso);
  } catch (err) {
    console.error("syncInstagram failed:", err);
    return 0;
  }
  if (posts.length === 0) return 0;

  // Match to a planned reel by exact published_link.
  const { data: reels } = await db.from("reels").select("id, published_link");
  const byLink = new Map(
    (reels ?? [])
      .filter((r) => r.published_link)
      .map((r) => [r.published_link as string, r.id]),
  );

  const rows = posts.map((p) => ({
    reel_id: p.permalink ? byLink.get(p.permalink) ?? null : null,
    platform: "instagram",
    external_id: p.externalId,
    permalink: p.permalink,
    caption: p.caption,
    published_at: p.publishedAt,
    views: p.views,
    reach: p.reach,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
    source: "api",
    raw: p.raw as Database["public"]["Tables"]["reel_metrics"]["Insert"]["raw"],
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await db
    .from("reel_metrics")
    .upsert(rows, { onConflict: "platform,external_id" });
  if (error) {
    console.error("reel_metrics upsert failed:", error.message);
    return 0;
  }
  return rows.length;
}

interface AnalysisOut {
  summary: string;
  recommendations: string[];
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "2-4 jumlali qisqa tahlil (o'zbekcha)" },
    recommendations: {
      type: "array",
      items: { type: "string" },
      description: "3-6 ta aniq keyingi qadam (o'zbekcha, har biri qisqa)",
    },
  },
  required: ["summary", "recommendations"],
};

/**
 * Weekly reels analysis: aggregate the last 14 days of metrics (Instagram +
 * Telegram), compare against the reel plan, and produce an AI narrative +
 * concrete next steps. Persists a reel_insights row and returns it. No-ops
 * (returns null) when AI is off or there's no data yet.
 */
export async function runWeeklyReelAnalysis(
  db: Db,
  now: Date,
): Promise<{ summary: string; recommendations: string[] } | null> {
  if (!isAiConfigured()) return null;

  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  await syncInstagram(db, since); // best-effort refresh before reading

  const { data: metrics } = await db
    .from("reel_metrics")
    .select("*")
    .gte("published_at", since)
    .order("published_at", { ascending: false });
  const rows = metrics ?? [];
  if (rows.length === 0) return null; // nothing measured yet

  // Attach the planned reel title/CTA where we can.
  const reelIds = Array.from(new Set(rows.map((r) => r.reel_id).filter(Boolean) as string[]));
  const { data: reels } = reelIds.length
    ? await db.from("reels").select("id, seq, title, cta, stage").in("id", reelIds)
    : { data: [] as { id: string; seq: number | null; title: string; cta: string | null; stage: string | null }[] };
  const reelById = new Map((reels ?? []).map((r) => [r.id, r]));

  const num = (n: number | null | undefined) => Number(n ?? 0);
  const lines = rows.map((m) => {
    const r = m.reel_id ? reelById.get(m.reel_id) : null;
    const label = r ? `#${r.seq ?? "?"} ${r.title}` : m.caption?.slice(0, 60) || m.external_id || "—";
    const eng =
      num(m.likes) + num(m.comments) + num(m.shares) + num(m.saves) + num(m.reactions);
    return `${m.platform} | ${label} | ko'rish:${num(m.views) || num(m.reach) || "—"} · like:${num(m.likes)} · comment:${num(m.comments)} · saqlash:${num(m.saves)} · share:${num(m.shares)} · reaksiya:${num(m.reactions)} · jami eng:${eng}`;
  });

  // A little plan context so recommendations tie back to the sequence.
  const { data: plan } = await db
    .from("reels")
    .select("seq, title, cta, stage, status, scheduled_date")
    .order("seq", { ascending: true, nullsFirst: false })
    .limit(60);
  const upcoming = (plan ?? [])
    .filter((r) => r.status !== "chop")
    .slice(0, 12)
    .map((r) => `#${r.seq ?? "?"} ${r.title} (${r.cta ?? "—"})`);

  const user = [
    "So'nggi 14 kunlik reel/post ko'rsatkichlari:",
    ...lines,
    "",
    "Rejadagi keyingi reellar:",
    ...upcoming,
    "",
    "Vazifa: yuqoridagi natijalarni tahlil qil. Qaysi mavzu/format/CTA yaxshi ishladi, qaysi biri ishlamadi? Keyingi reellarni yaxshilash uchun aniq qadamlar ber.",
  ].join("\n");

  let out: AnalysisOut;
  try {
    out = await callStructured<AnalysisOut>({
      system:
        "Sen 'Shahnoza' biznesining kontent-analitigisan (bolalar massaji onlayn-kurs). " +
        "Instagram va Telegram reel/post natijalarini tahlil qilib, o'zbek tilida qisqa, " +
        "amaliy tavsiyalar berasan. Faqat ma'lumotga asoslan; taxmin qilma.",
      user,
      schema: ANALYSIS_SCHEMA,
      feature: "reel_analysis",
      maxTokens: 1200,
    });
  } catch (err) {
    console.error("reel analysis AI failed:", err);
    return null;
  }

  const periodStart = since.slice(0, 10);
  const periodEnd = now.toISOString().slice(0, 10);
  await db.from("reel_insights").insert({
    period_start: periodStart,
    period_end: periodEnd,
    title: `Reels tahlili ${periodStart} — ${periodEnd}`,
    summary: out.summary,
    recommendations: out.recommendations as Database["public"]["Tables"]["reel_insights"]["Insert"]["recommendations"],
    stats: { posts: rows.length } as Database["public"]["Tables"]["reel_insights"]["Insert"]["stats"],
  });

  return { summary: out.summary, recommendations: out.recommendations };
}
