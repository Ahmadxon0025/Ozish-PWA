"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Clock, Image as ImageIcon, Link2, MessageSquare, Save, Plus, Minus, Maximize2, RotateCcw } from "lucide-react";
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
const POS_KEY = "funnel-canvas-pos-v1";
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
type XY = { x: number; y: number };
type Drag = { kind: "node" | "pan"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean };

export default function FunnelBotFlowPage() {
  const { data: graph, isLoading } = api.marketing.funnelBotGraph.useQuery();
  const { data: flow } = api.marketing.funnelBotFlow.useQuery();
  const [selected, setSelected] = useState<string | null>(null);

  const nodes: GraphNode[] = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const flowById = new Map((flow ?? []).map((s) => [s.id, s as FlowStep]));

  // Per-node custom positions (browser-persisted). Falls back to server auto-layout.
  const [custom, setCustom] = useState<Record<string, XY>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setCustom(JSON.parse(raw) as Record<string, XY>);
    } catch { /* ignore */ }
  }, []);
  const posOf = useCallback((n: GraphNode): XY => custom[n.id] ?? { x: n.x, y: n.y }, [custom]);

  const width = Math.max(600, ...nodes.map((n) => posOf(n).x + CARD_W + 120));
  const height = Math.max(400, ...nodes.map((n) => posOf(n).y + CARD_H + 120));

  // Viewport transform (pan + zoom) — infinite-canvas feel like ManyChat.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<XY>({ x: 24, y: 24 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const drag = useRef<Drag | null>(null);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || nodes.length === 0) return;
    const z = clamp(Math.min(vp.clientWidth / width, vp.clientHeight / height) * 0.94, MIN_ZOOM, MAX_ZOOM);
    setZoom(z);
    setPan({ x: Math.max(16, (vp.clientWidth - width * z) / 2), y: 20 });
  }, [nodes.length, width, height]);

  // Auto-fit once, when the graph first loads.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && nodes.length > 0) {
      fitted.current = true;
      // wait a frame so the viewport has measured
      requestAnimationFrame(fit);
    }
  }, [nodes.length, fit]);

  // Wheel zoom toward cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prevZoom = zoomRef.current;
      const next = clamp(prevZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
      if (next === prevZoom) return;
      const k = next / prevZoom;
      const p = panRef.current;
      setZoom(next);
      setPan({ x: mx - k * (mx - p.x), y: my - k * (my - p.y) });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const vp = viewportRef.current;
    const prevZoom = zoomRef.current;
    const next = clamp(prevZoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === prevZoom) return;
    const cx = vp ? vp.clientWidth / 2 : 0;
    const cy = vp ? vp.clientHeight / 2 : 0;
    const k = next / prevZoom;
    const p = panRef.current;
    setZoom(next);
    setPan({ x: cx - k * (cx - p.x), y: cy - k * (cy - p.y) });
  };

  function capture(e: ReactPointerEvent) {
    try { viewportRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function onNodeDown(e: ReactPointerEvent, n: GraphNode) {
    e.stopPropagation();
    capture(e);
    const p = posOf(n);
    drag.current = { kind: "node", id: n.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  }

  function onBgDown(e: ReactPointerEvent) {
    capture(e);
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: panRef.current.x, oy: panRef.current.y, moved: false };
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) d.moved = true;
    if (!d.moved) return;
    if (d.kind === "pan") {
      setPan({ x: d.ox + dx, y: d.oy + dy });
    } else if (d.id) {
      const z = zoomRef.current;
      const id = d.id;
      setCustom((prev) => ({ ...prev, [id]: { x: Math.round(d.ox + dx / z), y: Math.round(d.oy + dy / z) } }));
    }
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "node" && d.id && !d.moved) {
      setSelected(d.id);
    } else if (d.kind === "node" && d.moved) {
      // persist final positions
      setCustom((prev) => {
        try { localStorage.setItem(POS_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
        return prev;
      });
    }
  }

  function resetPositions() {
    setCustom({});
    try { localStorage.removeItem(POS_KEY); } catch { /* ignore */ }
    requestAnimationFrame(fit);
  }

  const selectedNode = selected ? nodes.find((n) => n.id === selected) ?? null : null;
  const selectedStep = selected ? flowById.get(selected) : undefined;
  const posMap = new Map(nodes.map((n) => [n.id, posOf(n)]));

  return (
    <div className="space-y-4">
      <PageHeader title="Voronka xaritasi" description="Botning to'liq oqimi. Qadamni bosing — tahrir o'ngda ochiladi. Kartochkani suring — joyini o'zgartiring. G'ildirak yoki tugmalar bilan kattalashtiring." />
      <FunnelBotTabs />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {Object.entries({ Xabar: "#2f80ed", Tugma: "#8b5cf6", Kutish: "#f59e0b", "Raqam/Javob": "#14b8a6", Amal: "#22c55e", Yakun: "#f43f5e" }).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {k}</span>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : (
        <div
          ref={viewportRef}
          className="relative overflow-hidden rounded-xl border bg-[#0e1621] touch-none select-none"
          style={{ height: "72vh" }}
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* transformed content */}
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width,
              height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              backgroundImage: "radial-gradient(circle, #22344a 1px, transparent 1px)",
              backgroundSize: "26px 26px",
            }}
          >
            <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
              {edges.map((e, i) => {
                const a = posMap.get(e.from);
                const b = posMap.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + CARD_W, y1 = a.y + CARD_H / 2, x2 = b.x, y2 = b.y + CARD_H / 2;
                const dx = Math.max(40, Math.abs(x2 - x1) / 2);
                const active = selected === e.from || selected === e.to;
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={active ? "#2f80ed" : "#33475b"}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    {e.label ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} fill="#7d8e9e" fontSize={11} textAnchor="middle">{e.label.length > 18 ? e.label.slice(0, 18) + "…" : e.label}</text> : null}
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const meta = TYPE[n.type] ?? { color: "#64748b", label: n.type };
              const isSel = selected === n.id;
              const p = posMap.get(n.id)!;
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => onNodeDown(e, n)}
                  className={cn("absolute rounded-xl border text-left shadow-sm overflow-hidden transition-shadow hover:brightness-110 cursor-grab active:cursor-grabbing", isSel && "ring-2 ring-primary")}
                  style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H, background: "#182533", borderColor: isSel ? meta.color : "#22344a" }}
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
                </div>
              );
            })}
          </div>

          {/* zoom toolbar */}
          <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-[#22344a] bg-[#182533]/90 p-1 backdrop-blur">
            <button onClick={() => zoomBy(1.2)} title="Kattalashtirish" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
            <div className="text-center text-[10px] tabular-nums text-slate-400">{Math.round(zoom * 100)}%</div>
            <button onClick={() => zoomBy(1 / 1.2)} title="Kichraytirish" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
            <div className="my-0.5 h-px bg-[#22344a]" />
            <button onClick={fit} title="Ekaranga moslash" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"><Maximize2 className="h-4 w-4" /></button>
            <button onClick={resetPositions} title="Joylashuvni tiklash" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Bosib tahrirlang · surib joyini o'zgartiring · fonni surib harakatlantiring · g'ildirak bilan zum. Joylashuv shu brauzerda saqlanadi.</p>

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
