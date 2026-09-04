import { NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import {
  parseFormFields,
  rowToForm,
  slugify,
} from "@/lib/crm/forms";
import { MANBA_OPTIONS, TARIF_OPTIONS } from "@/lib/crm/constants";
import type { Manba, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCrmUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
    }

    const db = crmAdmin();
    const { data, error } = await db
      .from("crm_forms")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Forma topilmadi" }, { status: 404 });
    }
    return NextResponse.json({ form: rowToForm(data as Record<string, unknown>) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PutBody = {
  name?: unknown;
  slug?: unknown;
  is_active?: unknown;
  default_manba?: unknown;
  default_tarif?: unknown;
  cohort_id?: unknown;
  fields?: unknown;
};

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
    }

    const body = (await request.json()) as PutBody;
    const patch: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "name bo'sh" }, { status: 400 });
      patch.name = name;
    }
    if (typeof body.slug === "string") {
      const slug = slugify(body.slug);
      const db = crmAdmin();
      const { data: taken } = await db
        .from("crm_forms")
        .select("id")
        .eq("slug", slug)
        .neq("id", params.id)
        .maybeSingle();
      if (taken?.id) {
        return NextResponse.json({ error: "Bu slug band" }, { status: 400 });
      }
      patch.slug = slug;
    }
    if (typeof body.is_active === "boolean") {
      patch.is_active = body.is_active;
    }
    if (body.default_manba !== undefined) {
      if (!MANBA_OPTIONS.includes(body.default_manba as Manba)) {
        return NextResponse.json({ error: "manba noto'g'ri" }, { status: 400 });
      }
      patch.default_manba = body.default_manba;
    }
    if (body.default_tarif !== undefined) {
      if (!TARIF_OPTIONS.includes(body.default_tarif as Tarif)) {
        return NextResponse.json({ error: "tarif noto'g'ri" }, { status: 400 });
      }
      patch.default_tarif = body.default_tarif;
    }
    if (body.cohort_id !== undefined) {
      patch.cohort_id =
        typeof body.cohort_id === "string" && body.cohort_id.trim()
          ? body.cohort_id.trim()
          : null;
    }
    if (body.fields !== undefined) {
      const fields = parseFormFields(body.fields);
      if (fields.length === 0) {
        return NextResponse.json({ error: "Kamida bitta maydon kerak" }, { status: 400 });
      }
      patch.fields = fields;
    }

    const db = crmAdmin();
    const { data, error } = await db
      .from("crm_forms")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Forma topilmadi" }, { status: 404 });
    }

    return NextResponse.json({ form: rowToForm(data as Record<string, unknown>) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
