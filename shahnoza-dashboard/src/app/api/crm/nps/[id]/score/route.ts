import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm/db";
import { insertCrmLog } from "@/lib/crm/log";
import type { CrmNps, NpsStage } from "@/types/crm";

export const dynamic = "force-dynamic";

type ScoreBody = {
  ball?: unknown;
  izoh?: unknown;
};

function asBall(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as ScoreBody;
    const ball = asBall(body.ball);
    if (ball == null || ball < 0 || ball > 10) {
      return NextResponse.json({ error: "ball 0–10 butun son bo'lishi kerak" }, { status: 400 });
    }

    const izoh = typeof body.izoh === "string" ? body.izoh.trim() : "";
    const stage: NpsStage = ball >= 7 ? "yuqori_ball" : "past_ball";

    const db = crmAdmin();
    const { data: row, error: fetchError } = await db
      .from("crm_nps")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!row?.id) {
      return NextResponse.json({ error: "NPS topilmadi" }, { status: 404 });
    }

    const nps = row as CrmNps;
    const { error: updateError } = await db
      .from("crm_nps")
      .update({ ball, stage })
      .eq("id", nps.id);
    if (updateError) throw new Error(updateError.message);

    if (nps.student_id) {
      const { data: student, error: studentError } = await db
        .from("crm_students")
        .select("lead_id")
        .eq("id", nps.student_id)
        .maybeSingle();
      if (studentError) throw new Error(studentError.message);

      const leadId = (student as { lead_id?: string | null } | null)?.lead_id;
      if (leadId) {
        await insertCrmLog({
          lead_id: leadId,
          harakat: "nps_javob",
          izoh: `NPS bali: ${ball}`,
        });
        if (ball < 7 && izoh) {
          await insertCrmLog({
            lead_id: leadId,
            harakat: "izoh",
            izoh,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, stage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
