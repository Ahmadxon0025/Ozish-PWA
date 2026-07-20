"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTH_NAMES_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

/**
 * Build month keys as `YYYY-MM-01` with Uzbek labels, newest first.
 * `past` months back + the current month + `future` months ahead. Future is 0
 * by default (actuals pages don't plan ahead); goal-setting pages pass a window.
 */
export function monthOptions(past = 12, future = 0): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = future; i >= -(past - 1); i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    out.push({
      value: `${d.getUTCFullYear()}-${mm}-01`,
      label: `${MONTH_NAMES_UZ[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    });
  }
  return out;
}

export function MonthSelect({
  value,
  onChange,
  past = 12,
  future = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Months back to offer (default 12). */
  past?: number;
  /** Months ahead to offer — for goal-setting pages (default 0). */
  future?: number;
}) {
  const options = monthOptions(past, future);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Oyni tanlang" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function currentMonthValue(): string {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${mm}-01`;
}
