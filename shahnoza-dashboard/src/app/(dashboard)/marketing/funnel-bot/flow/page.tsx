"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, Clock, Copy, Flag, Image as ImageIcon, Link2, MessageSquare, MousePointerClick,
  Plus, Minus, Maximize2, RotateCcw, Save, Send, Trash2, Zap,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { FlowStep } from "@/lib/funnel-bot/flow";
import { FunnelBotTabs } from "../_tabs";

// ─────────────────────────── layout constants ───────────────────────────
const CARD_W = 280;
const COL_PITCH = 348;
const ROW_GAP = 40;
const TOP_PAD = 28;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const nameSample = (s: string) => s.replace(/\[ism\]/g, "Aziza");

const fmtMin = (m: number) =>
  m >= 1440 && m % 1440 === 0 ? `${m / 1440} kun`
  : m >= 60 && m % 60 === 0 ? `${m / 60} soat`
  : m > 60 ? `${Math.floor(m / 60)} soat ${m % 60} daq`
  : `${m} daqiqa`;

const estLines = (t: string) =>
  t.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 36)), 0);

/** Estimated card height — used for stacking + edge anchors. */
function estHeight(step: FlowStep, text: string): number {
  if (step.type === "delay") return 96;
  if (step.type === "action") return 84;
  if (step.type === "end") return 60 + (text ? Math.min(estLines(text), 8) * 17 + 14 : 0);
  const media = "media" in step && step.media ? 58 : 0;
  const lines = Math.min(estLines(text), 26);
  const btnCount =
    step.type === "buttons" ? step.buttons.length
    : step.type === "continue" ? 1
    : step.type === "ask_phone" ? 1
    : step.type === "message" ? (step.urlButtons?.length ?? 0)
    : 0;
  return 34 + media + lines * 17 + 18 + btnCount * 32 + 28;
}

type XY = { x: number; y: number };
type Drag = { kind: "node" | "pan"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean };
type GraphNode = { id: string; type: string; label: string; x: number; y: number; sent: number; advanced: number | null; ctr: number | null };
type OvStep = {
  id: string; type: string; editableText: boolean; defaultText: string | null; text: string | null;
  isDelay: boolean; defaultMinutes: number | null; minutes: number | null;
  mediaKey: string | null; mediaKind: string | null; mediaUrl: string | null; mediaFileId: string | null;
  urlButtons: Array<{ index: number; label: string; defaultUrl: string; url: string | null }>;
};

