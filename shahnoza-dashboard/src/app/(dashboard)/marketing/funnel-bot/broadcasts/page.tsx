"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("uz", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function FunnelBotBroadcastsPage() {
  const [status, setStatus] = useState("all");
  const [segment, setSegment] = useState("all");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);

  const utils = api.useUtils();
  const filter = {
    status: status === "all" ? undefined : status,
    segment: segment === "all" ? undefined : segment,
  };
  const { data: recipients } = api.marketing.funnelBotSubscribers.useQuery(filter);
  const { data: history, isLoading: histLoading } = api.marketing.funnelBotBroadcasts.useQuery();

  const send = api.marketing.funnelBotBroadcast.useMutation({
    onSuccess: (r) => {
      toast({ title: `Yuborildi: ${r.sent}/${r.total}`, description: r.failed ? `${r.failed} ta yuborilmadi` : undefined, variant: "success" });
      setText("");
      setConfirm(false);
      void utils.marketing.funnelBotBroadcasts.invalidate();
    },
    onError: (e) => {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
      setConfirm(false);
    },
  });

  const count = recipients?.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Xabar yuborish" description="Tanlangan segmentga bir martalik xabar yuboring (broadcast)." />
      <FunnelBotTabs />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status bo'yicha</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barchasi</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Segment bo'yicha</label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barchasi</SelectItem>
                  {Object.entries(SEGMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Xabar matni ([ism] — ismga almashadi)</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Assalomu alaykum [ism]! Bugun maxsus taklif…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Qabul qiluvchilar: <span className="font-medium text-foreground">{count}</span>
              {count > 300 ? <span className="text-amber-600"> (bir martada 300 tagacha)</span> : null}
            </div>
            <Button disabled={!text.trim() || count === 0} onClick={() => setConfirm(true)}>
              <Send className="h-4 w-4 mr-1.5" /> Yuborish
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* history */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold mb-3">Yuborilgan xabarlar</h3>
          {histLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hali xabar yuborilmagan. (Tarix ko'rinishi uchun 0048 SQL ni qo'llang — yuborish busiz ham ishlaydi.)</p>
          ) : (
            <div className="space-y-2">
              {history.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 border-b last:border-0 pb-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{b.text}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(b.created_at)}
                      {b.filter_status ? ` · ${STATUS_LABEL[b.filter_status] ?? b.filter_status}` : ""}
                      {b.filter_segment ? ` · ${SEGMENT_LABEL[b.filter_segment] ?? b.filter_segment}` : ""}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{b.sent}/{b.total}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* confirm */}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xabar yuborilsinmi?</DialogTitle>
            <DialogDescription>
              Bu xabar <b>{count}</b> ta odamga darhol yuboriladi. Bekor qilib bo'lmaydi.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">{text}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={send.isPending}>Bekor</Button>
            <Button onClick={() => send.mutate({ ...filter, text })} disabled={send.isPending}>
              {send.isPending ? "Yuborilmoqda…" : `${count} ta odamga yuborish`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
