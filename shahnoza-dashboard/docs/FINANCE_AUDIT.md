# Finance Audit & Rebuild — Shahnoza Dashboard

> Audit + change log for the finance surface (Next.js 14 + tRPC + Supabase, RLS).
> The app has **live financial data**. Nothing in this work drops a table or a
> money row; every schema change is additive (`ON CONFLICT DO NOTHING`).
> UI stays Uzbek; USD is the canonical summary currency; money is `DECIMAL` and
> rounded with `round2`.

---

## 1. Audit — what each piece does, and what was wrong

### Pages

| Page | Route | What it does | Findings |
|------|-------|--------------|----------|
| **P&L (Foyda)** | `/finance/pnl` | Period P&L + waterfall (Sotuv → −Qaytarish → −Xarajat → −Komissiya → Sof foyda) | Refunds were recognized in the **sale** month, not the refund month → **fixed** (see §2). |
| **Hisoblar (Kassa)** | `/finance/accounts` | Accounts with live balances, transfer/convert, deposit/withdraw, per-txn edit/delete | Was missing a way to record an **expense with a category** and a **per-account ledger** → **added** (see §2). |
| **Xarajatlar** | `/finance/expenses` | Standalone expense list + add + by-category chart | **Removed from nav; page now redirects** to Kassa. The `expenses` table, categories, Telegram flow, and P&L usage are all **kept**. |
| **Pul oqimi** | `/finance/cashflow` | Transaction list (external only), monthly bar chart, yearly Kirim/Chiqim/Sof table | Complete. Correctly excludes internal `transfer`/`conversion` from real cashflow. |
| **Taqsimot (Egalar)** | `/finance/owners` | Owner profit split: entitlement vs taken vs owed, loss-bearer logic | Correct. Shahnoza bears 100% of loss; the 30/70 (or configured) split applies only to profit. |
| **Bonuslar** | `/finance/bonuses` | Super-admin 30% monthly bonus calc + save/history | Correct, but see the **commission-definition** note below (§1, Routers). |
| **Komissiyalar** | `/finance/commissions` | Per-sale + per-seller commission (12% default, per-user override) | Correct as a **payout ledger** (net of refunds). Differs by design from the P&L commission line — documented below. |

### Routers & business logic

- **`finance.ts`**
  - `gatherPeriod()` — now fetches refunds **separately by `refunded_at`** and returns `refundsUsd`; revenue/commission still recognized at `sold_at`. This is the core P&L correctness fix.
  - `netProfitFor()` — `Net = (Gross − Refunds) − (OpEx + Commissions)`. Commission here is computed on **gross** sale amount in the sale month (accrual); refunds land in the refund month via their own line. Single, documented definition for the P&L.
  - `cashflow` — ledger-based; excludes `INTERNAL_KINDS = {transfer, conversion}`; monthly + yearly roll-ups. Good.
  - `commissions` — payout view: 12% (or per-user rate) of **net** (gross − refund). This is *what to pay the seller*, deliberately different from the P&L accrual line.
  - `distribution` / `ownerShares` / `setOwnerShare` / `recordOwnerPayout` / `ownerPayouts` — profit split with loss-bearer flag; payouts are real account `owner_draw` movements. Good.
  - `bonus` — cash collected (net sales) − (OpEx + commissions) − admin salary, ×30% if positive. Uses the same period gather.
- **`accounts.ts`** — balances = Σ(in) − Σ(out) per account, converted to USD at the CBU rate. `transactions` now also **enriches expense-linked rows with their category name** (for the ledger). Expense/sale/refund-linked entries are **locked** from manual edit/delete (must be changed at the source) — prevents ledger drift.
- **`expenses.ts`** — `create` writes the `expenses` row **and** (via `insertAccountEntry`) one `account_transactions` out-entry against the chosen/default account. `delete` removes the linked entry first (`deleteRelatedEntries`) then the row. **No double-post** — one code path posts exactly once to each table.
- **`account-posting.ts`** — `insertAccountEntry` / `resolveDefaultAccountId` / `deleteRelatedEntries`. Native `amount` derived from account currency; `amount_usd` always stored. This is the single posting path reused by expenses, sales, and owner payouts.
- **`pnl.ts` / `commission.ts` / `bonus.ts` / `distribution.ts` / `currency.ts` / `exchange-rate.ts`** — pure functions, `round2` throughout, CBU rate cached in `fx_rates` with a fallback. Sound.

