import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { uzsToUsd } from "@/lib/business/currency";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import {
  insertAccountEntry,
  resolveDefaultAccountId,
} from "@/lib/business/account-posting";
import { amoGet } from "./client";
import {
  pickCustomField,
  pickByName,
  pickNumberByName,
  pickBoolByName,
  statusFromStage,
  unixToIso,
  type AmoLead,
  type AmoUser,
} from "./mapping";

const MAX_PAGES = 40; // up to 10k leads/page (250 each)

interface AmoPipeline {
  id: number;
  name?: string;
  _embedded?: { statuses?: { id: number; name?: string }[] };
}

export interface SyncResult {
  ok: boolean;
  leads: number;
  sales: number;
  users: number;
  error?: string;
}

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

    // For won-lead sales: map the amoCRM price (UZS) to a product, credit the
    // default UZS account, and normalize with the current CBU rate — mirroring
    // sales.create so AmoCRM sales land in revenue + cash + cashflow.
    const [{ data: products }, defaultUzsAccountId, rate] = await Promise.all([
      db.from("products").select("id, name, price_uzs, price_usd"),
      resolveDefaultAccountId(db, "UZS"),
      getCurrentRate(db),
    ]);
    const matchProductByUzs = (amountUzs: number): string | null => {
      if (!amountUzs || !products?.length) return null;
      let best: { id: string; diff: number } | null = null;
      for (const p of products) {
        const price = Number(p.price_uzs ?? 0);
        if (!price) continue;
        const diff = Math.abs(price - amountUzs) / price;
        if (best === null || diff < best.diff) best = { id: p.id, diff };
      }
      return best && best.diff <= 0.1 ? best.id : null; // within 10%
    };

    // Pipelines + statuses → real stage/pipeline names keyed by status_id.
    const pipeRes = await amoGet<{ _embedded?: { pipelines?: AmoPipeline[] } }>(
      "/api/v4/leads/pipelines",
    );
    const stageMeta = new Map<number, { pipeline: string; stage: string }>();
    for (const p of pipeRes?._embedded?.pipelines ?? []) {
      for (const s of p._embedded?.statuses ?? []) {
        stageMeta.set(s.id, { pipeline: p.name ?? "—", stage: s.name ?? "—" });
      }
    }

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
        const meta = lead.status_id ? stageMeta.get(lead.status_id) : undefined;
        const stageName = meta?.stage ?? null;
        const status = statusFromStage(stageName);
        const createdIso = unixToIso(lead.created_at);
        const cancelReason = pickByName(lead, "Rad etish sababi");
        const courseStartSec = pickNumberByName(lead, "Dars boshlangan sana");

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
              pipeline_name: meta?.pipeline ?? null,
              stage_name: stageName,
              source_name: pickByName(lead, "Manba"),
              tarif: pickByName(lead, "Ta'rif", "Tarif", "Ta’rif"),
              payment_method: pickByName(lead, "To'lov usuli", "To’lov usuli"),
              cancel_reason: cancelReason,
              segment: pickByName(lead, "Segment"),
              region: pickByName(lead, "Manzili"),
              goal: pickByName(lead, "Maqsad"),
              course_format: pickByName(lead, "Kurs formati"),
              manager_name: pickByName(lead, "Menejer"),
              amount_uzs: Number(lead.price ?? 0) || null,
              outstanding_uzs: pickNumberByName(lead, "Qoldiq summasi"),
              finished_course: pickBoolByName(lead, "Kursni tugatdi"),
              course_started_at: courseStartSec
                ? new Date(courseStartSec * 1000).toISOString().slice(0, 10)
                : null,
              lost_reason: cancelReason,
              created_at: createdIso ?? undefined,
              sold_at: status === "won" ? unixToIso(lead.updated_at) : null,
              lost_at: status === "lost" ? unixToIso(lead.updated_at) : null,
              last_activity_at: unixToIso(lead.updated_at) ?? undefined,
            },
            { onConflict: "amocrm_lead_id" },
          )
          .select("id")
          .single();
        leadCount++;

        // Won lead -> ensure a sale row exists (amount from the native price).
        if (status === "won" && upserted) {
          const { data: existingSale } = await db
            .from("sales")
            .select("id")
            .eq("amocrm_lead_id", lead.id)
            .maybeSingle();
          if (!existingSale) {
            const amountUzs = Number(lead.price ?? 0);
            const amountUsd = amountUzs ? uzsToUsd(amountUzs) : null;
            const soldAt = unixToIso(lead.updated_at) ?? new Date().toISOString();
            const { data: sale } = await db
              .from("sales")
              .insert({
                amocrm_lead_id: lead.id,
                lead_id: upserted.id,
                sales_person_id: assignedTo,
                product_id: matchProductByUzs(amountUzs),
                account_id: defaultUzsAccountId,
                total_amount_uzs: amountUzs || null,
                total_amount_usd: amountUsd,
                sold_at: soldAt,
              })
              .select("id")
              .single();
            // Credit the default account (money in), like sales.create.
            if (sale && defaultUzsAccountId && amountUsd) {
              await insertAccountEntry(db, {
                accountId: defaultUzsAccountId,
                direction: "in",
                kind: "sale",
                amountUsd,
                amountUzs: amountUzs || null,
                rate: rate.rate,
                description: "Sotuv (AmoCRM)",
                relatedType: "sale",
                relatedId: sale.id,
                occurredAt: soldAt,
              });
            }
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
