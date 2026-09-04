import type {
  Manba,
  OylikDaromad,
  Segment,
  Tarif,
  Tayyorlik,
} from "@/types/crm";
import { MANBA_OPTIONS, TARIF_OPTIONS } from "./constants";
import { normalizePhone } from "./phone";

export const FORM_FIELD_TYPES = [
  "text",
  "phone",
  "textarea",
  "select",
  "number",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_MAP_TO = [
  "ism",
  "telefon",
  "telegram",
  "tarif",
  "tarif_qiziqishi",
  "manba",
  "viloyat",
  "segment",
  "oylik_daromad",
  "tayyorlik",
  "izoh",
] as const;

export type FormMapTo = (typeof FORM_MAP_TO)[number];

export type CrmFormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  map_to: FormMapTo;
};

export type CrmForm = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  default_manba: Manba | null;
  default_tarif: Tarif | null;
  cohort_id: string | null;
  fields: CrmFormField[];
  webhook_token: string;
};

export const SEGMENT_OPTIONS: Segment[] = [
  "Hamshira",
  "Uy_bekasi",
  "Amaliyotchi",
  "Boshqa",
];

export const OYLIK_OPTIONS: OylikDaromad[] = [
  "yoq",
  "bir_bir_besh",
  "bir_besh_ikki",
  "ikki_uch",
  "uch_plus",
];

export const TAYYORLIK_OPTIONS: Tayyorlik[] = [
  "Toliq tayyor",
  "Qisman tayyor",
  "Tayyor emas",
];

const ENUM_VALUES: Partial<Record<FormMapTo, readonly string[]>> = {
  tarif: TARIF_OPTIONS,
  tarif_qiziqishi: TARIF_OPTIONS,
  manba: MANBA_OPTIONS,
  segment: SEGMENT_OPTIONS,
  oylik_daromad: OYLIK_OPTIONS,
  tayyorlik: TAYYORLIK_OPTIONS,
};

export function slugify(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "forma";
}

export function defaultFormFields(): CrmFormField[] {
  return [
    { key: "ism", label: "Ism", type: "text", required: true, map_to: "ism" },
    {
      key: "telefon",
      label: "Telefon",
      type: "phone",
      required: true,
      map_to: "telefon",
    },
    {
      key: "tarif",
      label: "Tarif",
      type: "select",
      required: false,
      options: [...TARIF_OPTIONS],
      map_to: "tarif",
    },
    { key: "izoh", label: "Izoh", type: "textarea", required: false, map_to: "izoh" },
  ];
}

export function parseFormFields(raw: unknown): CrmFormField[] {
  if (!Array.isArray(raw)) return [];
  const fields: CrmFormField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const type = FORM_FIELD_TYPES.includes(row.type as FormFieldType)
      ? (row.type as FormFieldType)
      : "text";
    const mapTo = FORM_MAP_TO.includes(row.map_to as FormMapTo)
      ? (row.map_to as FormMapTo)
      : "izoh";
    if (!key || !label) continue;
    const options = Array.isArray(row.options)
      ? row.options.filter((o): o is string => typeof o === "string" && o.trim() !== "")
      : undefined;
    fields.push({
      key,
      label,
      type,
      required: Boolean(row.required),
      options,
      map_to: mapTo,
    });
  }
  return fields;
}

export function rowToForm(row: Record<string, unknown>): CrmForm {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    is_active: Boolean(row.is_active),
    default_manba: (row.default_manba as Manba | null) ?? null,
    default_tarif: (row.default_tarif as Tarif | null) ?? null,
    cohort_id: (row.cohort_id as string | null) ?? null,
    fields: parseFormFields(row.fields),
    webhook_token: String(row.webhook_token ?? ""),
  };
}

function answerFor(field: CrmFormField, answers: Record<string, string>): string {
  const byKey = answers[field.key];
  if (typeof byKey === "string" && byKey.trim()) return byKey.trim();
  const byLabel = answers[field.label];
  if (typeof byLabel === "string" && byLabel.trim()) return byLabel.trim();
  return "";
}

export type MappedLeadDraft = {
  ism: string;
  telefon: string;
  tarif: Tarif;
  manba: Manba;
  cohort_id: string;
  izoh: string | null;
  telegram?: string;
  viloyat?: string;
  segment?: Segment;
  oylik_daromad?: OylikDaromad;
  tayyorlik?: Tayyorlik;
  tarif_qiziqishi?: Tarif;
};

export function mapFormAnswers(
  form: CrmForm,
  answers: Record<string, string>,
): { draft: MappedLeadDraft; missing: string[] } {
  const missing: string[] = [];
  const izohLines: string[] = [`form:${form.slug}`];
  const columns: Partial<Record<FormMapTo, string>> = {};

  for (const field of form.fields) {
    const value = answerFor(field, answers);
    if (!value) {
      if (field.required) missing.push(field.label);
      continue;
    }

    if (field.map_to === "izoh") {
      izohLines.push(`${field.label}: ${value}`);
      continue;
    }

    if (field.map_to === "telefon") {
      columns.telefon = normalizePhone(value);
      continue;
    }

    const allowed = ENUM_VALUES[field.map_to];
    if (allowed) {
      if (allowed.includes(value)) {
        columns[field.map_to] = value;
      } else {
        izohLines.push(`${field.label}: ${value}`);
      }
      continue;
    }

    columns[field.map_to] = value;
  }

  const tarif =
    (columns.tarif as Tarif | undefined) ?? form.default_tarif ?? "noma_lum";
  const manba =
    (columns.manba as Manba | undefined) ?? form.default_manba ?? "Boshqa";

  const extraIzoh = izohLines.length > 1 ? izohLines.join("\n") : izohLines[0] ?? null;

  return {
    missing,
    draft: {
      ism: columns.ism ?? "",
      telefon: columns.telefon ?? "",
      tarif: TARIF_OPTIONS.includes(tarif) ? tarif : "noma_lum",
      manba: MANBA_OPTIONS.includes(manba) ? manba : "Boshqa",
      cohort_id: form.cohort_id ?? "",
      izoh: extraIzoh,
      telegram: columns.telegram,
      viloyat: columns.viloyat,
      segment: columns.segment as Segment | undefined,
      oylik_daromad: columns.oylik_daromad as OylikDaromad | undefined,
      tayyorlik: columns.tayyorlik as Tayyorlik | undefined,
      tarif_qiziqishi: columns.tarif_qiziqishi as Tarif | undefined,
    },
  };
}

export function formLeadPrefix(slug: string): string {
  return `form:${slug}`;
}
