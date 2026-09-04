import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadFormBySlug } from "@/lib/crm/forms";
import { PublicForm } from "./public-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const form = await loadFormBySlug(params.slug, true);
    return { title: form?.name ?? "Forma" };
  } catch {
    return { title: "Forma" };
  }
}

export default async function PublicFormPage({
  params,
}: {
  params: { slug: string };
}) {
  let form;
  try {
    form = await loadFormBySlug(params.slug, true);
  } catch {
    notFound();
  }
  if (!form) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
        <p className="text-sm text-zinc-500">Maydonlarni to&apos;ldiring</p>
      </div>
      <PublicForm slug={form.slug} token={form.webhook_token} fields={form.fields} />
    </div>
  );
}
