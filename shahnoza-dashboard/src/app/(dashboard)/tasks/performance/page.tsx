"use client";

import { useMemo, useState } from "react";
import {
  Trophy,
  CheckCircle2,
  Timer,
  Clock,
  AlertTriangle,
  Users2,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { initials } from "@/lib/format";

const ALL_ROLES = "all";

/** Compute an inclusive [from, to] (YYYY-MM-DD) for a preset. */
function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (preset === "week") {
    // Monday of the current week (UTC).
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const diff = (day + 6) % 7; // days since Monday
    const monday = new Date(now.getTime() - diff * 86400000);
    return { from: monday.toISOString().slice(0, 10), to };
  }
  if (preset === "month") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: first.toISOString().slice(0, 10), to };
  }
  // 30 days (default)
  const from = new Date(now.getTime() - 30 * 86400000);
  return { from: from.toISOString().slice(0, 10), to };
}

function onTimeTone(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 80) return "text-success font-semibold";
  if (pct >= 60) return "text-warning font-semibold";
  return "text-destructive font-semibold";
}

const RANK_EMOJI = ["🥇", "🥈", "🥉"];

export default function PerformancePage() {
  const [preset, setPreset] = useState("30d");
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);

  const range = useMemo(() => presetRange(preset), [preset]);
  const perf = api.tasks.performance.useQuery(range);

  const people = (perf.data?.people ?? []).filter(
    (p) => roleFilter === ALL_ROLES || p.role === roleFilter,
  );
  const roles = perf.data?.roles ?? [];
  const totals = perf.data?.totals;

  return (
    <div>
      <PageHeader
        title="Samaradorlik"
        description="Har bir xodim va rol bo'yicha vazifa ko'rsatkichlari."
        actions={
          <div className="flex items-center gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLES}>Barcha rollar</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.role} value={r.role}>
                    {ROLE_LABELS[r.role as UserRole] ?? r.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Bu hafta</SelectItem>
                <SelectItem value="30d">30 kun</SelectItem>
                <SelectItem value="month">Bu oy</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {perf.isLoading || !totals ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Bajarilgan vazifalar"
              value={String(totals.completed)}
              sub={`${range.from} — ${range.to}`}
              icon={CheckCircle2}
              tone="success"
            />
            <KpiCard
              label="Muddatida bajarish"
              value={totals.onTimePct == null ? "—" : `${totals.onTimePct}%`}
              sub="70–80% sog'lom oraliq"
              icon={Timer}
            />
            <KpiCard
              label="Ochiq vazifalar"
              value={String(totals.open)}
              icon={Clock}
            />
            <KpiCard
              label="Muddati o'tgan"
              value={String(totals.overdue)}
              icon={AlertTriangle}
              tone={totals.overdue > 0 ? "warning" : undefined}
            />
          </>
        )}
      </div>

      {/* Leaderboard */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-primary" /> Reyting (xodimlar)
          </CardTitle>
          <CardDescription>
            Muddatida bajarish % bo&apos;yicha tartiblangan; teng bo&apos;lsa
            bajarilgan soni bo&apos;yicha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perf.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : people.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="Ma'lumot yo'q"
              description="Tanlangan davrda vazifa faoliyati topilmadi."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Xodim</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-right">Bajarildi</TableHead>
                      <TableHead className="text-right">Muddatida</TableHead>
                      <TableHead className="text-right">Yuklama</TableHead>
                      <TableHead className="text-right">Muddati o&apos;tgan</TableHead>
                      <TableHead className="text-right">O&apos;rtacha (kun)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((p, i) => (
                      <TableRow key={p.userId}>
                        <TableCell className="text-center">
                          {roleFilter === ALL_ROLES && i < 3 ? RANK_EMOJI[i] : i + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs">
                                {initials(p.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{p.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {ROLE_LABELS[p.role as UserRole] ?? p.role}
                        </TableCell>
                        <TableCell className="text-right font-medium">{p.completed}</TableCell>
                        <TableCell className={`text-right ${onTimeTone(p.onTimePct)}`}>
                          {p.onTimePct == null ? "—" : `${p.onTimePct}%`}
                        </TableCell>
                        <TableCell className="text-right">{p.workload}</TableCell>
                        <TableCell className="text-right">
                          {p.overdue > 0 ? (
                            <Badge variant="destructive">{p.overdue}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {p.avgCycleDays == null ? "—" : p.avgCycleDays}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {people.map((p, i) => (
                  <div key={p.userId} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-center">
                          {roleFilter === ALL_ROLES && i < 3 ? RANK_EMOJI[i] : i + 1}
                        </span>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initials(p.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium leading-tight">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {ROLE_LABELS[p.role as UserRole] ?? p.role}
                          </div>
                        </div>
                      </div>
                      <div className={`text-right ${onTimeTone(p.onTimePct)}`}>
                        {p.onTimePct == null ? "—" : `${p.onTimePct}%`}
                        <div className="text-[10px] font-normal text-muted-foreground">
                          muddatida
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded bg-muted/50 py-1">
                        <div className="font-semibold">{p.completed}</div>
                        <div className="text-muted-foreground">bajarildi</div>
                      </div>
                      <div className="rounded bg-muted/50 py-1">
                        <div className="font-semibold">{p.workload}</div>
                        <div className="text-muted-foreground">yuklama</div>
                      </div>
                      <div className="rounded bg-muted/50 py-1">
                        <div className={`font-semibold ${p.overdue > 0 ? "text-destructive" : ""}`}>
                          {p.overdue}
                        </div>
                        <div className="text-muted-foreground">o&apos;tgan</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Per-role roll-up */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Rollar bo&apos;yicha</CardTitle>
          <CardDescription>Jamoa/rol darajasidagi ko&apos;rsatkichlar.</CardDescription>
        </CardHeader>
        <CardContent>
          {perf.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : roles.length === 0 ? (
            <EmptyState icon={Users2} title="Ma'lumot yo'q" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Xodim</TableHead>
                  <TableHead className="text-right">Bajarildi</TableHead>
                  <TableHead className="text-right">Muddatida</TableHead>
                  <TableHead className="text-right">Ochiq</TableHead>
                  <TableHead className="text-right">Muddati o&apos;tgan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.role}>
                    <TableCell className="font-medium">
                      {ROLE_LABELS[r.role as UserRole] ?? r.role}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.people}</TableCell>
                    <TableCell className="text-right">{r.completed}</TableCell>
                    <TableCell className={`text-right ${onTimeTone(r.onTimePct)}`}>
                      {r.onTimePct == null ? "—" : `${r.onTimePct}%`}
                    </TableCell>
                    <TableCell className="text-right">{r.open}</TableCell>
                    <TableCell className="text-right">
                      {r.overdue > 0 ? (
                        <Badge variant="destructive">{r.overdue}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Izoh: muddatida bajarish 70–80% bo&apos;lsa sog&apos;lom; 90%+ — rejalar
        yengil bo&apos;lishi mumkin; 60% dan past — yuklama yoki muddatlar
        haqiqiy emas. Reyting jazolash uchun emas, yordam kerak bo&apos;lgan
        joyni ko&apos;rsatish uchun.
      </p>
    </div>
  );
}
