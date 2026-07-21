import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { uzsToUsd } from "@/lib/business/currency";

/**
 * Won = first payment received. When a lead's first instalment is recorded as
 * paid, mark the lead won and ensure a sale row exists (the deal is now real).
 * Runs with the service role so it works regardless of who recorded the payment.
 * Idempotent: skips sale creation if one already exists for the lead (covers the
 * AmoCRM-stage path too, which also sets sales.lead_id). Never throws.
 */
export async function recognizeWonFromPayment(leadId: string): Promise<void> {
  try {
    const db = requireAdminClient();
    const { data: lead } = await db
      .from("leads")
      .select("id, amocrm_lead_id, status, amount_uzs, assigned_to, sold_at")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;

    const soldAt = lead.sold_at ?? new Date().toISOString();
    await db
      .from("leads")
      .update({ status: "won", sold_at: soldAt })
      .eq("id", leadId);

    // One sale per lead — skip if already recognized (app or AmoCRM path).
    const { data: existing } = await db
      .from("sales")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (existing) return;

    // Deal value = contracted amount; fall back to the sum of recorded payments.
    let amountUzs = Number(lead.amount_uzs ?? 0);
    if (!amountUzs) {
      const { data: pays } = await db
        .from("payments")
        .select("amount_uzs")
        .eq("lead_id", leadId);
      amountUzs = (pays ?? []).reduce((s, p) => s + Number(p.amount_uzs ?? 0), 0);
    }
    const amountUsd = amountUzs ? uzsToUsd(amountUzs) : null;

    await db.from("sales").insert({
      lead_id: leadId,
      // Carry the AmoCRM id so the sync's dedup (keyed on amocrm_lead_id) won't
      // create a second sale for the same deal.
      amocrm_lead_id: lead.amocrm_lead_id ?? null,
      sales_person_id: lead.assigned_to,
      total_amount_uzs: amountUzs || null,
      total_amount_usd: amountUsd,
      sold_at: soldAt,
    });
  } catch {
    // non-fatal: payment is already saved; recognition can retry on next payment
  }
}
