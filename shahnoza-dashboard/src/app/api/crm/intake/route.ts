import { NextResponse } from "next/server";
import { createCrmLead } from "@/lib/crm/intake";
import type { Manba, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

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

    const result = await createCrmLead({
      ism,
      telefon: telefonRaw,
      tarif,
      manba,
      cohort_id: cohortId,
      izoh,
      sotuvchi_id: sotuvchiId,
    });

    if (result.existing) {
      return NextResponse.json({ existing: true, lead_id: result.lead_id });
    }

    return NextResponse.json({
      lead_id: result.lead_id,
      narx: result.narx,
      eski_narx: result.eski_narx,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    const status =
      message.includes("majburiy") || message.includes("noto'g'ri") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
