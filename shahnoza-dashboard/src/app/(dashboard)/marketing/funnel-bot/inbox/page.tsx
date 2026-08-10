"use client";

import { useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { FunnelBotTabs } from "../_tabs";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("uz", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function FunnelBotInboxPage() {
  const [active, setActive] = useState<string | null>(null);
  const { data: convos, isLoading } = api.marketing.funnelBotConversations.useQuery();

  return (
    <div className="space-y-5">
      <PageHeader title="Suhbatlar" description="Botga javob yozgan odamlar — bu yerdan javob bering (drip to'xtaydi)." />
      <FunnelBotTabs />

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        {/* conversation list */}
        <Card className="h-fit">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : !convos || convos.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Hozircha javob yozgan odam yo'q.</div>
            ) : (
              <div className="divide-y max-h-[70vh] overflow-y-auto">
                {convos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive(c.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
                      active === c.id && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.first_name ?? "—"}{c.username ? ` @${c.username}` : ""}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(c.at)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.preview}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* thread */}
        <Card className="min-h-[60vh]">
          <CardContent className="p-0 h-full">
            {active ? <Thread subscriberId={active} /> : (
              <div className="flex h-[60vh] flex-col items-center justify-center text-sm text-muted-foreground">
                <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
                Suhbatni tanlang
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Thread({ subscriberId }: { subscriberId: string }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.marketing.funnelBotThread.useQuery({ subscriberId });
  const [text, setText] = useState("");
  const reply = api.marketing.funnelBotReply.useMutation({
    onSuccess: () => {
      setText("");
      void utils.marketing.funnelBotThread.invalidate({ subscriberId });
      void utils.marketing.funnelBotConversations.invalidate();
    },
    onError: (e) => toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });
  const sub = data?.subscriber as { first_name?: string | null; username?: string | null; phone?: string | null } | null;

  return (
    <div className="flex h-[70vh] flex-col">
      <div className="border-b px-4 py-2.5 text-sm">
        <span className="font-medium">{sub?.first_name ?? "—"}{sub?.username ? ` @${sub.username}` : ""}</span>
        {sub?.phone ? <span className="text-muted-foreground"> · {sub.phone}</span> : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={cn("h-10 w-2/3", i % 2 && "ml-auto")} />)
        ) : (
          (data?.thread ?? []).map((m, i) => (
            <div key={i} className={cn("flex", m!.direction === "out" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                  m!.direction === "out"
                    ? m!.human
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                    : "bg-emerald-500/10 border border-emerald-500/20",
                )}
              >
                {m!.text}
                <div className={cn("text-[10px] mt-1 opacity-60")}>{fmtTime(m!.at)}{m!.human ? " · siz" : ""}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t p-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Javob yozing…"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) reply.mutate({ subscriberId, text });
          }}
        />
        <Button onClick={() => reply.mutate({ subscriberId, text })} disabled={!text.trim() || reply.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
