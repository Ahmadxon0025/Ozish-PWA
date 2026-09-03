import Link from "next/link";
import { format, parseISO } from "date-fns";
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
import { assignedLeadIds, getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import { maskPhone } from "@/lib/crm/phone";
import { closerNamesByLeadIds } from "@/lib/crm/leads";
import {
  ALL_STAGES,
  BOSQICH_LABELS,
  TARIF_BADGE_CLASS,
  TARIF_OPTIONS,
} from "@/lib/crm/constants";
import type { CrmLead, LeadStage, Tarif } from "@/types/crm";
import { LeadToolbar } from "./lead-toolbar";

export const dynamic = "force-dynamic";

function escapeIlike(raw: string): string {
  return raw.replace(/[%_,()\\]/g, "").trim();
}

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy");
  } catch {
    return "—";
  }
}

async function loadLeads(filters: {
  q: string;
  bosqich: string;
  tarif: string;
  closerId?: string;
}): Promise<(CrmLead & { closer_name: string | null })[]> {
  const db = crmAdmin();
  let query = db
    .from("crm_leads")
    .select("*")
    .order("yaratilgan", { ascending: false })
    .limit(50);

  if (filters.closerId) {
    const ids = await assignedLeadIds(filters.closerId);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  if (filters.bosqich && ALL_STAGES.includes(filters.bosqich as LeadStage)) {
    query = query.eq("bosqich", filters.bosqich);
  }
  if (filters.tarif && TARIF_OPTIONS.includes(filters.tarif as Tarif)) {
    query = query.eq("tarif", filters.tarif);
  }
  const q = escapeIlike(filters.q);
  if (q) {
    query = query.or(`ism.ilike.%${q}%,telefon.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const leads = (data ?? []) as CrmLead[];
  const closers = await closerNamesByLeadIds(leads.map((l) => l.id));
  return leads.map((lead) => ({
    ...lead,
    closer_name: closers.get(lead.id) ?? null,
  }));
}

export default async function LeadListPage({
  searchParams,
}: {
  searchParams: { q?: string; bosqich?: string; tarif?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const bosqich = searchParams.bosqich?.trim() ?? "";
  const tarif = searchParams.tarif?.trim() ?? "";
  const crmUser = await getCrmUser();
  const closerId = crmUser?.role === "closer" ? crmUser.id : undefined;

  let leads: Awaited<ReturnType<typeof loadLeads>> = [];
  let loadError: string | null = null;
  try {
    leads = await loadLeads({ q, bosqich, tarif, closerId });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leadlar</h1>
        <p className="text-sm text-muted-foreground">Ro&apos;yxat — oxirgi 50</p>
      </div>

      <LeadToolbar q={q} bosqich={bosqich} tarif={tarif} />

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {leads.length === 0 && !loadError ? (
        <p className="text-sm text-muted-foreground">Lead topilmadi.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ism</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Tarif</TableHead>
              <TableHead>Manba</TableHead>
              <TableHead>Bosqich</TableHead>
              <TableHead>Yaratilgan</TableHead>
              <TableHead>Closer</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const href = `/crm/lead/${lead.id}`;
              return (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link href={href} className="font-medium hover:underline">
                      {lead.ism}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {maskPhone(lead.telefon)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        TARIF_BADGE_CLASS[lead.tarif as Tarif] ??
                        TARIF_BADGE_CLASS.noma_lum
                      }
                    >
                      {lead.tarif}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{lead.manba}</Badge>
                  </TableCell>
                  <TableCell>
                    {BOSQICH_LABELS[lead.bosqich as LeadStage] ?? lead.bosqich}
                  </TableCell>
                  <TableCell>{formatCreated(lead.yaratilgan)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.closer_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>Ko&apos;rish</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
