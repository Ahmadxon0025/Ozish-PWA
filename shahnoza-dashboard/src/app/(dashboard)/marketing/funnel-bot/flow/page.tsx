"use client";

import { useState } from "react";
import { Clock, Image as ImageIcon, Link2, MessageSquare, Save } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { FunnelBotTabs } from "../_tabs";

const CARD_W = 244;
const CARD_H = 116;

const TYPE: Record<string, { color: string; label: string }> = {
  message: { color: "#2f80ed", label: "Xabar" },
  continue: { color: "#2f80ed", label: "Xabar" },
  buttons: { color: "#8b5cf6", label: "Tugma" },
  ask_phone: { color: "#14b8a6", label: "Raqam" },
  ask_text: { color: "#14b8a6", label: "Javob" },
  delay: { color: "#f59e0b", label: "Kutish" },
  action: { color: "#22c55e", label: "Amal" },
  end: { color: "#f43f5e", label: "Yakun" },
};

const nameSample = (s: string) => s.replace(/\[ism\]/g, "ism");

type FlowStep = {
  id: string;
  type: string;
  editableText: boolean;
  defaultText: string | null;
  text: string | null;
  isDelay: boolean;
  defaultMinutes: number | null;
  minutes: number | null;
  mediaKey: string | null;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaFileId: string | null;
  urlButtons: Array<{ index: number; label: string; defaultUrl: string; url: string | null }>;
};
type GraphNode = { id: string; type: string; label: string; x: number; y: number; sent: number; advanced: number | null; ctr: number | null };

