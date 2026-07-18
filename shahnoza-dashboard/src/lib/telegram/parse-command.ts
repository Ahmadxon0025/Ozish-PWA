// Pure parser for the treasury bot commands:
//   deposit   -> "kirim 6 mln firma"
//   transfer  -> "o'tkazma 3 mln firma viza"
// No I/O; the handler maps the returned aliases to real account rows.

const DEPOSIT_TRIGGERS = ["kirim", "deposit", "приход"];
const TRANSFER_TRIGGERS = [
  "o'tkazma",
  "o`tkazma",
  "o‘tkazma",
  "otkazma",
  "utkazma",
  "transfer",
  "перевод",
];

// Canonical account alias -> matching regex (word-ish, latin + cyrillic).
// Note "viza" (Uzbek spelling) as well as "visa".
const ACCOUNT_ALIAS_PATTERNS: [string, RegExp][] = [
  ["visa", /(?:^|\s)(?:visa|viza|виза|виз)(?:\s|$)/i],
  ["naqd", /(?:^|\s)(?:naqd|cash|нал)(?:\s|$)/i],
  ["karta", /(?:^|\s)(?:karta|card|карта)(?:\s|$)/i],
  ["firma", /(?:^|\s)(?:firma|firm|фирма)(?:\s|$)/i],
];

const USD_RE = /\$|\busd\b|dollar|доллар/i;
const UZS_RE = /so['`‘’]?m|\bsom\b|\bsum\b|\buzs\b|сум/i;

export function isDepositTrigger(text: string): boolean {
  const t = text.trim().toLowerCase();
  return DEPOSIT_TRIGGERS.some((w) => t.startsWith(w) || t.startsWith("/" + w));
}

export function isTransferTrigger(text: string): boolean {
  const t = text.trim().toLowerCase();
  return TRANSFER_TRIGGERS.some((w) => t.startsWith(w) || t.startsWith("/" + w));
}

/**
 * Parse the first amount in the text, honoring mln / ming multipliers.
 * "6 mln" -> 6000000, "500 ming" -> 500000, "1.5 mln" -> 1500000,
 * "6 000 000" -> 6000000, "100$" -> {amount:100,isUsd:true}.
 */
export function parseAmountUnits(text: string): { amount: number | null; isUsd: boolean } {
  const t = text.toLowerCase();
  const isUsd = USD_RE.test(t) && !UZS_RE.test(t);

  // 1) first number token (allows "6 000 000", "1.5", "1,5", "100")
  const m = t.match(/\d[\d\s.,]*\d|\d/);
  if (!m || m.index == null) return { amount: null, isUsd };

  let raw = m[0].replace(/\s/g, "");
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    const parts = raw.split(",");
    raw = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : raw.replace(/,/g, "");
  }

  let n = Number(raw);
  if (!Number.isFinite(n)) return { amount: null, isUsd };

  // 2) unit word immediately after the number (as a standalone token)
  const after = t.slice(m.index + m[0].length).replace(/^[\s.]+/, "");
  // \b is unreliable for cyrillic in JS, so use an explicit space/end lookahead.
  const bigUnit = after.match(/^(mln|million|млн)(?=\s|$)/i);
  const smallUnit = after.match(/^(ming|минг|тыс)(?=\s|$)/i);
  const shortUnit = after.match(/^([km])(?=\s|$)/i); // "6k" / "6m" only when standalone
  if (bigUnit || (shortUnit && shortUnit[1].toLowerCase() === "m")) n *= 1_000_000;
  else if (smallUnit || (shortUnit && shortUnit[1].toLowerCase() === "k")) n *= 1_000;

  return { amount: n, isUsd };
}

/** Canonical account aliases present in the text, in order of appearance. */
export function findAccountAliases(text: string): string[] {
  const padded = ` ${text.toLowerCase()} `;
  const hits: { idx: number; alias: string }[] = [];
  for (const [alias, re] of ACCOUNT_ALIAS_PATTERNS) {
    const m = re.exec(padded);
    if (m) hits.push({ idx: m.index, alias });
  }
  return hits.sort((a, b) => a.idx - b.idx).map((h) => h.alias);
}

export interface ParsedDeposit {
  amount: number | null;
  isUsd: boolean;
  accountAlias: string | null;
}

export function parseDeposit(text: string): ParsedDeposit {
  const { amount, isUsd } = parseAmountUnits(text);
  const aliases = findAccountAliases(text);
  return { amount, isUsd, accountAlias: aliases[0] ?? null };
}

export interface ParsedTransfer {
  amount: number | null;
  isUsd: boolean;
  fromAlias: string | null;
  toAlias: string | null;
}

export function parseTransfer(text: string): ParsedTransfer {
  const { amount, isUsd } = parseAmountUnits(text);
  const aliases = findAccountAliases(text);
  return { amount, isUsd, fromAlias: aliases[0] ?? null, toAlias: aliases[1] ?? null };
}
