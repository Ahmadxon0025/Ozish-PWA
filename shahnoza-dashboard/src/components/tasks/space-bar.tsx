"use client";

import { useState } from "react";
import {
  Plus,
  Settings2,
  Trash2,
  Check,
  X,
  Pencil,
  LayoutGrid,
  Paperclip,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { FilesPanel } from "@/components/files/files-panel";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { UserRole } from "@/types/database";

const MANAGER_ROLES: UserRole[] = ["super_admin", "owner", "sales_manager"];
export const ALL_SPACES = "all";

/**
 * ClickUp-style "Spaces" (bo'limlar) selector. A horizontal pill bar:
 * [Hammasi] [Bo'lim A] [Bo'lim B] … [+ Bo'lim] plus a manage dialog for
 * renaming/deleting. Managers create/rename/delete; everyone can filter.
 */
export function SpaceBar({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const spacesQuery = api.tasks.spaces.useQuery();
  const spaces = spacesQuery.data ?? [];
  const me = api.users.me.useQuery();
  const canManage = MANAGER_ROLES.includes((me.data?.role ?? "") as UserRole);
  const selectedSpace = spaces.find((s) => s.id === selected) ?? null;

  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
      <Pill active={selected === ALL_SPACES} onClick={() => onSelect(ALL_SPACES)}>
        <LayoutGrid className="h-3.5 w-3.5" /> Hammasi
      </Pill>
      {spaces.map((s) => (
        <Pill
          key={s.id}
          active={selected === s.id}
          onClick={() => onSelect(s.id)}
        >
          {s.color && (
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
          )}
          {s.name}
        </Pill>
      ))}
      <div className="flex shrink-0 items-center gap-2">
        {selectedSpace && <SpaceFilesDialog spaceId={selectedSpace.id} name={selectedSpace.name} />}
        {canManage && (
          <>
            <CreateSpaceButton onCreated={(id) => onSelect(id)} />
            {spaces.length > 0 && (
              <ManageSpacesDialog
                onDeletedSelected={() => onSelect(ALL_SPACES)}
                selected={selected}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A bo'lim's own files (Segmentatsiya materiallari kabi). */
function SpaceFilesDialog({ spaceId, name }: { spaceId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 rounded-full">
          <Paperclip className="h-4 w-4" /> Fayllar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name} — fayllar</DialogTitle>
          <DialogDescription>
            Bu bo&apos;limga oid hujjat va havolalar. Fayl yuklang yoki Google
            hujjat/jadval havolasini qo&apos;shing.
          </DialogDescription>
        </DialogHeader>
        <FilesPanel spaceId={spaceId} />
      </DialogContent>
    </Dialog>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CreateSpaceButton({ onCreated }: { onCreated: (id: string) => void }) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = api.tasks.createSpace.useMutation({
    onSuccess: (data) => {
      utils.tasks.spaces.invalidate();
      toast({ title: "Bo'lim yaratildi", variant: "success" });
      setName("");
      setOpen(false);
      if (data?.id) onCreated(data.id);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 rounded-full">
          <Plus className="h-4 w-4" /> Bo&apos;lim
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi bo&apos;lim</DialogTitle>
          <DialogDescription>
            Vazifalarni alohida ish yo&apos;nalishlariga ajrating (masalan: Sotuv,
            Marketing, Kontent).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Nomi</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bo'lim nomi"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && !create.isPending) {
                create.mutate({ name: name.trim() });
              }
            }}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate({ name: name.trim() })}
          >
            {create.isPending ? "Saqlanmoqda…" : "Yaratish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageSpacesDialog({
  selected,
  onDeletedSelected,
}: {
  selected: string;
  onDeletedSelected: () => void;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const spaces = api.tasks.spaces.useQuery().data ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const rename = api.tasks.renameSpace.useMutation({
    onSuccess: () => {
      utils.tasks.spaces.invalidate();
      setEditingId(null);
      toast({ title: "Saqlandi", variant: "success" });
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const del = api.tasks.deleteSpace.useMutation({
    onSuccess: (_r, vars) => {
      utils.tasks.spaces.invalidate();
      utils.tasks.board.invalidate();
      toast({ title: "Bo'lim o'chirildi", variant: "success" });
      if (vars.id === selected) onDeletedSelected();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Bo'limlarni boshqarish">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bo&apos;limlarni boshqarish</DialogTitle>
          <DialogDescription>
            Nomini o&apos;zgartiring yoki o&apos;chiring. Bo&apos;lim o&apos;chirilsa,
            undagi vazifalar o&apos;chmaydi — faqat &quot;Bo&apos;limsiz&quot; bo&apos;lib qoladi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {spaces.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Hali bo&apos;lim yo&apos;q.
            </p>
          )}
          {spaces.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5"
            >
              {editingId === s.id ? (
                <>
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-8 flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draft.trim()) {
                        rename.mutate({ id: s.id, name: draft.trim() });
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8"
                    disabled={!draft.trim() || rename.isPending}
                    onClick={() => rename.mutate({ id: s.id, name: draft.trim() })}
                    aria-label="Saqlash"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                    aria-label="Bekor"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.name}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingId(s.id);
                      setDraft(s.name);
                    }}
                    aria-label="Tahrirlash"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    disabled={del.isPending}
                    onClick={() => {
                      if (window.confirm(`"${s.name}" bo'limi o'chirilsinmi?`))
                        del.mutate({ id: s.id });
                    }}
                    aria-label="O'chirish"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Yopish</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
