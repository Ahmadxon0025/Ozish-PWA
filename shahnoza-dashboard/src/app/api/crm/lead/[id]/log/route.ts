import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm/db";
import { HARAKAT_LABELS } from "@/lib/crm/constants";
import { insertCrmLog } from "@/lib/crm/log";

export const dynamic = "force-dynamic";

type LogBody = {
  harakat?: unknown;
  izoh?: unknown;
  keyingi_aloqa?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    const body = (await request.json()) as LogBody;
    const harakat = typeof body.harakat === "string" ? body.harakat.trim() : "";
    const izoh = typeof body.izoh === "string" ? body.izoh.trim() : "";
    const keyingiAloqa =
      typeof body.keyingi_aloqa === "string" && body.keyingi_aloqa.trim()
        ? body.keyingi_aloqa.trim()
        : null;

    if (!harakat || !(harakat in HARAKAT_LABELS)) {
      return NextResponse.json({ error: "harakat noto'g'ri" }, { status: 400 });
    }

    const db = crmAdmin();
    const { data: lead, error: leadError } = await db
      .from("crm_leads")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (leadError) throw new Error(leadError.message);
    if (!lead?.id) {
      return NextResponse.json({ error: "Lead topilmadi" }, { status: 404 });
    }

    const logId = await insertCrmLog({
      lead_id: id,
      harakat,
      izoh: izoh || null,
      kim: null,
    });

    if (keyingiAloqa) {
      const { error: updateError } = await db
        .from("crm_leads")
        .update({ keyingi_aloqa: keyingiAloqa })
        .eq("id", id);
      if (updateError) throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true, log_id: logId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
