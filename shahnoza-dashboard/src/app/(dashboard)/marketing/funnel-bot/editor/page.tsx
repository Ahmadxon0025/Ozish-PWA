"use client";

import { useState } from "react";
import { Clock, Image as ImageIcon, MessageSquare, Save } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { FunnelBotTabs } from "../_tabs";

type Step = {
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
};

const MEDIA_KIND: Record<string, string> = { photo: "rasm", video: "video", voice: "ovoz", document: "hujjat" };

export default function FunnelBotEditorPage() {
  const { data, isLoading } = api.marketing.funnelBotFlow.useQuery();
  const editable = (data ?? []).filter((s) => s.editableText || s.isDelay || s.mediaKey);

  return (
    <div className="space-y-5">
      <PageHeader title="Bot muharriri" description="Har bir xabar matni, kutish vaqti va media — kod tegmasdan shu yerdan tahrirlang." />
      <FunnelBotTabs />

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 text-xs text-muted-foreground">
          Tahrirlash saqlanishi uchun <b>0049 SQL</b> qo'llangan bo'lishi kerak. Saqlangach o'zgarish bir daqiqada botga tushadi. Bo'sh qoldirsangiz — koddagi asl matn ishlatiladi.
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="space-y-3">
          {editable.map((s) => <StepCard key={s.id} step={s as Step} />)}
        </div>
      )}
    </div>
  );
}

function StepCard({ step }: { step: Step }) {
  const utils = api.useUtils();
  const [text, setText] = useState(step.text ?? step.defaultText ?? "");
  const [minutes, setMinutes] = useState<string>(String(step.minutes ?? step.defaultMinutes ?? 0));
  const [media, setMedia] = useState(step.mediaUrl ?? step.mediaFileId ?? "");

  const saveText = api.marketing.saveStepText.useMutation();
  const saveMin = api.marketing.saveStepMinutes.useMutation();
  const saveMedia = api.marketing.saveMedia.useMutation();
  const busy = saveText.isPending || saveMin.isPending || saveMedia.isPending;

  const textDirty = step.editableText && text !== (step.text ?? step.defaultText ?? "");
  const minDirty = step.isDelay && Number(minutes) !== (step.minutes ?? step.defaultMinutes ?? 0);
  const mediaDirty = !!step.mediaKey && media !== (step.mediaUrl ?? step.mediaFileId ?? "");
  const dirty = textDirty || minDirty || mediaDirty;

  async function onSave() {
    try {
      if (textDirty) await saveText.mutateAsync({ stepId: step.id, text });
      if (minDirty) await saveMin.mutateAsync({ stepId: step.id, minutes: Number(minutes) });
      if (mediaDirty) {
        const isUrl = /^https?:\/\//i.test(media.trim());
        await saveMedia.mutateAsync({
          key: step.mediaKey!,
          url: isUrl ? media.trim() : null,
          fileId: isUrl ? null : media.trim() || null,
        });
      }
      toast({ title: "Saqlandi", variant: "success" });
      void utils.marketing.funnelBotFlow.invalidate();
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "0049 SQL qo'llanganmi?", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{step.id}</span>
          <Badge variant="outline" className="text-[10px]">{step.type}</Badge>
          {step.text ? <Badge variant="secondary" className="text-[10px]">tahrirlangan</Badge> : null}
        </div>

        {step.editableText ? (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><MessageSquare className="h-3.5 w-3.5" /> Matn</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(8, Math.max(2, text.split("\n").length))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <ImageIcon className="h-3.5 w-3.5" /> Media ({MEDIA_KIND[step.mediaKind ?? ""] ?? step.mediaKind}) · <span className="font-mono">{step.mediaKey}</span>
            </div>
            <Input
              value={media}
              onChange={(e) => setMedia(e.target.value)}
              placeholder="URL (https://…) yoki Telegram file_id"
              className="text-sm"
            />
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button size="sm" onClick={onSave} disabled={!dirty || busy}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> {busy ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
