"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Frown } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatUsd, formatDate, formatDateTime } from "@/lib/format";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import { PaymentsPanel } from "@/components/leads/payments-panel";

const NONE = "none";

function statusVariant(
  status: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (status) {
    case "won":
      return "success";
    case "lost":
      return "destructive";
    case "qualified":
      return "default";
    case "new":
      return "secondary";
    default:
      return "secondary";
  }
}

function statusLabel(status: string) {
  return LEAD_STATUS_LABELS[status] ?? status;
}

function dotClass(kind: string) {
  switch (kind) {
    case "won":
      return "bg-success";
    case "lost":
      return "bg-destructive";
    case "new":
      return "bg-primary";
    case "refund":
      return "bg-warning";
    case "qualified":
      return "bg-primary/60";
    default:
      return "bg-muted-foreground";
  }
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const utils = api.useUtils();

  const query = api.leads.byId.useQuery({ id }, { retry: false });
  const users = api.users.list.useQuery({ activeOnly: true });

  const [newStatus, setNewStatus] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");

  const updateStatus = api.leads.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.leads.byId.invalidate({ id });
      setNewStatus(null);
      setLostReason("");
      toast({ title: "Holat yangilandi" });
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const assign = api.leads.assign.useMutation({
    onSuccess: async () => {
      await utils.leads.byId.invalidate({ id });
      toast({ title: "Mas'ul yangilandi" });
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const backLink = (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/leads">
        <ArrowLeft className="h-4 w-4" /> Leadlar
      </Link>
    </Button>
  );

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Lead" actions={backLink} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="Lead" actions={backLink} />
        <EmptyState
          icon={Frown}
          title="Lead topilmadi"
          description="Bu lead o'chirilgan bo'lishi yoki mavjud bo'lmasligi mumkin."
          action={
            <Button asChild variant="outline">
              <Link href="/leads">Leadlar ro&apos;yxatiga qaytish</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { lead, sales, source, assignee, timeline } = query.data;
  const effectiveStatus = newStatus ?? lead.status;

  return (
    <div>
      <PageHeader
        title={lead.full_name || "Nomsiz lead"}
        description={lead.phone || undefined}
        actions={backLink}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Ma&apos;lumotlar</CardTitle>
              <Badge variant={statusVariant(lead.status)}>
                {statusLabel(lead.status)}
              </Badge>
            </CardHeader>
            <CardContent className="divide-y">
              <InfoRow label="Ism" value={lead.full_name} />
              <InfoRow label="Telefon" value={lead.phone} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow
                label="Telegram"
                value={lead.telegram_username}
              />
              <InfoRow label="Manba" value={source?.name ?? ""} />
              <InfoRow label="UTM manba" value={lead.utm_source} />
              <InfoRow label="Mas'ul" value={assignee?.full_name ?? ""} />
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amallar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Holatni o&apos;zgartirish</Label>
                <Select
                  value={effectiveStatus}
                  onValueChange={(v) => setNewStatus(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveStatus === "lost" && (
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="lostReason">Yo&apos;qotish sababi</Label>
                    <Input
                      id="lostReason"
                      placeholder="Masalan: narx qimmat, javob bermadi…"
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                    />
                  </div>
                )}
                {newStatus && newStatus !== lead.status && (
                  <Button
                    className="w-full"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      updateStatus.mutate({
                        id,
                        status: newStatus,
                        lostReason:
                          newStatus === "lost"
                            ? lostReason.trim() || undefined
                            : undefined,
                      })
                    }
                  >
                    {updateStatus.isPending ? "Saqlanmoqda…" : "Holatni saqlash"}
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Mas&apos;ul xodim</Label>
                <Select
                  value={lead.assigned_to ?? NONE}
                  onValueChange={(v) =>
                    assign.mutate({ id, userId: v === NONE ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Belgilanmagan</SelectItem>
                    {(users.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <PaymentsPanel leadId={id} />
        </div>

        {/* Right column: timeline + sales */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tarix</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Hodisalar yo&apos;q.</p>
              ) : (
                <ol className="relative space-y-5 border-l border-border pl-5">
                  {timeline.map(
                    (
                      t: { at: string; label: string; kind: string },
                      i: number,
                    ) => (
                    <li key={i} className="relative">
                      <span
                        className={`absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full ring-4 ring-background ${dotClass(
                          t.kind,
                        )}`}
                      />
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(t.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sotuvlar</CardTitle>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Bu leadda sotuv yo&apos;q.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sales.map(
                    (s: {
                      id: string;
                      total_amount_usd: number | null;
                      sold_at: string | null;
                    }) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <span className="font-medium">
                        {formatUsd(s.total_amount_usd)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(s.sold_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
