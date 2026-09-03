import { NextResponse } from "next/server";
import { STUDENT_STAGES } from "@/lib/crm/constants";
import { crmAdmin } from "@/lib/crm/db";
import { insertCrmLog } from "@/lib/crm/log";
import type { StudentStage } from "@/types/crm";

export const dynamic = "force-dynamic";

const STAGE_SET = new Set<string>(STUDENT_STAGES);

type StageBody = {
  stage?: unknown;
  note?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as StageBody;
    if (typeof body.stage !== "string" || !STAGE_SET.has(body.stage)) {
      return NextResponse.json({ error: "stage noto'g'ri" }, { status: 400 });
    }

    const stage = body.stage as StudentStage;
    const note = typeof body.note === "string" ? body.note.trim() : "";

    const db = crmAdmin();
    const { data: student, error: fetchError } = await db
      .from("crm_students")
      .select("id, lead_id")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!student?.id) {
      return NextResponse.json({ error: "O'quvchi topilmadi" }, { status: 404 });
    }

    const { error: updateError } = await db
      .from("crm_students")
      .update({ stage })
      .eq("id", params.id);
    if (updateError) throw new Error(updateError.message);

    const leadId = student.lead_id as string | null;
    if (leadId) {
      await insertCrmLog({
        lead_id: leadId,
        harakat: "bosqich_ozgardi",
        izoh: `oquvchi: ${note || stage}`,
        kim: null,
      });
    }

    return NextResponse.json({ ok: true, stage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
