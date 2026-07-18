import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { uzsToUsd } from "@/lib/business/currency";
import { amoGet } from "./client";
import {
  AMO_STATUS_WON,
  normalizeStatus,
  pickCustomField,
  unixToIso,
  type AmoLead,
  type AmoUser,
} from "./mapping";

export interface SyncResult {
  ok: boolean;
  leads: number;
  sales: number;
  users: number;
  error?: string;
}

const MAX_PAGES = 10; // safety cap for Phase 1 (250 leads/page)

/**
 * Pull leads + users from AmoCRM and upsert into our tables. Won leads become
 * sales rows. Idempotent: everything keys on amocrm_lead_id / amocrm_user_id.
 */
export async function runAmocrmSync(): Promise<SyncResult> {
  const db = requireAdminClient();
  const { data: logRow } = await db
    .from("sync_logs")
    .insert({ service: "amocrm", status: "running" })
    .select()
    .single();

  let leadCount = 0;
  let saleCount = 0;
  let userCount = 0;

  try {
    // --- Users -------------------------------------------------------------
    const usersRes = await amoGet<{ _embedded?: { users?: AmoUser[] } }>(
      "/api/v4/users",
      { limit: 250 },
    );
    const amoUsers = usersRes?._embedded?.users ?? [];
    for (const u of amoUsers) {
      if (!u.email) continue;
      // Attach amocrm_user_id to an existing row matched by email, else create
      // a pending (role-less) row a super admin can activate.
      const { data: existing } = await db
        .from("users")
        .select("id")
        .eq("email", u.email)
        .maybeSingle();
      if (existing) {
        await db
          .from("users")
          .update({ amocrm_user_id: u.id })
          .eq("id", existing.id);
      } else {
        await db.from("users").insert({
          email: u.email,
          full_name: u.name ?? u.email,
          amocrm_user_id: u.id,
          role: null,
          is_active: false,
        });
      }
      userCount++;
    }

    // Map amocrm_user_id -> our user id for lead/sale assignment.
    const { data: mappedUsers } = await db
      .from("users")
      .select("id, amocrm_user_id")
      .not("amocrm_user_id", "is", null);
    const userIdByAmo = new Map(
      (mappedUsers ?? []).map((u) => [u.amocrm_user_id as number, u.id]),
    );

    // --- Leads (paged) -----------------------------------------------------
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await amoGet<{ _embedded?: { leads?: AmoLead[] } }>(
        "/api/v4/leads",
        { page, limit: 250, with: "contacts" },
      );
      const leads = res?._embedded?.leads ?? [];
      if (leads.length === 0) break;

      for (const lead of leads) {
        const assignedTo = lead.responsible_user_id
          ? userIdByAmo.get(lead.responsible_user_id) ?? null
          : null;
        const status = normalizeStatus(lead.status_id);
        const createdIso = unixToIso(lead.created_at);

        const { data: upserted } = await db
          .from("leads")
          .upsert(
            {
              amocrm_lead_id: lead.id,
              full_name: lead.name ?? null,
              status,
              assigned_to: assignedTo,
              amocrm_status_id: lead.status_id ?? null,
              amocrm_pipeline_id: lead.pipeline_id ?? null,
              utm_source: pickCustomField(lead, "utm_source"),
              utm_medium: pickCustomField(lead, "utm_medium"),
              utm_campaign: pickCustomField(lead, "utm_campaign"),
              utm_content: pickCustomField(lead, "utm_content"),
              created_at: createdIso ?? undefined,
              sold_at: status === "won" ? unixToIso(lead.updated_at) : null,
              last_activity_at: unixToIso(lead.updated_at) ?? undefined,
            },
            { onConflict: "amocrm_lead_id" },
          )
          .select("id")
          .single();
        leadCount++;

        // Won lead -> ensure a sale row exists.
        if (lead.status_id === AMO_STATUS_WON && upserted) {
          const { data: existingSale } = await db
            .from("sales")
            .select("id")
            .eq("amocrm_lead_id", lead.id)
            .maybeSingle();
          if (!existingSale) {
            const amountUzs = Number(lead.price ?? 0);
            await db.from("sales").insert({
              amocrm_lead_id: lead.id,
              lead_id: upserted.id,
              sales_person_id: assignedTo,
              total_amount_uzs: amountUzs || null,
              total_amount_usd: amountUzs ? uzsToUsd(amountUzs) : null,
              sold_at: unixToIso(lead.updated_at) ?? new Date().toISOString(),
            });
            saleCount++;
          }
        }
      }

      if (leads.length < 250) break;
    }

    await db
      .from("sync_logs")
      .update({
        status: "success",
        records_synced: leadCount + saleCount + userCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logRow?.id ?? "");

    return { ok: true, leads: leadCount, sales: saleCount, users: userCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("sync_logs")
      .update({
        status: "error",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logRow?.id ?? "");
    return { ok: false, leads: leadCount, sales: saleCount, users: userCount, error: message };
  }
}
