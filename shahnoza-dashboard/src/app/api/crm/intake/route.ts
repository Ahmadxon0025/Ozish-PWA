import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm/db";
import { normalizePhone } from "@/lib/crm/phone";
import { getPriceWindow } from "@/lib/crm/pricing";
import type { Harakat, Manba, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

const TARIFLAR: Tarif[] = ["BAZA", "KASB", "BIZNES", "noma_lum"];
const MANBALAR: Manba[] = [
  "Konsultatsiya",
  "Predzapis",
  "Bot",
  "DM",
  "Tanish",
  "Referral",
  "Meta",
  "Efir",
  "Boshqa",
];

type IntakeBody = {
  ism?: unknown;
  telefon?: unknown;
  tarif?: unknown;
  manba?: unknown;
  cohort_id?: unknown;
  izoh?: unknown;
  sotuvchi_id?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IntakeBody;

    const ism = typeof body.ism === "string" ? body.ism.trim() : "";
    const telefonRaw = typeof body.telefon === "string" ? body.telefon : "";
    const tarif = body.tarif as Tarif;
    const manba = body.manba as Manba;
    const cohortId = typeof body.cohort_id === "string" ? body.cohort_id : "";
    const izoh = typeof body.izoh === "string" ? body.izoh : undefined;
    const sotuvchiId =
      typeof body.sotuvchi_id === "string" && body.sotuvchi_id.trim()
        ? body.sotuvchi_id.trim()
        : undefined;

    if (!ism || !telefonRaw || !cohortId) {
      return NextResponse.json(
        { error: "ism, telefon va cohort_id majburiy" },
        { status: 500 },
      );
    }
    if (!TARIFLAR.includes(tarif) || !MANBALAR.includes(manba)) {
      return NextResponse.json({ error: "tarif yoki manba noto'g'ri" }, { status: 500 });
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
      return NextResponse.json({ existing: true, lead_id: existing.id });
    }

    const price = await getPriceWindow(cohortId, tarif);

    const draft = {
      ism,
      telefon,
      tarif,
      manba,
      cohort_id: cohortId,
      izoh: izoh ?? null,
      bosqich: "yangi_lead",
      narx: price.narx,
      eski_narx: price.eski_narx,
    };

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

    if (sotuvchiId) {
      const { error: assignError } = await db.from("crm_lead_sotuvchi").insert({
        lead_id: leadId,
        sotuvchi_id: sotuvchiId,
        birlamchi: true,
      });
      if (assignError) throw new Error(assignError.message);
    }

    const harakat: Harakat = "yaratildi";
    const { error: logError } = await db.from("crm_log").insert({
      lead_id: leadId,
      harakat,
      kim: sotuvchiId ?? null,
    });
    if (logError) throw new Error(logError.message);

    return NextResponse.json({
      lead_id: leadId,
      narx: price.narx,
      eski_narx: price.eski_narx,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
