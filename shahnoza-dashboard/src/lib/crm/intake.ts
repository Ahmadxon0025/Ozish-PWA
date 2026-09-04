import { crmAdmin } from "./db";
import { insertCrmLog } from "./log";
import { normalizePhone } from "./phone";
import { getPriceWindow } from "./pricing";
import type {
  Manba,
  OylikDaromad,
  Segment,
  Tarif,
  Tayyorlik,
} from "@/types/crm";
import { MANBA_OPTIONS, TARIF_OPTIONS } from "./constants";

export type CreateCrmLeadInput = {
  ism: string;
  telefon: string;
  tarif: Tarif;
  manba: Manba;
  cohort_id: string;
  izoh?: string | null;
  sotuvchi_id?: string;
  telegram?: string | null;
  viloyat?: string | null;
  segment?: Segment | null;
  oylik_daromad?: OylikDaromad | null;
  tayyorlik?: Tayyorlik | null;
  tarif_qiziqishi?: Tarif | null;
};

export type CreateCrmLeadResult = {
  lead_id: string;
  existing: boolean;
  narx?: number | null;
  eski_narx?: number | null;
};

export async function createCrmLead(
  input: CreateCrmLeadInput,
): Promise<CreateCrmLeadResult> {
  const ism = input.ism.trim();
  const telefonRaw = input.telefon.trim();
  const cohortId = input.cohort_id.trim();

  if (!ism || !telefonRaw || !cohortId) {
    throw new Error("ism, telefon va cohort_id majburiy");
  }
  if (!TARIF_OPTIONS.includes(input.tarif) || !MANBA_OPTIONS.includes(input.manba)) {
    throw new Error("tarif yoki manba noto'g'ri");
  }

  const telefon = normalizePhone(telefonRaw);
  const db = crmAdmin();

  const { data: existing, error: existingError } = await db
    .from("crm_leads")
    .select("id")
    .eq("telefon", telefon)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) {
    return { lead_id: existing.id as string, existing: true };
  }

  const price = await getPriceWindow(cohortId, input.tarif);

  const draft: Record<string, unknown> = {
    ism,
    telefon,
    tarif: input.tarif,
    manba: input.manba,
    cohort_id: cohortId,
    izoh: input.izoh?.trim() ? input.izoh.trim() : null,
    bosqich: "yangi_lead",
    narx: price.narx,
    eski_narx: price.eski_narx,
  };

  if (input.telegram?.trim()) draft.telegram = input.telegram.trim();
  if (input.viloyat?.trim()) draft.viloyat = input.viloyat.trim();
  if (input.segment) draft.segment = input.segment;
  if (input.oylik_daromad) draft.oylik_daromad = input.oylik_daromad;
  if (input.tayyorlik) draft.tayyorlik = input.tayyorlik;
  if (input.tarif_qiziqishi) draft.tarif_qiziqishi = input.tarif_qiziqishi;

  let ball: number | null = null;
  const { data: scored, error: scoreError } = await db.rpc("crm_compute_score", {
    lead_row: draft,
  });
  if (!scoreError && typeof scored === "number") {
    ball = scored;
  }

  const { data: inserted, error: insertError } = await db
    .from("crm_leads")
    .insert({ ...draft, ball })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);
  const leadId = inserted?.id as string | undefined;
  if (!leadId) throw new Error("Lead yaratilmadi");

  if (input.sotuvchi_id) {
    const { error: assignError } = await db.from("crm_lead_sotuvchi").insert({
      lead_id: leadId,
      sotuvchi_id: input.sotuvchi_id,
      birlamchi: true,
    });
    if (assignError) throw new Error(assignError.message);
  }

  await insertCrmLog({
    lead_id: leadId,
    harakat: "yaratildi",
    kim: input.sotuvchi_id ?? null,
  });

  return {
    lead_id: leadId,
    existing: false,
    narx: price.narx,
    eski_narx: price.eski_narx,
  };
}
