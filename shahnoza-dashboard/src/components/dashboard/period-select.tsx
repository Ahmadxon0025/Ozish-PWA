"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface Period {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  preset: string;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Build the from/to dates for a named preset (browser-local). */
export function presetRange(preset: string, base = new Date()): { from: string; to: string } {
  const y = base.getFullYear();
  const m = base.getMonth();
  const today = ymd(base);
  switch (preset) {
    case "last_month": {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0); // last day of prev month
      return { from: ymd(from), to: ymd(to) };
    }
    case "last_2_months":
      return { from: ymd(new Date(y, m - 1, 1)), to: today };
    case "this_year":
      return { from: ymd(new Date(y, 0, 1)), to: today };
    case "this_month":
    default:
      return { from: ymd(new Date(y, m, 1)), to: today };
  }
}

export function defaultPeriod(): Period {
  const r = presetRange("this_month");
  return { ...r, preset: "this_month" };
}

const PRESETS: { value: string; label: string }[] = [
  { value: "this_month", label: "Bu oy" },
  { value: "last_month", label: "O'tgan oy" },
  { value: "last_2_months", label: "So'nggi 2 oy" },
  { value: "this_year", label: "Bu yil" },
  { value: "custom", label: "Oraliq (tanlang)" },
];

export function PeriodSelect({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  function pick(preset: string) {
    if (preset === "custom") {
      onChange({ from, to, preset });
    } else {
      const r = presetRange(preset);
      setFrom(r.from);
      setTo(r.to);
      onChange({ ...r, preset });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onValueChange={pick}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              onChange({ from: e.target.value, to, preset: "custom" });
            }}
            className="w-[150px]"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              onChange({ from, to: e.target.value, preset: "custom" });
            }}
            className="w-[150px]"
          />
        </div>
      )}
    </div>
  );
}
