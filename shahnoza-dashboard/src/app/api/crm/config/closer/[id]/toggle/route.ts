import { NextResponse } from "next/server";
import { CLOSED_STAGES } from "@/lib/crm/constants";
import { crmAdmin } from "@/lib/crm/db";
import { robotAssignCloser } from "@/lib/crm/robots";

export const dynamic = "force-dynamic";

type ToggleBody = {
  is_active?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ error: "id majburiy" }, { status: 400 });
    }

    const body = (await request.json()) as ToggleBody;
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active noto'g'ri" }, { status: 400 });
    }

    const isActive = body.is_active;
    const db = crmAdmin();

    const { data: current, error: fetchError } = await db
      .from("crm_users")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!current?.id) {
      return NextResponse.json({ error: "Closer topilmadi" }, { status: 404 });
    }

    const { error: updateError } = await db
      .from("crm_users")
      .update({ is_active: isActive })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    if (!isActive) {
      const { data: assignRows, error: assignError } = await db
        .from("crm_lead_sotuvchi")
        .select("id, lead_id")
        .eq("sotuvchi_id", id);
      if (assignError) throw new Error(assignError.message);

      const assigns = (assignRows ?? []) as { id: string; lead_id: string }[];
      const leadIds = assigns.map((row) => row.lead_id);
      let openIds: string[] = [];

      if (leadIds.length > 0) {
        const { data: openRows, error: openError } = await db
          .from("crm_leads")
          .select("id")
          .in("id", leadIds)
          .not("bosqich", "in", `(${CLOSED_STAGES.join(",")})`);
        if (openError) throw new Error(openError.message);

        openIds = ((openRows ?? []) as { id: string }[]).map((row) => row.id);
        const openSet = new Set(openIds);
        const toDelete = assigns
          .filter((row) => openSet.has(row.lead_id))
          .map((row) => row.id);

        if (toDelete.length > 0) {
          const { error: deleteError } = await db
            .from("crm_lead_sotuvchi")
            .delete()
            .in("id", toDelete);
          if (deleteError) throw new Error(deleteError.message);
        }
      }

      await robotAssignCloser(db);

      if (openIds.length > 0) {
        const { data: takenRows, error: takenError } = await db
          .from("crm_lead_sotuvchi")
          .select("lead_id")
          .in("lead_id", openIds);
        if (takenError) throw new Error(takenError.message);

        const taken = new Set(
          ((takenRows ?? []) as { lead_id: string }[]).map((row) => row.lead_id),
        );
        const leftover = openIds.filter((leadId) => !taken.has(leadId));

        if (leftover.length > 0) {
          const { data: activeRows, error: activeError } = await db
            .from("crm_users")
            .select("id")
            .eq("role", "closer")
            .eq("is_active", true);
          if (activeError) throw new Error(activeError.message);

          const activeIds = ((activeRows ?? []) as { id: string }[]).map((row) => row.id);
          if (activeIds.length > 0) {
            const { data: loadRows, error: loadError } = await db
              .from("crm_lead_sotuvchi")
              .select("sotuvchi_id")
              .in("sotuvchi_id", activeIds);
            if (loadError) throw new Error(loadError.message);

            const load = new Map<string, number>(activeIds.map((cid) => [cid, 0]));
            for (const row of (loadRows ?? []) as { sotuvchi_id: string }[]) {
              load.set(row.sotuvchi_id, (load.get(row.sotuvchi_id) ?? 0) + 1);
            }

            for (const leadId of leftover) {
              let best = activeIds[0]!;
              let bestCount = load.get(best) ?? 0;
              for (const cid of activeIds) {
                const n = load.get(cid) ?? 0;
                if (n < bestCount) {
                  best = cid;
                  bestCount = n;
                }
              }
              const { error: insertError } = await db.from("crm_lead_sotuvchi").insert({
                lead_id: leadId,
                sotuvchi_id: best,
                birlamchi: true,
              });
              if (insertError) throw new Error(insertError.message);
              load.set(best, (load.get(best) ?? 0) + 1);
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, is_active: isActive });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
