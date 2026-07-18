// Parse a free-text finance message into an expense.
// Examples it understands:
//   "rasxod 50$ facebook reklama"
//   "rasxod 500 000 video montaj"
//   "xarajat 200000 som xosting"
//   "расход 100$ дизайнер"
//   edit replies: "60$", "instagram", "o'chir"

export type Currency = "USD" | "UZS";

export interface ParsedExpense {
  hasAmount: boolean;
  amount: number | null;
  currency: Currency;
  categoryName: string | null; // matched expense_categories.name, or null
  description: string;
  isDelete: boolean;
}

// Trigger words that mark a message as an expense command.
const TRIGGERS = [
  "rasxod",
  "rasxad",
  "xarajat",
  "harajat",
  "chiqim",
  "expense",
  "расход",
  "расход",
  "затрат",
];

const DELETE_WORDS = ["o'chir", "ochir", "o‘chir", "delete", "удали", "удалить", "o'chirish"];

// keyword -> expense_categories.name (seeded in 0004_finance.sql)
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/facebook|fb|фейсбук|фб/i, "Reklama - Facebook"],
  [/instagram|insta|инстаграм|инста|\big\b/i, "Reklama - Instagram"],
  [/telegram|\btg\b|телеграм/i, "Reklama - Telegram"],
  [/komissiya|комисси/i, "Sotuvchi komissiyasi"],
  [/maosh|oylik|zarplat|зарплат/i, "Sotuvchi maosh"],
  [/video|kontent|montaj|видео|контент|монтаж/i, "Video/Kontent"],
  [/saytchi|\bsayt\b|сайт/i, "Saytchi"],
  [/dizayn|дизайн/i, "Dizayner"],
  [/texnik|\btex\b|техник/i, "Texnik"],
  [/xosting|hosting|domain|домен|хостинг/i, "Xosting/Domain"],
  [/rahbar|rahbariyat|руковод/i, "Rahbariyat"],
];

const CURRENCY_USD = /\$|\busd\b|dollar|доллар/i;
const CURRENCY_UZS = /so['`‘’]?m|\bsom\b|\bsum\b|\buzs\b|сум/i;

export function isExpenseTrigger(text: string): boolean {
  const t = text.trim().toLowerCase();
  return TRIGGERS.some((w) => t.startsWith(w) || t.startsWith("/" + w));
}

/** Strip a leading trigger word (and optional leading slash). */
function stripTrigger(text: string): string {
  let t = text.trim();
  for (const w of TRIGGERS) {
    const re = new RegExp(`^/?${w}\\b[:,]?\\s*`, "i");
    if (re.test(t)) {
      t = t.replace(re, "");
      break;
    }
  }
  return t.trim();
}

function parseAmount(text: string): { amount: number | null; token: string | null } {
  // Grab the first number-ish token (allows spaces/commas/dots as separators).
  const m = text.match(/(\d[\d\s.,]*\d|\d)/);
  if (!m) return { amount: null, token: null };
  const raw = m[0];
  let cleaned = raw.replace(/\s/g, "");
  // If it has a comma and a dot, assume comma = thousands.
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    // comma only: treat as thousands separator
    cleaned = cleaned.replace(/,/g, "");
  }
  const amount = Number(cleaned);
  return { amount: Number.isFinite(amount) ? amount : null, token: raw };
}

function detectCategory(text: string): string | null {
  for (const [re, name] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return name;
  }
  return null;
}

/**
 * Parse a message body (trigger already-optional). Lenient: used both for new
 * expenses and for edit replies (where only some fields may be present).
 */
export function parseExpense(input: string): ParsedExpense {
  const isDelete = DELETE_WORDS.some((w) =>
    input.trim().toLowerCase().startsWith(w),
  );
  const body = stripTrigger(input);

  const { amount, token } = parseAmount(body);
  let currency: Currency = "USD";
  if (CURRENCY_USD.test(body)) currency = "USD";
  else if (CURRENCY_UZS.test(body)) currency = "UZS";
  else if (amount != null && amount >= 5000) currency = "UZS"; // heuristic

  const categoryName = detectCategory(body);

  // Description: remove the amount token + currency markers + category-ish noise.
  let description = body;
  if (token) description = description.replace(token, " ");
  description = description
    .replace(CURRENCY_USD, " ")
    .replace(CURRENCY_UZS, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    hasAmount: amount != null,
    amount,
    currency,
    categoryName,
    description,
    isDelete,
  };
}
