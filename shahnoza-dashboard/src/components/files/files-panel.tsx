"use client";

import { useRef, useState } from "react";
import {
  Paperclip,
  Upload,
  Link2,
  FileText,
  Trash2,
  ExternalLink,
  Loader2,
  Plus,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per file

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Sanitize a filename for use inside a storage object key. */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
}

/**
 * Attachments for a task or a bo'lim (space). Upload real files (stored in
 * Supabase) or attach an external link (Google Doc/Sheet/Drive/Figma…).
 */
export function FilesPanel({
  spaceId,
  taskId,
}: {
  spaceId?: string;
  taskId?: string;
}) {
  const utils = api.useUtils();
  const listInput = { spaceId, taskId };
  const files = api.files.list.useQuery(listInput);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const refresh = () => utils.files.list.invalidate(listInput);

  const record = api.files.record.useMutation({
    onSuccess: () => {
      toast({ title: "Fayl yuklandi", variant: "success" });
      refresh();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const addLink = api.files.addLink.useMutation({
    onSuccess: () => {
      setLinkName("");
      setLinkUrl("");
      setShowLink(false);
      toast({ title: "Havola qo'shildi", variant: "success" });
      refresh();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const open = api.files.openUrl.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const remove = api.files.remove.useMutation({
    onSuccess: () => refresh(),
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast({ title: "Fayl juda katta (maks. 50 MB)", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const prefix = taskId ? `tasks/${taskId}` : `spaces/${spaceId}`;
      const path = `${prefix}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage
        .from(FILES_BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });
      if (error) {
        toast({ title: "Yuklashda xato", description: error.message, variant: "destructive" });
        return;
      }
      await record.mutateAsync({
        spaceId,
        taskId,
        name: file.name,
        storagePath: path,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
      });
    } finally {
      setUploading(false);
    }
  }

  const rows = files.data ?? [];

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="h-4 w-4" /> Fayllar
          {rows.length > 0 && (
            <span className="text-muted-foreground">({rows.length})</span>
          )}
        </Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={onPick}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Yuklash
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowLink((v) => !v)}
          >
            <Link2 className="h-4 w-4" /> Havola
          </Button>
        </div>
      </div>

      {showLink && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <Input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Nomi (masalan: Segmentatsiya jadvali)"
            className="h-8"
          />
          <div className="flex gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === "Enter" && linkName.trim() && linkUrl.trim()) {
                  e.preventDefault();
                  addLink.mutate({ spaceId, taskId, name: linkName.trim(), url: linkUrl.trim() });
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              disabled={!linkName.trim() || !linkUrl.trim() || addLink.isPending}
              onClick={() =>
                addLink.mutate({ spaceId, taskId, name: linkName.trim(), url: linkUrl.trim() })
              }
            >
              <Plus className="h-4 w-4" /> Qo&apos;shish
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Google Doc/Sheet, Drive yoki Figma havolasini qo&apos;ying — fayl
            o&apos;sha yerda qoladi.
          </p>
        </div>
      )}

      {files.isLoading ? (
        <p className="py-2 text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Hali fayl yo&apos;q. Fayl yuklang yoki havola qo&apos;shing.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              {f.kind === "link" ? (
                <Link2 className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => open.mutate({ id: f.id })}
                title="Ochish"
              >
                {f.name}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {f.kind === "link" ? "havola" : formatBytes(f.size_bytes)}
              </span>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                onClick={() => open.mutate({ id: f.id })}
                aria-label="Ochish"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-destructive hover:bg-muted"
                onClick={() => {
                  if (window.confirm(`"${f.name}" o'chirilsinmi?`))
                    remove.mutate({ id: f.id });
                }}
                aria-label="O'chirish"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