### Flagged: absurd / redundant / dead / mathematically risky

1. **Refunds recognized in the wrong month** *(math)* — was `sold_at` + `is_refunded`; **fixed** to `refunded_at`.
2. **Two commission numbers** *(clarity, not a bug)* — the **P&L** line accrues commission on gross in the sale month; the **Komissiyalar** page shows commission net of refunds (what to actually pay). These are two *different* metrics (accrued cost vs. payout owed) and are now labelled as such. They only diverge when refunds exist, by `rate × refund`. Not unified into one number on purpose — see §4 for the alternative (clawback) if the owner prefers.
3. **Commission double-count trap** *(process)* — commissions are **auto-computed** (12%) and added on top of `expenses`. If someone *also* logs a manual expense under **"Sotuvchi komissiyasi"**, it double-counts. Mitigation: that category should be used only when commission is **not** auto-computed for a seller. Documented; no code change (removing the category would touch historical rows).
4. **Salaries** *(verified single-count)* — salaries live **only** in `expenses` (e.g. "Sotuvchi maosh", "Rahbariyat"); they are **not** re-derived anywhere, so there is **no salary double-count** in P&L.
5. **Thin category set** *(coverage)* — the app shipped 12 categories; the owner's spreadsheet tracks ~17 (Obunalar, Ofis, Ijara/Patera, Sayohat, Soliq, Mebel, Studiya, Ovqat, Marketing, Bilim, Mayda xarajat, Sotuv upgrade, Target). **Added** additively (§2).
6. **`commissions` query selects `product_id` but never uses it** *(dead select)* — harmless; left as-is to avoid churn.

---

## 2. What changed (this pass)

### Restructure — Xarajat folded into Kassa
- **Removed** the "Xarajatlar" nav item (`src/lib/nav.ts`).
- **Redirected** `/finance/expenses` → `/finance/accounts` (server `redirect()`), so old links/bookmarks don't 404.
- **Kept** the `expenses` table, `expense_categories`, the Telegram expense flow, and P&L's category usage — only the standalone page/nav were retired.
- **Kassa now records and shows money in/out per account.** Each account card has four actions:
  - **Kirim** — external cash in (deposit; not a sale).
  - **Xarajat** — an operating expense **with a category + description**. This calls the existing `expenses.create`, which writes the `expenses` row **and** the account out-entry through the one posting path → P&L and Pul oqimi stay correct, and **nothing double-posts**.
  - **Chiqim** — raw withdrawal (money out that is *not* an operating expense).
  - **Harakatlar** — a **per-account ledger** dialog (date, type/category, note, in/out) for that one account.
- The all-accounts table and the per-account ledger now show the **expense category** as the row type (via the enriched `accounts.transactions`).

### Expense categories expanded (additive migration)
- **`supabase/migrations/0012_expense_categories_expand.sql`** (also appended to `supabase/all_migrations.sql`) inserts 13 categories from the owner's spreadsheet with `ON CONFLICT (name) DO NOTHING` (idempotent, non-destructive): Obunalar, Ofis, Ijara, Sayohat, Soliq, Mebel, Studiya, Ovqat, Marketing, Bilim, Mayda xarajat, Sotuv upgrade, Target (reklama).
- **`Target (reklama)`** is added to the dashboard's `AD_CATEGORIES`, so ad-spend / ROAS / CAC count paid targeting.
- **Owner must run this migration** in the Supabase SQL editor (migrations are not auto-applied).

### P&L math (from the prior pass, recorded here for completeness)
- Refunds recognized by `refunded_at` in `finance.ts` (`gatherPeriod`, `netProfitFor`, `pnl`, `distribution`, `bonus`) and in `dashboard.ts` (`summary`, `metrics`).
- Decision cockpit KPIs on the dashboard: Reklama (ad spend), ROAS, CAC, AOV, ROI, Kassa — all guarded against divide-by-zero (show "—" when the denominator is 0).

