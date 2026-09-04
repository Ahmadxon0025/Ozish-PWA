"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { MANBA_OPTIONS, TARIF_OPTIONS } from "@/lib/crm/constants";
import {
  FORM_FIELD_TYPES,
  FORM_MAP_TO,
  slugify,
  type CrmForm,
  type CrmFormField,
  type FormFieldType,
  type FormMapTo,
} from "@/lib/crm/form-schema";
import type { CrmCohortOption } from "@/lib/crm/users";
import type { Manba, Tarif } from "@/types/crm";

const MAP_LABELS: Record<FormMapTo, string> = {
  ism: "ism",
  telefon: "telefon",
  telegram: "telegram",
  tarif: "tarif",
  tarif_qiziqishi: "tarif_qiziqishi",
  manba: "manba",
  viloyat: "viloyat",
  segment: "segment",
  oylik_daromad: "oylik_daromad",
  tayyorlik: "tayyorlik",
  izoh: "izoh",
};

function googleScript(webhookUrl: string, slug: string, token: string, fields: CrmFormField[]) {
  const mapLines = fields
    .map((f) => `    ${JSON.stringify(f.label)}: ${JSON.stringify(f.key)},`)
    .join("\n");
  return `// Million Massaj — Google Forms → CRM webhook
// 1) Extensions → Apps Script ga joylang
// 2) Trigger: From form → On form submit

var WEBHOOK_URL = ${JSON.stringify(webhookUrl)};
var SLUG = ${JSON.stringify(slug)};
var TOKEN = ${JSON.stringify(token)};
var KEY_MAP = {
${mapLines}
};

function onFormSubmit(e) {
  var answers = {};
  var items = e.response.getItemResponses();
  for (var i = 0; i < items.length; i++) {
    var title = items[i].getItem().getTitle();
    var key = KEY_MAP[title] || title;
    answers[key] = String(items[i].getResponse());
  }
  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ slug: SLUG, token: TOKEN, answers: answers }),
    muteHttpExceptions: true
  });
}
`;
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} nusxalandi`, variant: "success" });
  } catch {
    toast({ title: "Nusxalanmadi", variant: "destructive" });
  }
}

function emptyField(): CrmFormField {
  return {
    key: `field_${Date.now().toString(36)}`,
    label: "Yangi maydon",
    type: "text",
    required: false,
    map_to: "izoh",
  };
}

export function FormEditor({
  form,
  cohorts,
  appUrl,
}: {
  form: CrmForm;
  cohorts: CrmCohortOption[];
  appUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [slug, setSlug] = useState(form.slug);
  const [isActive, setIsActive] = useState(form.is_active);
  const [manba, setManba] = useState<Manba>(form.default_manba ?? "Boshqa");
  const [tarif, setTarif] = useState<Tarif>(form.default_tarif ?? "noma_lum");
  const [cohortId, setCohortId] = useState(form.cohort_id ?? "");
  const [fields, setFields] = useState<CrmFormField[]>(form.fields);
  const [pending, setPending] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : appUrl.replace(/\/$/, "");
  const publicUrl = `${origin}/crm/f/${slug || form.slug}`;
  const webhookUrl = `${origin}/api/crm/intake/webhook`;
  const script = useMemo(
    () => googleScript(webhookUrl, slug || form.slug, form.webhook_token, fields),
    [webhookUrl, slug, form.slug, form.webhook_token, fields],
  );

  function updateField(index: number, patch: Partial<CrmFormField>) {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const next = { ...f, ...patch };
        if (patch.label && (!f.key || f.key.startsWith("field_"))) {
          next.key = slugify(patch.label).replace(/-/g, "_") || f.key;
        }
        if (patch.type && patch.type !== "select") {
          delete next.options;
        }
        return next;
      }),
    );
  }

  function moveField(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= fields.length) return;
    setFields((prev) => {
      const copy = [...prev];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  }

  async function onSave() {
    setPending(true);
    try {
      const res = await fetch(`/api/crm/forms/${form.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          is_active: isActive,
          default_manba: manba,
          default_tarif: tarif,
          cohort_id: cohortId || null,
          fields,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Xatolik",
          description: json.error ?? "Saqlanmadi",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Saqlandi", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Xatolik", description: "Saqlanmadi", variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{name || "Forma"}</h1>
          <p className="text-sm text-muted-foreground">Maydonlar va integratsiya</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/crm/forms">Ro&apos;yxat</Link>
          </Button>
          <Button size="sm" onClick={() => void onSave()} disabled={pending}>
            Saqlash
          </Button>
        </div>
      </div>

      <section className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nomi</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Manba</Label>
          <Select value={manba} onValueChange={(v) => setManba(v as Manba)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANBA_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tarif</Label>
          <Select value={tarif} onValueChange={(v) => setTarif(v as Tarif)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARIF_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Kogorta</Label>
          <Select
            value={cohortId || "none"}
            onValueChange={(v) => setCohortId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tanlang" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Tanlanmagan</SelectItem>
              {cohorts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant={isActive ? "default" : "outline"}
            onClick={() => setIsActive((v) => !v)}
          >
            {isActive ? "Faol" : "Nofaol"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Maydonlar</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFields((prev) => [...prev, emptyField()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Maydon
          </Button>
        </div>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={`${field.key}-${index}`}
              className="grid gap-2 rounded-md border bg-card p-3 md:grid-cols-[1fr_8rem_7rem_auto]"
            >
              <div className="space-y-1.5">
                <Label className="text-xs">Yorliq</Label>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tur</Label>
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(index, { type: v as FormFieldType })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">map_to</Label>
                <Select
                  value={field.map_to}
                  onValueChange={(v) => updateField(index, { map_to: v as FormMapTo })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_MAP_TO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MAP_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant={field.required ? "default" : "outline"}
                  title="Majburiy"
                  onClick={() => updateField(index, { required: !field.required })}
                >
                  *
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => moveField(index, -1)}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => moveField(index, 1)}
                  disabled={index === fields.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                  disabled={fields.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {field.type === "select" ? (
                <div className="space-y-1.5 md:col-span-4">
                  <Label className="text-xs">Variantlar (vergul bilan)</Label>
                  <Input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) =>
                      updateField(index, {
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <h2 className="text-sm font-semibold">Integratsiya</h2>
        <CopyRow label="Ommaviy forma" value={publicUrl} />
        <CopyRow label="Webhook URL" value={webhookUrl} />
        <CopyRow label="Token" value={form.webhook_token} mono />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Google Apps Script</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyText(script, "Skript")}
            >
              <Copy className="mr-1 h-4 w-4" />
              Nusxa
            </Button>
          </div>
          <Textarea
            readOnly
            value={script}
            rows={14}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Google Form savol sarlavhalarini yuqoridagi maydon yorliqlari bilan
            bir xil qiling — skript KEY_MAP orqali field key ga o&apos;giradi.
          </p>
        </div>
      </section>
    </div>
  );
}

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className={mono ? "font-mono text-xs" : ""} />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => void copyText(value, label)}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
