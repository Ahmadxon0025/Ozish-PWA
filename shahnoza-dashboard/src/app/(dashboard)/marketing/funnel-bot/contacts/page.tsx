"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FunnelBotTabs } from "../_tabs";

const STATUS_LABEL: Record<string, string> = {
  active: "Faol",
  lead: "Lead",
  call_requested: "Qo'ng'iroq",
  replied: "Javob berdi",
  cold: "Sovuq",
  stopped: "To'xtatilgan",
};
const SEGMENT_LABEL: Record<string, string> = {
  tajriba: "Tajriba yo'q",
  vaqt: "Vaqt yo'q",
  pul: "Pul",
  ishonch: "Ishonmaydi",
};
const STATUSES = ["active", "lead", "call_requested", "replied", "cold", "stopped"] as const;

function statusVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "lead" || s === "call_requested") return "default";
  if (s === "cold" || s === "stopped") return "outline";
  return "secondary";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("uz", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function FunnelBotContactsPage() {
  const [status, setStatus] = useState<string>("all");
  const [segment, setSegment] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data, isLoading } = api.marketing.funnelBotSubscribers.useQuery({
    status: status === "all" ? undefined : status,
    segment: segment === "all" ? undefined : segment,
    search: search || undefined,
  });
  const setStatusMut = api.marketing.setSubscriberStatus.useMutation({
    onSuccess: () => {
      toast({ title: "Status yangilandi", variant: "success" });
      void utils.marketing.funnelBotSubscribers.invalidate();
      void utils.marketing.funnelBotJourney.invalidate();
    },
    onError: (e) => toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Bot kontaktlari" description="Botga kirgan barcha odamlar — filtrlab, har birining yo'lini ko'ring." />
      <FunnelBotTabs />

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Ism, raqam, shahar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Segment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha segment</SelectItem>
            {Object.entries(SEGMENT_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Hozircha kontakt yo'q.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2.5 px-4 font-medium">Ism</th>
                    <th className="py-2.5 px-3 font-medium">Raqam</th>
                    <th className="py-2.5 px-3 font-medium">Segment</th>
                    <th className="py-2.5 px-3 font-medium">Shahar</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Qo'shildi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                    >
                      <td className="py-2.5 px-4">
                        {r.first_name ?? "—"}
                        {r.username ? <span className="text-muted-foreground"> @{r.username}</span> : null}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">{r.phone ?? "—"}</td>
                      <td className="py-2.5 px-3">{r.segment ? SEGMENT_LABEL[r.segment] ?? r.segment : "—"}</td>
                      <td className="py-2.5 px-3">{r.city ?? "—"}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {data ? <p className="text-xs text-muted-foreground">{data.length} ta kontakt</p> : null}

      {/* journey drawer */}
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Kontakt yo'li</DialogTitle></DialogHeader>
          {openId ? <Journey subscriberId={openId} onStatus={(st) => setStatusMut.mutate({ id: openId, status: st })} busy={setStatusMut.isPending} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Journey({
  subscriberId,
  onStatus,
  busy,
}: {
  subscriberId: string;
  onStatus: (s: (typeof STATUSES)[number]) => void;
  busy: boolean;
}) {
  const { data, isLoading } = api.marketing.funnelBotJourney.useQuery({ subscriberId });
  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>;
  const sub = data?.subscriber as
    | { first_name?: string; username?: string; phone?: string; city?: string; segment?: string; status?: string }
    | null;
  return (
    <div className="space-y-4">
      <div className="text-sm">
        <div className="font-medium">{sub?.first_name ?? "—"}{sub?.username ? ` @${sub.username}` : ""}</div>
        <div className="text-muted-foreground">
          {sub?.phone ?? "raqam yo'q"} · {sub?.city ?? "—"} · {sub?.segment ? SEGMENT_LABEL[sub.segment] ?? sub.segment : "segment yo'q"}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Statusni o'zgartirish</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={busy || sub?.status === s}
              onClick={() => onStatus(s)}
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-default"
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Xabarlar tarixi</div>
        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {(data?.log ?? []).map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={l.direction === "out" ? "text-primary" : "text-emerald-600"}>{l.direction === "out" ? "→" : "←"}</span>
              <span className="text-muted-foreground w-24 shrink-0">{fmtDate(l.created_at)}</span>
              <span className="flex-1">
                <span className="text-muted-foreground">{l.step_id} · {l.kind}</span>
                {l.detail ? <span> — {l.detail}</span> : null}
              </span>
            </div>
          ))}
          {(data?.log ?? []).length === 0 ? <div className="text-xs text-muted-foreground">Tarix yo'q.</div> : null}
        </div>
      </div>
    </div>
  );
}
