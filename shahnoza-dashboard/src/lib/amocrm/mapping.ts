// AmoCRM v4 entity shapes (partial) + mapping helpers.

export interface AmoLead {
  id: number;
  name?: string;
  price?: number;
  status_id?: number;
  pipeline_id?: number;
  responsible_user_id?: number;
  created_at?: number; // unix seconds
  updated_at?: number;
  custom_fields_values?: Array<{
    field_code?: string;
    field_name?: string;
    values?: Array<{ value?: string | number }>;
  }> | null;
  _embedded?: {
    contacts?: Array<{ id: number }>;
  };
}

export interface AmoUser {
  id: number;
  name?: string;
  email?: string;
}

// AmoCRM system statuses (global across pipelines).
export const AMO_STATUS_WON = 142;
export const AMO_STATUS_LOST = 143;

/** Normalize an AmoCRM status_id into our lead status vocabulary. */
export function normalizeStatus(statusId?: number): string {
  if (statusId === AMO_STATUS_WON) return "won";
  if (statusId === AMO_STATUS_LOST) return "lost";
  return "new";
}

/** Pull a UTM/custom field value by field_code. */
export function pickCustomField(
  lead: AmoLead,
  code: string,
): string | null {
  const f = lead.custom_fields_values?.find(
    (c) => c.field_code?.toUpperCase() === code.toUpperCase(),
  );
  const v = f?.values?.[0]?.value;
  return v != null ? String(v) : null;
}

export function unixToIso(seconds?: number): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}
