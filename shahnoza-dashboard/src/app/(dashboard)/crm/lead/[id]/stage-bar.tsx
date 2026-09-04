"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  BOSQICH_LABELS,
  CLOSED_STAGES,
  PIPELINE_STAGES,
  STAGE_ACCENT,
} from "@/lib/crm/constants";
import { cn } from "@/lib/utils";
import type { LeadStage } from "@/types/crm";

function accentBg(stage: LeadStage): string {
  return STAGE_ACCENT[stage].replace("border-t-", "bg-");
}

function pipelineIndex(current: LeadStage): number {
  const idx = PIPELINE_STAGES.indexOf(current);
  if (idx >= 0) return idx;
  if (current === "yutuq") return PIPELINE_STAGES.length;
  return -1;
}

export function StageBar({
  leadId,
  current,
}: {
  leadId: string;
  current: LeadStage;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(current);
  const [pending, setPending] = useState(false);
  const [loseOpen, setLoseOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setLocal(current);
  }, [current]);

  async function moveTo(next: LeadStage, izoh?: string) {
    if (next === local || pending) return;
    const prev = local;
    setLocal(next);
    setPending(true);
    try {
      const res = await fetch(`/api/crm/lead/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bosqich: next, izoh: izoh || undefined }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) {
        setLocal(prev);
        toast({
          title: "Xatolik",
          description: json.error ?? "Bosqich saqlanmadi",
          variant: "destructive",
        });
        return;
      }
      router.refresh();
    } catch {
      setLocal(prev);
      toast({
        title: "Xatolik",
        description: "Bosqich saqlanmadi",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  const idx = pipelineIndex(local);
  const won = local === "yutuq";
  const lost = local === "muvaffaqiyatsizlik" || local === "vozvrat";

  return (
    <div className="flex items-stretch gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-9 min-w-max">
          {PIPELINE_STAGES.map((stage, i) => {
            const passed = idx > i;
            const isCurrent = idx === i;
            const first = i === 0;
            return (
              <button
                key={stage}
                type="button"
                disabled={pending}
                onClick={() => moveTo(stage)}
                title={BOSQICH_LABELS[stage]}
                style={{
                  zIndex: PIPELINE_STAGES.length - i,
                  clipPath: first
                    ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                    : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                }}
                className={cn(
                  "relative h-9 min-w-[132px] shrink-0 px-5 text-[11px] font-medium leading-none disabled:opacity-60",
                  !first && "-ml-3",
                  passed && "bg-[#00c31f] text-white",
                  isCurrent && `${accentBg(stage)} text-white`,
                  !passed && !isCurrent && "bg-muted text-muted-foreground",
                )}
              >
                <span className="block truncate text-center">{BOSQICH_LABELS[stage]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          disabled={pending || won}
          onClick={() => moveTo("yutuq")}
          className="h-9 bg-[#00c31f] px-3 text-xs text-white hover:bg-[#00a81a]"
        >
          Sotildi
        </Button>
        {loseOpen ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const izoh = reason.trim();
              if (!izoh) {
                toast({
                  title: "Sabab yozing",
                  variant: "destructive",
                });
                return;
              }
              void moveTo("muvaffaqiyatsizlik", izoh).then(() => {
                setLoseOpen(false);
                setReason("");
              });
            }}
          >
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sabab"
              className="h-9 w-36 text-xs"
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={pending}
              className="h-9 text-xs"
            >
              Yo&apos;qotildi
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending || lost || CLOSED_STAGES.includes(local)}
            onClick={() => setLoseOpen(true)}
            className="h-9 text-xs"
          >
            Yo&apos;qotildi
          </Button>
        )}
      </div>
    </div>
  );
}
