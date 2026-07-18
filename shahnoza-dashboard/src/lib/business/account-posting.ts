import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { round2 } from "./currency";

type DB = SupabaseClient<Database>;

/** First active account for a currency (used as the default when none is chosen). */
export async function resolveDefaultAccountId(
  db: DB,
  currency: "UZS" | "USD",
): Promise<string | null> {
  const { data } = await db
    .from("accounts")
    .select("id")
    .eq("currency", currency)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function accountCurrency(db: DB, accountId: string): Promise<"UZS" | "USD" | null> {
  const { data } = await db
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .maybeSingle();
  return (data?.currency as "UZS" | "USD") ?? null;
}

export interface EntryInput {
  accountId: string;
  direction: "in" | "out";
  kind: string;
  amountUsd: number;
  amountUzs?: number | null;
  rate: number; // UZS per USD
  description?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  createdBy?: string | null;
  occurredAt?: string | null;
}

/**
 * Insert one ledger entry against an account. The native `amount` is derived
 * from the account's currency: USD accounts use amountUsd; UZS accounts use the
 * provided amountUzs, or amountUsd × rate.
 */
export async function insertAccountEntry(db: DB, input: EntryInput): Promise<void> {
  const currency = await accountCurrency(db, input.accountId);
  if (!currency) return;

  const amount =
    currency === "USD"
      ? round2(input.amountUsd)
      : round2(input.amountUzs ?? input.amountUsd * input.rate);

  await db.from("account_transactions").insert({
    account_id: input.accountId,
    direction: input.direction,
    kind: input.kind,
    amount,
    currency,
    amount_usd: round2(input.amountUsd),
    rate: input.rate,
    description: input.description ?? null,
    related_type: input.relatedType ?? null,
    related_id: input.relatedId ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    created_by: input.createdBy ?? null,
  });
}

/** Remove ledger entries tied to a source row (expense/sale) before deleting it. */
export async function deleteRelatedEntries(
  db: DB,
  relatedType: string,
  relatedId: string,
): Promise<void> {
  await db
    .from("account_transactions")
    .delete()
    .eq("related_type", relatedType)
    .eq("related_id", relatedId);
}