---

## 3. Re-review — worked example (think after)

One month, entered through the new Kassa flow, verified by hand:

| Action | Effect |
|--------|--------|
| Sale **$100** (product, seller, credited to an account, `sold_at` in month) | `sales` +1 row; account **+$100** in-entry |
| **Xarajat $30** (Ofis) from a USD account | `expenses` +1 row; account **−$30** out-entry |
| **Kirim $50** (external deposit) | account **+$50** in-entry |
| **Transfer $20** UZS→USD (internal) | source −$20, dest +$20 (nets to 0; kind `transfer`) |

Reconciliation:
- **Kassa net cash change** = +100 − 30 + 50 = **+$120** (transfer nets to 0). ✓
- **Pul oqimi** = inflow (sale 100 + deposit 50) − outflow (expense 30) = **+$120**; transfer excluded as internal. ✓ *matches Kassa.*
- **P&L** = (100 − 0 refunds) − (30 OpEx + 12 commission @12%) = **$58**; margin 58/100 = **58%**. ✓
- **Decision KPIs** = Revenue 100, AdSpend 0 (Ofis isn't an ad) → ROAS/CAC = **"—"**, AOV = 100/1 = **100**, ROI = 58/42 = **138%**, Kassa = Σ balances. ✓ (no divide-by-zero)
- **Double-post check:** the expense produced exactly **one** `expenses` row + **one** `account_transactions` out-entry; the sale produced **one** sales row + **one** in-entry. Deleting the expense removes its ledger entry first. ✓

Redirect check: `/finance/expenses` now 302s to `/finance/accounts`; the "Xarajatlar" nav item is gone; no in-app link points at the old page. ✓
`pnpm typecheck` + `pnpm build` — green (see commit).

---

## 4. Recommendations (from the spreadsheet, for owner sign-off)

Found in `IS___Finans.xlsx`, worth adding next — flagged rather than built now because each is a **new module** (table + UI) beyond this pass's scope:

1. **HAQ QARZ — receivables/debts** (sheet "HAQ QARZ"): the owner tracks who owes the business and how much (e.g. Habibullo 400, Abbos 567, Azizbek 711; total 2 520). Proposed: a `receivables` table (counterparty, amount, currency, given/collected, status) with a small Kassa-adjacent page; collecting a debt posts a Kirim to an account. **Additive.**
2. **Reja / Budget (plan vs actual)** (sheets "Plan", "Reja yillik", "Pul kirim chiqim reja"): monthly/yearly targets per category and a plan-vs-actual variance view. Proposed: a `budget_targets` table (period, category, planned_usd) surfaced beside P&L. **Additive.**
3. **Commission clawback option** — if the owner wants P&L commission to match the payout ledger exactly, switch the P&L line to accrue on gross and **claw back `rate × refund` in the refund month**. Needs the refunded sale's rate carried into `gatherPeriod`. Left out now to avoid changing live profit numbers without sign-off.

Each is safe (additive tables, no change to existing money rows) and directly mirrors how the owner already runs the business on paper.

---

## 5. Self-critique of this audit

- I did **not** unify the two commission numbers, betting that "accrued cost" (P&L) and "payout owed" (Komissiyalar) are legitimately different views. If the owner reads them as one number, that's confusing — hence the explicit labelling and the §4 clawback option.
- The `Sotuvchi komissiyasi` double-count is mitigated by documentation, not by code — a disciplined-data assumption. A harder guard (warn when a manual commission expense is logged for a seller who also has auto-commission) would be safer.
- New categories widen the surface; each is a field someone can miscategorise (e.g. logging paid ads under "Marketing" instead of a "Reklama"/"Target" bucket would understate ad spend and inflate ROAS). Category hygiene now matters more.
- Cash-basis vs accrual: Pul oqimi is cash-basis (ledger), P&L is accrual (sold_at / refunded_at / expense_date). They will legitimately differ in any month with timing gaps; that's expected, not a bug — but worth stating to the owner.
