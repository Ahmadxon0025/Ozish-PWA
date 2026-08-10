"use client";

import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FunnelBotTabs } from "../_tabs";

const CARD_W = 244;
const CARD_H = 116;

type NodeType = "message" | "continue" | "buttons" | "ask_phone" | "ask_text" | "delay" | "action" | "end";

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

export default function FunnelBotFlowPage() {
  const { data, isLoading } = api.marketing.funnelBotGraph.useQuery();

  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  const posById = new Map(nodes.map((n) => [n.id, n]));
  const width = Math.max(600, ...nodes.map((n) => n.x + CARD_W + 80));
  const height = Math.max(400, ...nodes.map((n) => n.y + CARD_H + 60));

  return (
    <div className="space-y-4">
      <PageHeader title="Voronka xaritasi" description="Botning to'liq oqimi — har bir qadam va o'tishlar, jonli statistika bilan (ManyChat uslubida)." />
      <FunnelBotTabs />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries({ Xabar: "#2f80ed", Tugma: "#8b5cf6", Kutish: "#f59e0b", "Raqam/Javob": "#14b8a6", Amal: "#22c55e", Yakun: "#f43f5e" }).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {k}
          </span>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : (
        <div className="overflow-auto rounded-xl border bg-[#0e1621]" style={{ maxHeight: "72vh" }}>
          <div className="relative" style={{ width, height }}>
            {/* connectors */}
            <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
              {edges.map((e, i) => {
                const a = posById.get(e.from);
                const b = posById.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + CARD_W;
                const y1 = a.y + CARD_H / 2;
                const x2 = b.x;
                const y2 = b.y + CARD_H / 2;
                const dx = Math.max(40, Math.abs(x2 - x1) / 2);
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#33475b"
                      strokeWidth={2}
                    />
                    {e.label ? (
                      <text x={mx} y={my - 5} fill="#7d8e9e" fontSize={11} textAnchor="middle">
                        {e.label.length > 18 ? e.label.slice(0, 18) + "…" : e.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {/* nodes */}
            {nodes.map((n) => {
              const meta = TYPE[n.type as NodeType] ?? { color: "#64748b", label: n.type };
              return (
                <div
                  key={n.id}
                  className="absolute rounded-xl border shadow-sm overflow-hidden"
                  style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, background: "#182533", borderColor: "#22344a" }}
                >
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: meta.color + "22" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                    <span className="text-[11px] font-medium" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[10px] text-slate-500 ml-auto font-mono">{n.id}</span>
                  </div>
                  <div className="px-2.5 py-1.5 text-[12px] leading-snug text-slate-200 line-clamp-2 h-[46px]">
                    {n.label}
                  </div>
                  <div className="flex items-center gap-3 px-2.5 py-1 text-[10px] border-t" style={{ borderColor: "#22344a" }}>
                    <span className="text-slate-400">Yuborildi <b className="text-slate-200">{n.sent}</b></span>
                    {n.ctr !== null ? (
                      <span className="text-slate-400">CTR <b className={n.ctr >= 50 ? "text-emerald-400" : n.ctr >= 20 ? "text-slate-200" : "text-amber-400"}>{n.ctr}%</b></span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Suring — chapdan o'ngga to'liq voronkani ko'ring. Tahrirlash uchun «Muharrir» tabiga o'ting.</p>
    </div>
  );
}
