import type { SupabaseClient } from "@supabase/supabase-js";
import { todayRange } from "@/lib/dates";

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Sum of confirmed payments created today (Tashkent calendar day). */
export async function getRevenueToday(
  supabase: SupabaseClient,
): Promise<bigint> {
  const range = todayRange();
  const { data, error } = await supabase
    .from("crm_payments")
    .select("amount")
    .eq("status", "confirmed")
    .gte("created_at", range.from)
    .lt("created_at", range.to);

  if (error) throw new Error(error.message);

  let total = 0n;
  for (const row of (data ?? []) as { amount: unknown }[]) {
    total += asBigInt(row.amount);
  }
  return total;
}
