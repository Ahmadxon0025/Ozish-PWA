"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  DollarSign,
  ShoppingCart,
  Wallet,
  Mail,
  Phone,
  UserX,
  ShoppingBag,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  MonthSelect,
  currentMonthValue,
} from "@/components/dashboard/month-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatUsd, formatNumber, formatDate, initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";

export default function SalesPersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [month, setMonth] = useState<string>(currentMonthValue());

  const detail = api.sales.byPerson.useQuery({ userId: id, month });
  const d = detail.data;
  const user = d?.user;

  const backLink = (
    <Button variant="outline" size="sm" asChild>
      <Link href="/sales/team">
        <ArrowLeft className="h-4 w-4" />
        Jamoa
      </Link>
    </Button>
  );

  if (detail.isLoading) {
    return (
      <div>
        <PageHeader title="Sotuvchi" actions={backLink} />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader title="Sotuvchi" actions={backLink} />
        <EmptyState
          icon={UserX}
          title="Topilmadi"
          description="Bunday sotuvchi mavjud emas yoki o'chirilgan."
        />
      </div>
    );
  }

  const sales = d?.sales ?? [];

  return (
    <div>
      <PageHeader
        title={user.full_name}
        actions={
          <div className="flex items-center gap-2">
            <MonthSelect value={month} onChange={setMonth} />
            {backLink}
          </div>
        }
      />

      {/* Profile header */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16">
            {user.avatar_url && (
              <AvatarImage src={user.avatar_url} alt={user.full_name} />
            )}
            <AvatarFallback className="text-lg">
              {initials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{user.full_name}</p>
            {user.role && (
              <Badge variant="secondary" className="mt-1">
                {ROLE_LABELS[user.role as UserRole] ?? user.role}
              </Badge>
            )}
            <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-4">
              {user.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {user.email}
                </span>
              )}
              {user.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {user.phone}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Savdo"
          value={formatUsd(d?.revenue ?? 0)}
          icon={DollarSign}
          tone="success"
        />
        <KpiCard
          label="Bitimlar soni"
          value={formatNumber(d?.count ?? 0)}
          icon={ShoppingCart}
        />
        <KpiCard
          label="Komissiya"
          value={formatUsd(d?.commission ?? 0)}
          icon={Wallet}
          tone="warning"
        />
      </div>

      {/* Sales table */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Sotuvlar</CardTitle>
        </CardHeader>
        <CardContent className={sales.length === 0 ? "" : "p-0"}>
          {sales.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Sotuv yo'q"
              description="Tanlangan oyda bu sotuvchining sotuvlari yo'q."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(s.sold_at)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatUsd(s.total_amount_usd)}
                    </TableCell>
                    <TableCell>
                      {s.is_refunded ? (
                        <Badge variant="destructive">Qaytarilgan</Badge>
                      ) : (
                        <Badge variant="success">To'landi</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