export default function FunnelBotFlowPage() {
  const { data: graph, isLoading } = api.marketing.funnelBotGraph.useQuery();
  const { data: flow } = api.marketing.funnelBotFlow.useQuery();
  const [selected, setSelected] = useState<string | null>(null);

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const posById = new Map(nodes.map((n) => [n.id, n]));
  const flowById = new Map((flow ?? []).map((s) => [s.id, s as FlowStep]));
  const width = Math.max(600, ...nodes.map((n) => n.x + CARD_W + 80));
  const height = Math.max(400, ...nodes.map((n) => n.y + CARD_H + 60));

  const selectedNode = selected ? posById.get(selected) : null;
  const selectedStep = selected ? flowById.get(selected) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title="Voronka xaritasi" description="Botning to'liq oqimi. Har qanday qadamni bosing — statistikasi va tahriri o'ng tomonda ochiladi." />
      <FunnelBotTabs />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries({ Xabar: "#2f80ed", Tugma: "#8b5cf6", Kutish: "#f59e0b", "Raqam/Javob": "#14b8a6", Amal: "#22c55e", Yakun: "#f43f5e" }).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {k}</span>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : (
        <div className="overflow-auto rounded-xl border bg-[#0e1621]" style={{ maxHeight: "72vh" }}>
          <div className="relative" style={{ width, height }}>
            <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
              {edges.map((e, i) => {
                const a = posById.get(e.from);
                const b = posById.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + CARD_W, y1 = a.y + CARD_H / 2, x2 = b.x, y2 = b.y + CARD_H / 2;
                const dx = Math.max(40, Math.abs(x2 - x1) / 2);
                return (
                  <g key={i}>
                    <path d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill="none" stroke="#33475b" strokeWidth={2} />
                    {e.label ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} fill="#7d8e9e" fontSize={11} textAnchor="middle">{e.label.length > 18 ? e.label.slice(0, 18) + "…" : e.label}</text> : null}
                  </g>
                );
              })}
            </svg>

            {nodes.map((n: GraphNode) => {
              const meta = TYPE[n.type] ?? { color: "#64748b", label: n.type };
              const isSel = selected === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelected(n.id)}
                  className={cn("absolute rounded-xl border text-left shadow-sm overflow-hidden transition-all hover:brightness-110", isSel && "ring-2 ring-primary")}
                  style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, background: "#182533", borderColor: isSel ? meta.color : "#22344a" }}
                >
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: meta.color + "22" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                    <span className="text-[11px] font-medium" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[10px] text-slate-500 ml-auto font-mono">{n.id}</span>
                  </div>
                  <div className="px-2.5 py-1.5 text-[12px] leading-snug text-slate-200 line-clamp-2 h-[46px]">{nameSample(n.label)}</div>
                  <div className="flex items-center gap-3 px-2.5 py-1 text-[10px] border-t" style={{ borderColor: "#22344a" }}>
                    <span className="text-slate-400">Yuborildi <b className="text-slate-200">{n.sent}</b></span>
                    {n.ctr !== null ? <span className="text-slate-400">CTR <b className={n.ctr >= 50 ? "text-emerald-400" : n.ctr >= 20 ? "text-slate-200" : "text-amber-400"}>{n.ctr}%</b></span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Suring — chapdan o'ngga to'liq voronka. Qadamni bosib tahrirlang.</p>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetTitle className="mb-1">Qadam: {selected}</SheetTitle>
          {selectedNode ? (
            <div className="text-xs text-muted-foreground mb-4">
              Yuborildi: <b className="text-foreground">{selectedNode.sent}</b>
              {selectedNode.ctr !== null ? <> · CTR: <b className="text-foreground">{selectedNode.ctr}%</b></> : null}
            </div>
          ) : null}
          {selectedStep ? <EditPanel step={selectedStep} /> : <p className="text-sm text-muted-foreground">Bu qadamda tahrirlanadigan narsa yo'q.</p>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const MEDIA_KIND: Record<string, string> = { photo: "rasm", video: "video", voice: "ovoz", document: "hujjat" };

function EditPanel({ step }: { step: FlowStep }) {
  const utils = api.useUtils();
  const [text, setText] = useState(step.text ?? step.defaultText ?? "");
  const [minutes, setMinutes] = useState<string>(String(step.minutes ?? step.defaultMinutes ?? 0));
  const [media, setMedia] = useState(step.mediaUrl ?? step.mediaFileId ?? "");
  const [btns, setBtns] = useState<Record<number, string>>(() => Object.fromEntries((step.urlButtons ?? []).map((b) => [b.index, b.url ?? b.defaultUrl ?? ""])));

  const saveText = api.marketing.saveStepText.useMutation();
  const saveMin = api.marketing.saveStepMinutes.useMutation();
  const saveMedia = api.marketing.saveMedia.useMutation();
  const saveBtn = api.marketing.saveStepButton.useMutation();
  const busy = saveText.isPending || saveMin.isPending || saveMedia.isPending || saveBtn.isPending;

  const textDirty = step.editableText && text !== (step.text ?? step.defaultText ?? "");
  const minDirty = step.isDelay && Number(minutes) !== (step.minutes ?? step.defaultMinutes ?? 0);
  const mediaDirty = !!step.mediaKey && media !== (step.mediaUrl ?? step.mediaFileId ?? "");
  const dirtyBtns = (step.urlButtons ?? []).filter((b) => (btns[b.index] ?? "") !== (b.url ?? b.defaultUrl ?? ""));
  const dirty = textDirty || minDirty || mediaDirty || dirtyBtns.length > 0;
  const nothing = !step.editableText && !step.isDelay && !step.mediaKey && (step.urlButtons ?? []).length === 0;

  async function onSave() {
    try {
      if (textDirty) await saveText.mutateAsync({ stepId: step.id, text });
      if (minDirty) await saveMin.mutateAsync({ stepId: step.id, minutes: Number(minutes) });
      if (mediaDirty) {
        const isUrl = /^https?:\/\//i.test(media.trim());
        await saveMedia.mutateAsync({ key: step.mediaKey!, url: isUrl ? media.trim() : null, fileId: isUrl ? null : media.trim() || null });
      }
      for (const b of dirtyBtns) await saveBtn.mutateAsync({ stepId: step.id, index: b.index, url: (btns[b.index] ?? "").trim() || null });
      toast({ title: "Saqlandi", variant: "success" });
      void utils.marketing.funnelBotFlow.invalidate();
      void utils.marketing.funnelBotGraph.invalidate();
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "Saqlanmadi", variant: "destructive" });
    }
  }

  if (nothing) return <p className="text-sm text-muted-foreground">Bu qadam (masalan, amal) tahrirlanmaydi.</p>;

  return (
    <div className="space-y-4">
      {step.editableText ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><MessageSquare className="h-3.5 w-3.5" /> Matn</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split("\n").length))} className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      ) : null}

      {step.isDelay ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" /> Kutish (daqiqa)</div>
          <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-40" />
        </div>
      ) : null}

      {step.mediaKey ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><ImageIcon className="h-3.5 w-3.5" /> Media ({MEDIA_KIND[step.mediaKind ?? ""] ?? step.mediaKind}) · <span className="font-mono">{step.mediaKey}</span></div>
          <Input value={media} onChange={(e) => setMedia(e.target.value)} placeholder="URL (https://…) yoki file_id" className="text-sm" />
        </div>
      ) : null}

      {(step.urlButtons ?? []).map((b) => (
        <div key={b.index}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Link2 className="h-3.5 w-3.5" /> Tugma: <b>{b.label}</b></div>
          <Input value={btns[b.index] ?? ""} onChange={(e) => setBtns((s) => ({ ...s, [b.index]: e.target.value }))} placeholder="https://… (havola)" className="text-sm" />
        </div>
      ))}

      <Button onClick={onSave} disabled={!dirty || busy} className="w-full">
        <Save className="h-4 w-4 mr-1.5" /> {busy ? "Saqlanmoqda…" : "Saqlash"}
      </Button>
    </div>
  );
}
