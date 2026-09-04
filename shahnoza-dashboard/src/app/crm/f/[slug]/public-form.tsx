"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CrmFormField } from "@/lib/crm/form-schema";

export function PublicForm({
  slug,
  token,
  fields,
}: {
  slug: string;
  token: string;
  fields: CrmFormField[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/intake/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, token, answers: values }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Yuborilmadi");
        return;
      }
      setDone(true);
    } catch {
      setError("Yuborilmadi");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-[#00a81a]">
          Rahmat! Tez orada bog&apos;lanamiz
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Arizangiz qabul qilindi. Mutaxassis siz bilan bog&apos;lanadi.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
    >
      {fields.map((field) => {
        const id = `f-${field.key}`;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={id}
                required={field.required}
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                disabled={pending}
                rows={4}
              />
            ) : field.type === "select" ? (
              <select
                id={id}
                required={field.required}
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                disabled={pending}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              >
                <option value="">Tanlang...</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={id}
                type={
                  field.type === "phone"
                    ? "tel"
                    : field.type === "number"
                      ? "number"
                      : "text"
                }
                required={field.required}
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                disabled={pending}
                placeholder={field.type === "phone" ? "+998..." : undefined}
              />
            )}
          </div>
        );
      })}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-[#00c31f] text-white hover:bg-[#00a81a]"
      >
        Yuborish
      </Button>
    </form>
  );
}
