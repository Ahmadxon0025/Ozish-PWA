"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CronRobotResult } from "@/lib/crm/robots";

type StatusPayload = {
  ts: string | null;
  results: CronRobotResult[];
  error?: string;
};

const ROBOT_LABELS: Record<string, string> = {
  robotAssignCloser: "Closer tayinlash",
  robotStaleNewLead: "Eski yangi lead",
  robotOverdueFollowUp: "Kechikkan aloqa",
  robotDebtReminder: "Qarz eslatmasi",
  robotNpsTrigger: "NPS so'rovi",
  robotWeeklyStats: "Haftalik statistika",
};

function formatTs(iso: string | null): string {
  if (!iso) return "Hali ishlamagan";
  try {
    return format(parseISO(iso), "dd.MM.yyyy HH:mm");
  } catch {
    return iso;
  }
}

export function CronPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/crm/cron/status");
    const json = (await res.json()) as StatusPayload;
    if (!res.ok) {
      setLoadError(json.error ?? "Status o'qilmadi");
      return;
    }
    setStatus(json);
  }, []);

  useEffect(() => {
    void load().catch(() => setLoadError("Status o'qilmadi"));
  }, [load]);

  async function runNow() {
    setRunning(true);
    setRunError(null);
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET ?? "";
      const res = await fetch("/api/crm/cron", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRunError(json.error ?? "Ishga tushmadi");
        return;
      }
      await load();
    } catch {
      setRunError("Ishga tushmadi");
    } finally {
      setRunning(false);
    }
  }

  const results = status?.results ?? [];
  const hasError = results.some((r) => Boolean(r.error));
  const ran = Boolean(status?.ts);

  return (
    <Card
      className={
        !ran
          ? undefined
          : hasError
            ? "border-red-300"
            : "border-green-300"
      }
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Cron holati</CardTitle>
          <p className="text-sm text-muted-foreground">
            Oxirgi ishga tushirish: {formatTs(status?.ts ?? null)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ran ? (
            <Badge variant={hasError ? "destructive" : "success"}>
              {hasError ? "Xato bor" : "Yaxshi"}
            </Badge>
          ) : null}
          <Button type="button" size="sm" disabled={running} onClick={() => void runNow()}>
            {running ? "Ishlamoqda…" : "Hozir ishga tushir"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {runError ? <p className="text-sm text-destructive">{runError}</p> : null}

        {results.length === 0 && !loadError ? (
          <p className="text-sm text-muted-foreground">
            Cron hali ishlamagan. Tugma yoki tashqi cron orqali ishga tushiring.
          </p>
        ) : results.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Robot</TableHead>
                <TableHead>Affected</TableHead>
                <TableHead>Xato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow key={row.robot}>
                  <TableCell className="font-medium">
                    {ROBOT_LABELS[row.robot] ?? row.robot}
                  </TableCell>
                  <TableCell>{row.affected}</TableCell>
                  <TableCell>
                    {row.error ? (
                      <span className="text-sm text-red-600">{row.error}</span>
                    ) : (
                      <span className="text-sm text-green-600">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
