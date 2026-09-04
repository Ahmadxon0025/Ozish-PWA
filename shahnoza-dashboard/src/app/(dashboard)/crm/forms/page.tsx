import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { crmAdmin } from "@/lib/crm/db";
import { countLeadsByFormSlug, rowToForm } from "@/lib/crm/forms";
import { listActiveCohorts } from "@/lib/crm/users";
import { NewFormButton } from "./new-form-button";

export const dynamic = "force-dynamic";

export default async function FormsListPage() {
  const db = crmAdmin();
  let loadError: string | null = null;
  let rows: Array<ReturnType<typeof rowToForm> & { lead_count: number }> = [];
  let defaultCohortId = "";

  try {
    const [{ data, error }, cohorts] = await Promise.all([
      db.from("crm_forms").select("*").order("name", { ascending: true }),
      listActiveCohorts(),
    ]);
    if (error) throw new Error(error.message);
    defaultCohortId = cohorts[0]?.id ?? "";
    const forms = ((data ?? []) as Record<string, unknown>[]).map(rowToForm);
    rows = await Promise.all(
      forms.map(async (form) => ({
        ...form,
        lead_count: await countLeadsByFormSlug(form.slug),
      })),
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formalar</h1>
          <p className="text-sm text-muted-foreground">
            Web va Google Forms orqali lead qabul qilish
          </p>
        </div>
        <NewFormButton defaultCohortId={defaultCohortId} />
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {rows.length === 0 && !loadError ? (
        <p className="text-sm text-muted-foreground">Hali forma yo&apos;q.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomi</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Leadlar</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((form) => (
              <TableRow key={form.id}>
                <TableCell>
                  <Link
                    href={`/crm/forms/${form.id}`}
                    className="font-medium hover:underline"
                  >
                    {form.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {form.slug}
                </TableCell>
                <TableCell>
                  <Badge variant={form.is_active ? "default" : "secondary"}>
                    {form.is_active ? "Faol" : "Nofaol"}
                  </Badge>
                </TableCell>
                <TableCell>{form.lead_count}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/crm/forms/${form.id}`}>Tahrirlash</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
