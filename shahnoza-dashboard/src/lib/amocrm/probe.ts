import "server-only";
import { amoGet } from "./client";

export interface AmoStructure {
  pipelines: {
    id: number;
    name: string;
    isMain: boolean;
    statuses: { id: number; name: string; type: number }[];
  }[];
  fields: {
    id: number;
    name: string;
    code: string | null;
    type: string;
    enums: string[];
  }[];
  sample: { page1Count: number; hasNext: boolean };
}

interface AmoPipeline {
  id: number;
  name?: string;
  is_main?: boolean;
  _embedded?: { statuses?: { id: number; name?: string; type?: number }[] };
}
interface AmoField {
  id: number;
  name?: string;
  code?: string | null;
  type?: string;
  enums?: { id: number; value?: string }[] | null;
}

/**
 * Read-only discovery of the connected AmoCRM account: pipelines + their
 * statuses, the lead custom-field catalog (names + dropdown values), and a
 * quick page-1 lead sample. Used to map fields precisely before syncing.
 */
export async function probeAmocrm(): Promise<AmoStructure> {
  // Pipelines + statuses
  const pipeRes = await amoGet<{ _embedded?: { pipelines?: AmoPipeline[] } }>(
    "/api/v4/leads/pipelines",
  );
  const pipelines = (pipeRes?._embedded?.pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? "—",
    isMain: !!p.is_main,
    statuses: (p._embedded?.statuses ?? []).map((s) => ({
      id: s.id,
      name: s.name ?? "—",
      type: s.type ?? 0,
    })),
  }));

  // Custom fields (paged, up to ~750)
  const fields: AmoStructure["fields"] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await amoGet<{ _embedded?: { custom_fields?: AmoField[] } }>(
      "/api/v4/leads/custom_fields",
      { page, limit: 250 },
    );
    const chunk = res?._embedded?.custom_fields ?? [];
    for (const f of chunk) {
      fields.push({
        id: f.id,
        name: f.name ?? "—",
        code: f.code ?? null,
        type: f.type ?? "—",
        enums: (f.enums ?? []).map((e) => e.value ?? "").filter(Boolean),
      });
    }
    if (chunk.length < 250) break;
  }

  // Page-1 lead sample (does pagination even return a full page?)
  const sampleRes = await amoGet<{
    _embedded?: { leads?: unknown[] };
    _links?: { next?: unknown };
  }>("/api/v4/leads", { page: 1, limit: 250 });
  const sample = {
    page1Count: sampleRes?._embedded?.leads?.length ?? 0,
    hasNext: Boolean(sampleRes?._links?.next),
  };

  return { pipelines, fields, sample };
}
