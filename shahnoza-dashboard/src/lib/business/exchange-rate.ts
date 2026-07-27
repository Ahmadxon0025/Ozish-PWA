import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";
import { todayKey } from "@/lib/dates";

type DB = SupabaseClient<Database>;

export interface FxRate {
  rate: number; // UZS per 1 USD
  asOf: string; // YYYY-MM-DD
  source: string; // 'cbu' | 'fallback'
}

/** Fetch today's official USD→UZS rate from the Central Bank of Uzbekistan. */
export async function fetchCbuUsdRate(): Promise<{ rate: number; asOf: string } | null> {
  try {
    const res = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ Rate?: string; Date?: string }>;
    const row = data?.[0];
    if (!row?.Rate) return null;
    const rate = Number(row.Rate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    // CBU Date is dd.mm.yyyy -> yyyy-mm-dd
    let asOf = todayKey();
    if (row.Date && /^\d{2}\.\d{2}\.\d{4}$/.test(row.Date)) {
      const [d, m, y] = row.Date.split(".");
      asOf = `${y}-${m}-${d}`;
    }
    return { rate, asOf };
  } catch {
    return null;
  }
}

/** Upsert a fetched rate into the fx_rates cache. */
export async function refreshFxRate(db: DB): Promise<FxRate> {
  const fetched = await fetchCbuUsdRate();
  if (fetched) {
    // Sanity band: a "new" rate more than 5% off the last accepted one is far
    // outside any normal daily move — almost certainly a corrupted response
    // (e.g. a shifted decimal). Keep the cached rate instead. Escape hatch: if
    // the last accepted rate is over 7 days old, a large real move (or a long
    // outage) is plausible, so accept what CBU says.
    const { data: last } = await db
      .from("fx_rates")
      .select("rate, as_of")
      .eq("base", "USD")
      .eq("quote", "UZS")
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Number(last.rate) > 0) {
      const drift = Math.abs(fetched.rate / Number(last.rate) - 1);
      const ageDays =
        (Date.now() - new Date(String(last.as_of)).getTime()) / 86400000;
      if (drift > 0.05 && ageDays < 7) {
        console.error(
          `CBU rate rejected by sanity band: ${fetched.rate} deviates ` +
            `${(drift * 100).toFixed(1)}% from ${last.rate} (${last.as_of})`
        );
        return { rate: Number(last.rate), asOf: String(last.as_of), source: "cbu" };
      }
    }
    await db
      .from("fx_rates")
      .upsert(
        {
          base: "USD",
          quote: "UZS",
          rate: fetched.rate,
          source: "cbu",
          as_of: fetched.asOf,
        },
        { onConflict: "base,quote,as_of" },
      );
    return { rate: fetched.rate, asOf: fetched.asOf, source: "cbu" };
  }
  return getFallbackRate();
}

function getFallbackRate(): FxRate {
  return { rate: env.UZS_PER_USD, asOf: todayKey(), source: "fallback" };
}

/**
 * Current UZS-per-USD rate. Reads the cached CBU rate; if today's is missing it
 * fetches once and caches it; falls back to the fixed env rate on any failure.
 */
export async function getCurrentRate(db: DB): Promise<FxRate> {
  const { data } = await db
    .from("fx_rates")
    .select("rate, as_of, source")
    .eq("base", "USD")
    .eq("quote", "UZS")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  const today = todayKey();
  if (data && data.as_of === today) {
    return { rate: Number(data.rate), asOf: data.as_of, source: data.source ?? "cbu" };
  }

  // Stale or missing — try to refresh; if that fails, use whatever we have, else fallback.
  const refreshed = await refreshFxRate(db);
  if (refreshed.source !== "fallback") return refreshed;
  if (data) return { rate: Number(data.rate), asOf: data.as_of ?? today, source: data.source ?? "cbu" };
  return getFallbackRate();
}
