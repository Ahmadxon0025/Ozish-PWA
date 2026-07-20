"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Users2 } from "lucide-react";
import { LeadTabs } from "@/components/leads/lead-tabs";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/constants";

const ALL = "all";

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

export default function LeadsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [assignedTo, setAssignedTo] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const funnel = api.leads.funnel.useQuery();
  const users = api.users.list.useQuery({ activeOnly: true });
  const leads = api.leads.list.useQuery({
    search: search.trim() || undefined,
    status: status === ALL ? undefined : status,
    assignedTo: assignedTo === ALL ? undefined : assignedTo,
    page,
    pageSize,
  });

  const data = leads.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const funnelKeys: { key: string; tone: "default" | "success" | "destructive" }[] =
    [
      { key: "new", tone: "default" },
      { key: "qualified", tone: "default" },
      { key: "won", tone: "success" },
      { key: "lost", tone: "destructive" },
    ];

  return (
    <div>
      <PageHeader
        title="Leadlar"
        description="Barcha potentsial mijozlar va ularning holati."
      />

      <LeadTabs />

      {/* Funnel summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {funnel.isLoading || !funnel.data
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))
          : funnelKeys.map(({ key, tone }) => (
              <KpiCard
                key={key}
                label={statusLabel(key)}
                value={String(funnel.data?.[key] ?? 0)}
                tone={tone}
              />
            ))}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ism, telefon, email bo'yicha qidirish…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Holat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Hammasi</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={assignedTo}
          onValueChange={(v) => {
            setAssignedTo(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="Mas'ul" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Hammasi</SelectItem>
            {(users.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="mt-4">
        {leads.isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="Lead topilmadi"
            description="Filtrlarni o'zgartiring yoki yangi leadlar kirishini kuting."
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden sm:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ism</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Manba</TableHead>
                      <TableHead>Mas&apos;ul</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>Yaratilgan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/leads/${l.id}`}
                            className="text-primary hover:underline"
                          >
                            {l.full_name || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>{l.phone || "—"}</TableCell>
                        <TableCell>{l.utm_source || "—"}</TableCell>
                        <TableCell>{l.assignedName}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(l.status)}>
                            {statusLabel(l.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(l.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Mobile stacked cards */}
            <div className="space-y-3 sm:hidden">
              {items.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="block">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {l.full_name || "—"}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {l.phone || "—"}
                          </p>
                        </div>
                        <Badge variant={statusVariant(l.status)}>
                          {statusLabel(l.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Mas&apos;ul: {l.assignedName}</span>
                        <span>{formatDate(l.created_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {items.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} ta lead · {page}/{totalPages}-sahifa
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Oldingi
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Keyingi <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
