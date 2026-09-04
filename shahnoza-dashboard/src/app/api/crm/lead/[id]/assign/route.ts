import { NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import { insertCrmLog } from "@/lib/crm/log";

export const dynamic = "force-dynamic";

type AssignBody = {
  sotuvchi_id?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    const body = (await request.json()) as AssignBody;
    const raw = body.sotuvchi_id;

    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return NextResponse.json({ error: "sotuvchi_id noto'g'ri" }, { status: 400 });
    }

    const sotuvchiId =
      typeof raw === "string" && raw.trim() && raw.trim() !== "none"
        ? raw.trim()
        : null;

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

    let closerName = "tayinlanmagan";
    if (sotuvchiId) {
      const { data: user, error: userError } = await db
        .from("users")
        .select("id, full_name")
        .eq("id", sotuvchiId)
        .maybeSingle();
      if (userError) throw new Error(userError.message);
      if (!user?.id) {
        return NextResponse.json({ error: "Sotuvchi topilmadi" }, { status: 400 });
      }
      closerName = (user.full_name as string) || sotuvchiId;
    }

    const { error: deleteError } = await db
      .from("crm_lead_sotuvchi")
      .delete()
      .eq("lead_id", id);
    if (deleteError) throw new Error(deleteError.message);

    if (sotuvchiId) {
      const { error: insertError } = await db.from("crm_lead_sotuvchi").insert({
        lead_id: id,
        sotuvchi_id: sotuvchiId,
        birlamchi: true,
      });
      if (insertError) throw new Error(insertError.message);
    }

    const actor = await getCrmUser();
    await insertCrmLog({
      lead_id: id,
      harakat: "tayinlandi",
      izoh: closerName,
      kim: actor?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      sotuvchi_id: sotuvchiId,
      name: closerName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
