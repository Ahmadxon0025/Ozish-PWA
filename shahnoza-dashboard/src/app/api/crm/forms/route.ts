import { NextResponse } from "next/server";
import { getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import {
  countLeadsByFormSlug,
  defaultFormFields,
  newWebhookToken,
  parseFormFields,
  rowToForm,
  slugify,
  type CrmForm,
} from "@/lib/crm/forms";
import { MANBA_OPTIONS, TARIF_OPTIONS } from "@/lib/crm/constants";
import type { Manba, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCrmUser();
  if (!user || user.role !== "admin") {
    return null;
  }
  return user;
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
    }

    const db = crmAdmin();
    const { data, error } = await db
      .from("crm_forms")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const forms = ((data ?? []) as Record<string, unknown>[]).map(rowToForm);
    const withCounts = await Promise.all(
      forms.map(async (form) => ({
        ...form,
        lead_count: await countLeadsByFormSlug(form.slug),
      })),
    );

    return NextResponse.json({ forms: withCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateBody = {
  name?: unknown;
  slug?: unknown;
  default_manba?: unknown;
  default_tarif?: unknown;
  cohort_id?: unknown;
  fields?: unknown;
};

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
    }

    const body = (await request.json()) as CreateBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name majburiy" }, { status: 400 });
    }

    let slug =
      typeof body.slug === "string" && body.slug.trim()
        ? slugify(body.slug)
        : slugify(name);

    const manba = MANBA_OPTIONS.includes(body.default_manba as Manba)
      ? (body.default_manba as Manba)
      : "Boshqa";
    const tarif = TARIF_OPTIONS.includes(body.default_tarif as Tarif)
      ? (body.default_tarif as Tarif)
      : "noma_lum";
    const cohortId =
      typeof body.cohort_id === "string" && body.cohort_id.trim()
        ? body.cohort_id.trim()
        : null;
    const fields = body.fields ? parseFormFields(body.fields) : defaultFormFields();

    const db = crmAdmin();
    const { data: taken } = await db
      .from("crm_forms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (taken?.id) {
      slug = `${slug}-${newWebhookToken().slice(0, 6)}`;
    }

    const insert = {
      name,
      slug,
      is_active: true,
      default_manba: manba,
      default_tarif: tarif,
      cohort_id: cohortId,
      fields,
      webhook_token: newWebhookToken(),
    };

    const { data, error } = await db.from("crm_forms").insert(insert).select("*").single();
    if (error) throw new Error(error.message);

    const form: CrmForm = rowToForm(data as Record<string, unknown>);
    return NextResponse.json({ form });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Noma'lum xato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