const newId = () => `st${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export default function FunnelBotFlowPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] w-full" />}>
      <FlowCanvas />
    </Suspense>
  );
}

function FlowCanvas() {
  const params = useSearchParams();
  const flowKey = params.get("key") ?? undefined;
  const utils = api.useUtils();

  const { data: graph, isLoading } = api.marketing.funnelBotGraph.useQuery({ flowKey });
  const { data: raw } = api.marketing.funnelBotFlowRaw.useQuery({ flowKey });
  const { data: ov } = api.marketing.funnelBotFlow.useQuery({ flowKey });
  const { data: info } = api.marketing.funnelBotInfo.useQuery(undefined, { staleTime: 3600_000 });

  const updateSteps = api.marketing.updateFlowSteps.useMutation();
  const setStatus = api.marketing.setFlowStatus.useMutation();

  const [selected, setSelected] = useState<string | null>(null);

  const nodes: GraphNode[] = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);
  const rawById = useMemo(() => new Map((raw?.steps ?? []).map((s) => [s.id, s as FlowStep])), [raw]);
  const ovById = useMemo(() => new Map((ov ?? []).map((s) => [s.id, s as OvStep])), [ov]);
  const statsById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const isBuiltin = raw?.isBuiltin ?? true;

  /** Display text for a step: override (builtin) → raw code/jsonb text. */
  const textOf = useCallback(
    (id: string): string => {
      const o = ovById.get(id);
      const r = rawById.get(id);
      const rawText = r && "text" in r && typeof r.text === "string" ? r.text : "";
      return o?.text ?? rawText;
    },
    [ovById, rawById],
  );

  // ── layout: columns from the server graph, heights estimated client-side ──
  const { basePos, heights, width, height } = useMemo(() => {
    const heights = new Map<string, number>();
    for (const n of nodes) {
      const r = rawById.get(n.id);
      heights.set(n.id, r ? estHeight(r, nameSample(textOf(n.id))) : 90);
    }
    const byCol = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      const col = Math.round(n.x / 300);
      const arr = byCol.get(col);
      if (arr) arr.push(n);
      else byCol.set(col, [n]);
    }
    const basePos = new Map<string, XY>();
    let maxY = 400;
    for (const [col, arr] of byCol) {
      arr.sort((a, b) => a.y - b.y);
      let y = TOP_PAD;
      for (const n of arr) {
        basePos.set(n.id, { x: col * COL_PITCH + 24, y });
        y += (heights.get(n.id) ?? 90) + ROW_GAP;
      }
      maxY = Math.max(maxY, y);
    }
    const width = Math.max(700, (Math.max(0, ...Array.from(byCol.keys())) + 1) * COL_PITCH + 80);
    return { basePos, heights, width, height: maxY + 60 };
  }, [nodes, rawById, textOf]);

  // ── per-node custom positions (persisted per flow, this browser) ──
  const POS_KEY = `funnel-canvas-pos-v2:${raw?.key ?? flowKey ?? "default"}`;
  const [custom, setCustom] = useState<Record<string, XY>>({});
  useEffect(() => {
    try {
      const stored = localStorage.getItem(POS_KEY);
      setCustom(stored ? (JSON.parse(stored) as Record<string, XY>) : {});
    } catch {
      setCustom({});
    }
  }, [POS_KEY]);
  const posOf = useCallback((id: string): XY => custom[id] ?? basePos.get(id) ?? { x: 0, y: 0 }, [custom, basePos]);

  // ── viewport: pan + zoom ──
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState<XY>({ x: 16, y: 8 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  const drag = useRef<Drag | null>(null);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || nodes.length === 0) return;
    const z = clamp(Math.min(vp.clientWidth / width, vp.clientHeight / height) * 0.95, MIN_ZOOM, MAX_ZOOM);
    setZoom(z);
    setPan({ x: Math.max(12, (vp.clientWidth - width * z) / 2), y: 12 });
  }, [nodes.length, width, height]);

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && nodes.length > 0) {
      fitted.current = true;
      requestAnimationFrame(fit);
    }
  }, [nodes.length, fit]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prev = zoomRef.current;
      const next = clamp(prev * (e.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
      if (next === prev) return;
      const k = next / prev;
      const p = panRef.current;
      setZoom(next);
      setPan({ x: mx - k * (mx - p.x), y: my - k * (my - p.y) });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const vp = viewportRef.current;
    const prev = zoomRef.current;
    const next = clamp(prev * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === prev) return;
    const cx = vp ? vp.clientWidth / 2 : 0;
    const cy = vp ? vp.clientHeight / 2 : 0;
    const k = next / prev;
    const p = panRef.current;
    setZoom(next);
    setPan({ x: cx - k * (cx - p.x), y: cy - k * (cy - p.y) });
  };

  function capture(e: ReactPointerEvent) {
    try { viewportRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onNodeDown(e: ReactPointerEvent, id: string) {
    e.stopPropagation();
    capture(e);
    const p = posOf(id);
    drag.current = { kind: "node", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
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
    if (d.kind === "pan") setPan({ x: d.ox + dx, y: d.oy + dy });
    else if (d.id) {
      const z = zoomRef.current;
      const id = d.id;
      setCustom((prev) => ({ ...prev, [id]: { x: Math.round(d.ox + dx / z), y: Math.round(d.oy + dy / z) } }));
    }
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "node" && d.id && !d.moved) setSelected(d.id);
    else if (d.kind === "node" && d.moved) {
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

  // ── custom-flow structure edits ──
  async function saveSteps(steps: FlowStep[]) {
    if (!raw || raw.isBuiltin) return;
    await updateSteps.mutateAsync({ key: raw.key, steps, entryStep: steps.some((s) => s.id === raw.entry) ? raw.entry : undefined });
    void utils.marketing.funnelBotGraph.invalidate();
    void utils.marketing.funnelBotFlowRaw.invalidate();
    void utils.marketing.funnelBotFlows.invalidate();
  }

  async function addStep(kind: "message" | "delay") {
    if (!raw || raw.isBuiltin) return;
    const steps = structuredClone(raw.steps) as FlowStep[];
    const id = newId();
    const fresh: FlowStep =
      kind === "message"
        ? { id, type: "message", text: "Yangi xabar — matnni bosib tahrirlang.", next: "" }
        : { id, type: "delay", minutes: 60, next: "" };
    // insert after the selected step, else after the last step that leads to an end
    let anchor = selected ? steps.find((s) => s.id === selected && s.type !== "buttons" && "next" in s) : undefined;
    if (!anchor) {
      anchor = [...steps].reverse().find((s) => s.type !== "buttons" && "next" in s && typeof (s as { next?: string }).next === "string");
    }
    if (anchor && "next" in anchor) {
      const endId = steps.find((s) => s.type === "end")?.id ?? id;
      (fresh as { next: string }).next = (anchor as { next?: string }).next ?? endId;
      (anchor as { next: string }).next = id;
      steps.splice(steps.findIndex((s) => s.id === anchor!.id) + 1, 0, fresh);
    } else {
      (fresh as { next: string }).next = steps.find((s) => s.type === "end")?.id ?? id;
      steps.push(fresh);
    }
    try {
      await saveSteps(steps);
      setSelected(id);
      toast({ title: kind === "message" ? "Xabar qo'shildi" : "Kutish qo'shildi", variant: "success" });
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function deleteStep(id: string) {
    if (!raw || raw.isBuiltin) return;
    const steps = structuredClone(raw.steps) as FlowStep[];
    const victim = steps.find((s) => s.id === id);
    if (!victim || victim.type === "end") return;
    const fallthrough = "next" in victim ? (victim as { next?: string }).next : undefined;
    for (const s of steps) {
      if ("next" in s && (s as { next?: string }).next === id) (s as { next?: string }).next = fallthrough;
      if (s.type === "buttons") for (const b of s.buttons) if (b.next === id) b.next = fallthrough;
    }
    const pruned = steps.filter((s) => s.id !== id);
    try {
      await updateSteps.mutateAsync({ key: raw.key, steps: pruned, entryStep: raw.entry === id ? fallthrough : raw.entry });
      setSelected(null);
      void utils.marketing.funnelBotGraph.invalidate();
      void utils.marketing.funnelBotFlowRaw.invalidate();
      void utils.marketing.funnelBotFlows.invalidate();
      toast({ title: "Qadam o'chirildi", variant: "success" });
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function toggleLive() {
    if (!raw || raw.isBuiltin) return;
    try {
      await setStatus.mutateAsync({ key: raw.key, status: raw.status === "live" ? "draft" : "live" });
      void utils.marketing.funnelBotFlowRaw.invalidate();
      void utils.marketing.funnelBotFlows.invalidate();
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  function copyLink() {
    const key = raw?.key ?? flowKey ?? "";
    const link = info?.username ? `https://t.me/${info.username}?start=${key}` : key;
    void navigator.clipboard.writeText(link);
    toast({ title: "Havola nusxalandi", description: link, variant: "success" });
  }

  const selectedStats = selected ? statsById.get(selected) : null;
  const selectedRaw = selected ? rawById.get(selected) : undefined;
  const selectedOv = selected ? ovById.get(selected) : undefined;

  return (
    <div className="space-y-4">
      <FunnelBotTabs />

      {/* ManyChat-style top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/marketing/funnel-bot/flows" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Avtomatlashtirishlar
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-sm">{raw?.name ?? "Voronka"}</span>
        {raw?.status === "live" ? (
          <Badge className="bg-red-600 text-white hover:bg-red-600 text-[10px] tracking-wide">LIVE</Badge>
        ) : raw ? (
          <Badge variant="secondary" className="text-[10px]">QORALAMA</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="h-3.5 w-3.5 mr-1.5" /> Havola</Button>
          {!isBuiltin && raw ? (
            <Button size="sm" variant={raw.status === "live" ? "outline" : "default"} onClick={toggleLive} disabled={setStatus.isPending}>
              {raw.status === "live" ? "To'xtatish" : "Yoqish"}
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[64vh] w-full" />
      ) : (
        <div
          ref={viewportRef}
          className="relative overflow-hidden rounded-xl border bg-[#eef1f5] touch-none select-none"
          style={{ height: "68vh" }}
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width, height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              backgroundImage: "radial-gradient(circle, #d3d9e0 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
              {edges.map((e, i) => {
                const a = posOf(e.from);
                const b = posOf(e.to);
                const ha = heights.get(e.from) ?? 90;
                const x1 = a.x + CARD_W - 14, y1 = a.y + ha - 15, x2 = b.x - 2, y2 = b.y + 22;
                const dx = Math.max(46, Math.abs(x2 - x1) / 2);
                const active = selected === e.from || selected === e.to;
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={active ? "#2f80ed" : "#aeb9c6"}
                      strokeWidth={active ? 2.4 : 1.8}
                    />
                    <circle cx={x2} cy={y2} r={3} fill={active ? "#2f80ed" : "#aeb9c6"} />
                    {e.label ? (
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fill="#7b8794" fontSize={11} textAnchor="middle">
                        {e.label.length > 18 ? e.label.slice(0, 18) + "…" : e.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const r = rawById.get(n.id);
              if (!r) return null;
              const p = posOf(n.id);
              return (
                <NodeCard
                  key={n.id}
                  step={r}
                  text={nameSample(textOf(n.id))}
                  ov={ovById.get(n.id)}
                  stats={n}
                  x={p.x}
                  y={p.y}
                  h={heights.get(n.id) ?? 90}
                  selected={selected === n.id}
                  onPointerDown={(e) => onNodeDown(e, n.id)}
                />
              );
            })}
          </div>

          {/* hint pill */}
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm backdrop-blur pointer-events-none">
            👆 Qadamni bosib tahrirlang · suring · fonni siljiting
          </div>

          {/* add-step (custom flows) */}
          {!isBuiltin ? (
            <div className="absolute right-4 top-4" onPointerDown={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2f80ed] text-white shadow-lg hover:brightness-110 transition-all" title="Qadam qo'shish">
                    <Plus className="h-6 w-6" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => addStep("message")}><Send className="h-4 w-4 mr-2 text-[#2f80ed]" /> Xabar qo'shish</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addStep("delay")}><Clock className="h-4 w-4 mr-2 text-amber-500" /> Kutish qo'shish</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          {/* zoom toolbar (stopPropagation so a tap here never starts a pan) */}
          <div
            className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button onClick={() => zoomBy(1.25)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-md ring-1 ring-black/5 hover:bg-slate-50 active:scale-95" title="Kattalashtirish"><Plus className="h-5 w-5" /></button>
            <div className="rounded-lg bg-white px-1 py-1 text-center text-[11px] font-medium tabular-nums text-slate-600 shadow-md ring-1 ring-black/5">{Math.round(zoom * 100)}%</div>
            <button onClick={() => zoomBy(1 / 1.25)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-md ring-1 ring-black/5 hover:bg-slate-50 active:scale-95" title="Kichraytirish"><Minus className="h-5 w-5" /></button>
            <button onClick={fit} className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-md ring-1 ring-black/5 hover:bg-slate-50 active:scale-95" title="Ekranga moslash"><Maximize2 className="h-4 w-4" /></button>
            <button onClick={resetPositions} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-md ring-1 ring-black/5 hover:bg-slate-50 active:scale-95" title="Joylashuvni tiklash"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* edit sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetTitle className="mb-1">Qadam: {selected}</SheetTitle>
          {selectedStats ? (
            <div className="text-xs text-muted-foreground mb-4">
              Yuborildi: <b className="text-foreground">{selectedStats.sent}</b>
              {selectedStats.ctr !== null ? <> · CTR: <b className="text-foreground">{selectedStats.ctr}%</b></> : null}
            </div>
          ) : null}
          {isBuiltin && selectedOv ? (
            <BuiltinEditPanel step={selectedOv} flowKey={flowKey} />
          ) : !isBuiltin && selectedRaw && raw ? (
            <CustomEditPanel
              step={selectedRaw}
              busy={updateSteps.isPending}
              onSave={async (updated) => {
                const steps = (structuredClone(raw.steps) as FlowStep[]).map((s) => (s.id === updated.id ? updated : s));
                try {
                  await saveSteps(steps);
                  toast({ title: "Saqlandi", variant: "success" });
                } catch (e) {
                  toast({ title: "Xatolik", description: e instanceof Error ? e.message : "", variant: "destructive" });
                }
              }}
              onDelete={() => deleteStep(selectedRaw.id)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Bu qadamda tahrirlanadigan narsa yo'q.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─────────────────────────────── node card ───────────────────────────────

const HEAD: Record<string, { icon: typeof Send; tint: string; bg: string; label: string }> = {
  message: { icon: Send, tint: "#2f80ed", bg: "#eaf2fe", label: "Xabar yuborish" },
  continue: { icon: MousePointerClick, tint: "#8b5cf6", bg: "#f1ecfe", label: "Xabar + tugma" },
  buttons: { icon: MousePointerClick, tint: "#8b5cf6", bg: "#f1ecfe", label: "Tugmali xabar" },
  ask_phone: { icon: MessageSquare, tint: "#14b8a6", bg: "#e7f8f5", label: "Raqam so'rash" },
  ask_text: { icon: MessageSquare, tint: "#14b8a6", bg: "#e7f8f5", label: "Javob so'rash" },
  delay: { icon: Clock, tint: "#f59e0b", bg: "#fdf1e2", label: "Smart Delay" },
  action: { icon: Zap, tint: "#22c55e", bg: "#e9f9ef", label: "Amal" },
  end: { icon: Flag, tint: "#f43f5e", bg: "#fdeaee", label: "Yakun" },
};

const MEDIA_LABEL: Record<string, string> = { photo: "Rasm", video: "Video", voice: "Ovozli xabar", document: "Hujjat" };

function NodeCard({
  step, text, ov, stats, x, y, h, selected, onPointerDown,
}: {
  step: FlowStep;
  text: string;
  ov: OvStep | undefined;
  stats: GraphNode;
  x: number;
  y: number;
  h: number;
  selected: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const head = HEAD[step.type] ?? HEAD.message!;
  const Icon = head.icon;
  const media = "media" in step ? step.media : undefined;
  const mediaSrc = ov?.mediaUrl ?? null;
  const chips: Array<{ text: string; isUrl: boolean }> =
    step.type === "buttons" ? step.buttons.map((b, i) => ({ text: b.text, isUrl: !!(ov?.urlButtons.find((u) => u.index === i)?.url || b.url) }))
    : step.type === "continue" ? [{ text: step.label ?? "Davom etish →", isUrl: false }]
    : step.type === "ask_phone" ? [{ text: step.buttonText, isUrl: false }]
    : step.type === "message" ? (step.urlButtons ?? []).map((b, i) => ({ text: b.text, isUrl: !!(ov?.urlButtons.find((u) => u.index === i)?.url || b.url) }))
    : [];
  const hasNext = step.type !== "end";

  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "absolute rounded-xl bg-white text-left shadow-[0_1px_4px_rgba(20,35,60,0.12)] overflow-hidden cursor-grab active:cursor-grabbing transition-shadow hover:shadow-[0_4px_14px_rgba(20,35,60,0.16)]",
        selected && "ring-2 ring-[#2f80ed]",
      )}
      style={{ left: x, top: y, width: CARD_W, height: h }}
    >
      {/* header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: head.bg }}>
        <Icon className="h-3.5 w-3.5" style={{ color: head.tint }} />
        <span className="text-[11px] font-medium" style={{ color: head.tint }}>{head.label}</span>
        <span className="ml-auto font-mono text-[9px] text-slate-400">{step.id}</span>
      </div>

      {/* body */}
      {step.type === "delay" ? (
        <div className="px-3 py-2.5 text-[12px] text-slate-600">
          <b className="text-slate-800">{fmtMin(step.minutes)}</b> kutadi, keyin davom etadi
        </div>
      ) : step.type === "action" ? (
        <div className="px-3 py-2.5 text-[12px] text-slate-600">{step.action}</div>
      ) : (
        <div className="px-2.5 pt-2 space-y-1.5">
          {media ? (
            mediaSrc && media.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc} alt="" className="h-[52px] w-full rounded-md object-cover" draggable={false} />
            ) : (
              <div className="flex h-[50px] items-center justify-center gap-1.5 rounded-md bg-slate-100 text-slate-400">
                <ImageIcon className="h-4 w-4" />
                <span className="text-[11px]">{MEDIA_LABEL[media.kind] ?? media.kind}{ov?.mediaUrl || ov?.mediaFileId ? " ✓" : " (bo'sh)"}</span>
              </div>
            )
          ) : null}
          {text ? (
            <div className="rounded-lg bg-[#f4f6f8] px-2.5 py-2 text-[12px] leading-[17px] text-slate-700 whitespace-pre-wrap overflow-hidden" style={{ maxHeight: 26 * 17 + 16 }}>
              {text}
            </div>
          ) : null}
          {chips.map((c, i) => (
            <div key={i} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white py-1.5 text-[12px] font-medium text-[#2f80ed]">
              {c.isUrl ? <Link2 className="h-3 w-3" /> : null}
              <span className="truncate px-2">{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* footer */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center px-3 py-1.5 text-[10px] text-slate-400">
        <span>Yuborildi <b className="text-slate-600">{stats.sent}</b>{stats.ctr !== null ? <> · CTR <b className={stats.ctr >= 50 ? "text-emerald-600" : "text-amber-600"}>{stats.ctr}%</b></> : null}</span>
        {hasNext ? (
          <span className="ml-auto inline-flex items-center gap-1">Keyingi qadam <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-300 bg-white" /></span>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────────────── built-in flow edit panel ─────────────────────────

function BuiltinEditPanel({ step, flowKey }: { step: OvStep; flowKey?: string }) {
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
      void utils.marketing.funnelBotFlow.invalidate({ flowKey });
      void utils.marketing.funnelBotGraph.invalidate({ flowKey });
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
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, Math.max(3, text.split("\n").length + 1))} className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      ) : null}

      {step.isDelay ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" /> Kutish (daqiqa)</div>
          <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-40" />
          <div className="flex gap-1.5 mt-1.5">
            {[5, 30, 60, 240, 1440].map((m) => (
              <button key={m} onClick={() => setMinutes(String(m))} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">{fmtMin(m)}</button>
            ))}
          </div>
        </div>
      ) : null}

      {step.mediaKey ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><ImageIcon className="h-3.5 w-3.5" /> Media ({MEDIA_LABEL[step.mediaKind ?? ""] ?? step.mediaKind}) · <span className="font-mono">{step.mediaKey}</span></div>
          <Input value={media} onChange={(e) => setMedia(e.target.value)} placeholder="URL (https://…) yoki Telegram file_id" className="text-sm" />
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

// ───────────────────────── custom flow edit panel ─────────────────────────

function CustomEditPanel({
  step, busy, onSave, onDelete,
}: {
  step: FlowStep;
  busy: boolean;
  onSave: (updated: FlowStep) => Promise<void>;
  onDelete: () => void;
}) {
  const [text, setText] = useState("text" in step && typeof step.text === "string" ? step.text : "");
  const [minutes, setMinutes] = useState<string>(step.type === "delay" ? String(step.minutes) : "0");
  const [btns, setBtns] = useState<Array<{ text: string; url: string }>>(() =>
    step.type === "message" ? (step.urlButtons ?? []).map((b) => ({ text: b.text, url: b.url ?? "" })) : [],
  );

  function buildUpdated(): FlowStep {
    const s = structuredClone(step) as FlowStep;
    if ("text" in s && typeof (s as { text?: string }).text === "string") (s as { text: string }).text = text;
    if (s.type === "delay") s.minutes = Math.max(0, Number(minutes) || 0);
    if (s.type === "message") {
      const cleaned = btns.filter((b) => b.text.trim());
      s.urlButtons = cleaned.length ? cleaned.map((b) => ({ text: b.text.trim(), url: b.url.trim() })) : undefined;
    }
    return s;
  }

  return (
    <div className="space-y-4">
      {"text" in step ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><MessageSquare className="h-3.5 w-3.5" /> Matn ([ism] — obunachi ismi bilan almashadi)</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, Math.max(3, text.split("\n").length + 1))} className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      ) : null}

      {step.type === "delay" ? (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" /> Kutish (daqiqa)</div>
          <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-40" />
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {[5, 30, 60, 240, 1440, 2880].map((m) => (
              <button key={m} onClick={() => setMinutes(String(m))} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">{fmtMin(m)}</button>
            ))}
          </div>
        </div>
      ) : null}

      {step.type === "message" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Havola tugmalari</div>
          {btns.map((b, i) => (
            <div key={i} className="flex gap-1.5">
              <Input value={b.text} onChange={(e) => setBtns((s) => s.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="Tugma matni" className="text-sm flex-1" />
              <Input value={b.url} onChange={(e) => setBtns((s) => s.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" className="text-sm flex-1" />
              <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => setBtns((s) => s.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {btns.length < 6 ? (
            <Button variant="outline" size="sm" onClick={() => setBtns((s) => [...s, { text: "", url: "" }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Tugma qo'shish
            </Button>
          ) : null}
        </div>
      ) : null}

      <Button onClick={() => void onSave(buildUpdated())} disabled={busy} className="w-full">
        <Save className="h-4 w-4 mr-1.5" /> {busy ? "Saqlanmoqda…" : "Saqlash"}
      </Button>

      {step.type !== "end" ? (
        <Button variant="outline" onClick={onDelete} disabled={busy} className="w-full text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-1.5" /> Qadamni o'chirish
        </Button>
      ) : null}
    </div>
  );
}
