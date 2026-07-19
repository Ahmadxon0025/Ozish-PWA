"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  ShieldAlert,
  RefreshCw,
  Link2,
  Send,
  Copy,
  CheckCircle2,
  XCircle,
  History,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

function BoolBadge({
  value,
  yes,
  no,
}: {
  value: boolean;
  yes: string;
  no: string;
}) {
  return value ? (
    <Badge variant="success">{yes}</Badge>
  ) : (
    <Badge variant="secondary">{no}</Badge>
  );
}

function AmocrmBanner() {
  const params = useSearchParams();
  const status = params.get("amocrm");
  const message = params.get("message");

  if (status === "connected") {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>amoCRM muvaffaqiyatli ulandi.</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        <XCircle className="h-4 w-4 shrink-0" />
        <span>{message || "amoCRM ulanishida xatolik yuz berdi."}</span>
      </div>
    );
  }

  return null;
}

export default function IntegrationsPage() {
  const me = api.users.me.useQuery();
  const status = api.integrations.status.useQuery(undefined, {
    retry: false,
    enabled: me.data?.role === "super_admin",
  });

  if (me.isLoading) {
    return (
      <div>
        <PageHeader title="Integratsiyalar" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (me.data?.role !== "super_admin") {
    return (
      <div>
        <PageHeader title="Integratsiyalar" />
        <EmptyState
          icon={ShieldAlert}
          title="Ruxsat yo'q"
          description="Bu bo'lim faqat Super Admin uchun."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Integratsiyalar"
        description="amoCRM, Telegram va xavfsizlik sozlamalarini boshqaring."
      />

      <Suspense fallback={null}>
        <AmocrmBanner />
      </Suspense>

      {status.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : status.isError || !status.data ? (
        <EmptyState
          icon={ShieldAlert}
          title="Ruxsat yo'q yoki sozlanmagan"
          description="Integratsiya holatini yuklab bo'lmadi."
        />
      ) : (
        <>
          <Tabs defaultValue="amocrm">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="amocrm" className="flex-1 sm:flex-none">
                amoCRM
              </TabsTrigger>
              <TabsTrigger value="telegram" className="flex-1 sm:flex-none">
                Telegram
              </TabsTrigger>
              <TabsTrigger value="security" className="flex-1 sm:flex-none">
                Xavfsizlik
              </TabsTrigger>
            </TabsList>

            <TabsContent value="amocrm">
              <AmocrmCard amocrm={status.data.amocrm} />
            </TabsContent>

            <TabsContent value="telegram">
              <TelegramCard telegram={status.data.telegram} />
            </TabsContent>

            <TabsContent value="security">
              <SecurityCard security={status.data.security} />
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <SyncLogsCard />
          </div>
        </>
      )}
    </div>
  );
}

function AmocrmCard({
  amocrm,
}: {
  amocrm: {
    configured: boolean;
    connected: boolean;
    expiresAt: string | null;
    subdomain: string | null;
    redirectUri: string;
  };
}) {
  const utils = api.useUtils();

  const sync = api.integrations.triggerAmocrmSync.useMutation({
    onSuccess: (res) => {
      void utils.integrations.syncLogs.invalidate();
      void utils.integrations.status.invalidate();
      if (res.ok) {
        toast({
          title: "Sinxronlash tugadi",
          description: `Lidlar: ${res.leads} · Sotuvlar: ${res.sales} · Foydalanuvchilar: ${res.users}`,
          variant: "success",
        });
      } else {
        toast({
          title: "Sinxronlash xatosi",
          description: res.error || "Noma'lum xatolik.",
          variant: "destructive",
        });
      }
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Sinxronlashni ishga tushirib bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  function copyRedirect() {
    void navigator.clipboard?.writeText(amocrm.redirectUri).then(
      () =>
        toast({ title: "Nusxalandi", variant: "success" }),
      () =>
        toast({
          title: "Nusxalab bo'lmadi",
          variant: "destructive",
        }),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          amoCRM
        </CardTitle>
        <CardDescription>CRM ulanishi va sinxronlash.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <BoolBadge
            value={amocrm.configured}
            yes="Sozlangan"
            no="Sozlanmagan"
          />
          <BoolBadge value={amocrm.connected} yes="Ulangan" no="Ulanmagan" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subdomen</Label>
            <p className="text-sm font-medium">{amocrm.subdomain || "—"}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Token muddati
            </Label>
            <p className="text-sm font-medium">
              {amocrm.expiresAt ? formatDateTime(amocrm.expiresAt) : "—"}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="redirect-uri">Redirect URI</Label>
          <div className="flex items-center gap-2">
            <Input
              id="redirect-uri"
              value={amocrm.redirectUri}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyRedirect}
              aria-label="Nusxalash"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <a href="/api/auth/amocrm/authorize">
              <Link2 className="h-4 w-4" />
              Ulash / Qayta ulash
            </a>
          </Button>
          <Button
            variant="outline"
            disabled={!amocrm.connected || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Hozir sinxronlash
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TelegramCard({
  telegram,
}: {
  telegram: {
    configured: boolean;
    adminChatSet: boolean;
    ownerChatSet: boolean;
  };
}) {
  const test = api.integrations.sendTestReport.useMutation({
    onSuccess: (res) => {
      toast({
        title: "Yuborildi",
        description: `Admin: ${res.sent.admin ? "✓" : "—"} · Rahbar: ${
          res.sent.owner ? "✓" : "—"
        }`,
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Xatolik",
        description: err.message || "Hisobotni yuborib bo'lmadi.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Bildirishnomalar va hisobotlar sozlamalari.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <BoolBadge
            value={telegram.configured}
            yes="Sozlangan"
            no="Sozlanmagan"
          />
          <BoolBadge
            value={telegram.adminChatSet}
            yes="Admin chat ✓"
            no="Admin chat yo'q"
          />
          <BoolBadge
            value={telegram.ownerChatSet}
            yes="Rahbar chat ✓"
            no="Rahbar chat yo'q"
          />
        </div>

        <Button
          onClick={() => test.mutate()}
          disabled={test.isPending}
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Sinov hisobotini yuborish
        </Button>
      </CardContent>
    </Card>
  );
}

function SecurityCard({
  security,
}: {
  security: { tokenEncryption: boolean };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Xavfsizlik</CardTitle>
        <CardDescription>Token shifrlash holati.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Token shifrlash</span>
          {security.tokenEncryption ? (
            <Badge variant="success">Yoqilgan</Badge>
          ) : (
            <Badge variant="warning">
              O'chirilgan (TOKEN_ENCRYPTION_KEY qo'ying)
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SyncLogsCard() {
  const logs = api.integrations.syncLogs.useQuery({ limit: 20 });
  const items = logs.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Sinxronlash tarixi
        </CardTitle>
        <CardDescription>So'nggi sinxronlash amaliyotlari.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:px-5 sm:pb-5">
        {logs.isLoading ? (
          <div className="space-y-2 p-5 pt-0 sm:p-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 pb-5 sm:px-0 sm:pb-0">
            <EmptyState
              icon={History}
              title="Tarix bo'sh"
              description="Hali sinxronlash amaliyoti bajarilmagan."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Xizmat</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead className="text-right">Yozuvlar</TableHead>
                  <TableHead>Boshlangan</TableHead>
                  <TableHead>Xato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.service}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.status === "success"
                            ? "success"
                            : log.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {log.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {log.records_synced ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(log.started_at)}
                    </TableCell>
                    <TableCell
                      className="max-w-[220px] truncate text-destructive"
                      title={log.error_message ?? undefined}
                    >
                      {log.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
