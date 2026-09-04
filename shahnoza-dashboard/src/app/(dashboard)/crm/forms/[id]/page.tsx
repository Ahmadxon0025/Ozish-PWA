import { notFound } from "next/navigation";
import { crmAdmin } from "@/lib/crm/db";
import { rowToForm } from "@/lib/crm/forms";
import { listActiveCohorts } from "@/lib/crm/users";
import { env } from "@/lib/env";
import { FormEditor } from "./form-editor";

export const dynamic = "force-dynamic";

export default async function FormEditPage({
  params,
}: {
  params: { id: string };
}) {
  const db = crmAdmin();
  const [{ data, error }, cohorts] = await Promise.all([
    db.from("crm_forms").select("*").eq("id", params.id).maybeSingle(),
    listActiveCohorts(),
  ]);
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const form = rowToForm(data as Record<string, unknown>);

  return <FormEditor form={form} cohorts={cohorts} appUrl={env.APP_URL} />;
}
