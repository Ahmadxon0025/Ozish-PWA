import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm/db";
import { ALL_STAGES } from "@/lib/crm/constants";
import { convertLeadToStudent } from "@/lib/crm/convert";
import { insertCrmLog } from "@/lib/crm/log";
import type { Bosqich, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

const BOSQICH_SET = new Set<string>(ALL_STAGES);

type StageBody = {
  bosqich?: unknown;
  izoh?: unknown;
};

function isBosqich(value: unknown): value is Bosqich {
  return typeof value === "string" && BOSQICH_SET.has(value);
}

async function changeStage(
  request: Request,
  id: string,
): Promise<NextResponse> {
  try {
    const body = (await request.json()) as StageBody;
    if (!isBosqich(body.bosqich)) {
      return NextResponse.json({ error: "bosqich noto'g'ri" }, { status: 400 });
    }

    const next = body.bosqich;
    const izoh = typeof body.izoh === "string" ? body.izoh.trim() : "";

    const db = crmAdmin();
    const { data: current, error: fetchError } = await db
      .from("crm_leads")
      .select("id, bosqich, tarif")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!current?.id) {
      return NextResponse.json({ error: "Lead topilmadi" }, { status: 404 });
    }

    const prev = current.bosqich as Bosqich;
    const fromIdx = ALL_STAGES.indexOf(prev);
    const toIdx = ALL_STAGES.indexOf(next);
    if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
      console.warn(
        `[crm] backwards stage ${prev} → ${next} for lead ${id} (allowed)`,
      );
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      bosqich: next,
      bosqich_updated_at: now,
    };

    if (next === "yutuq") {
      patch.yopilgan_sana = now;
      patch.to_liq_status = "qarz";
    }
    if (next === "muvaffaqiyatsizlik" && izoh) {
      patch.muvaffaqiyatsizlik_sababi = izoh;
    }

    const { error: updateError } = await db.from("crm_leads").update(patch).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    await insertCrmLog({
      lead_id: id,
      harakat: "bosqich_ozgardi",
      izoh: `${prev} → ${next}`,
      kim: null,
    });

    if (next === "yutuq") {
      try {
        await convertLeadToStudent({
          leadId: id,
          tarif: (current.tarif as Tarif) ?? "noma_lum",
          amount: 0,
          paymentType: "Naqd",
        });
      } catch (convertErr) {
        console.warn(
          `[crm] auto-convert failed for lead ${id}:`,
          convertErr instanceof Error ? convertErr.message : convertErr,
        );
      }
    }

    return NextResponse.json({ ok: true, bosqich: next });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  return changeStage(request, params.id);
}

/** Day 2 pipeline board still POSTs; same handler as PATCH. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  return changeStage(request, params.id);
}
