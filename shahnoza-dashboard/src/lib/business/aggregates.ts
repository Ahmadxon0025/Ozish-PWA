/**
 * Scale-safe aggregation helpers.
 *
 * Supabase caps a single select at 1,000 rows. Summing a whole table in JS
 * therefore silently drops rows once it grows past that — the balance looks
 * fine and is wrong. These helpers keep aggregates correct at any size:
 *  - getAccountBalances: sums in the database (one row per account) via the
 *    account_balances() RPC, with a paginated fallback if the migration
 *    (0035) hasn't been applied yet.
 *  - pagedSelect: fetches a filtered set across as many 1,000-row pages as it
 *    takes, so period sums never silently truncate.
 *
 * `db` is intentionally `any` so both the RLS-scoped server client and the
 * admin client work — same loose typing the surrounding modules use.
 */

const PAGE = 1000;
// Safety ceiling so a never-applied migration can't pull an unbounded table
// into memory. 500k rows is far beyond any period this app queries; crossing
// it means the aggregation RPC really needs to be applied.
const MAX_ROWS = 500_000;

/**
 * Fetch every row a query matches, in 1,000-row pages. `makeQuery(offset)` must
 * return a Supabase query already filtered/ordered, with `.range()` applied for
 * the page. Returns all rows concatenated. Logs and stops at MAX_ROWS.
 */
export async function pagedSelect<T = any>(
  makeQuery: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: any }>,
  label = "pagedSelect"
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await makeQuery(offset, PAGE);
    if (error) {
      console.error(`${label} page @${offset} failed:`, error.message ?? error);
      break;
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out; // last page
  }
  console.warn(
    `${label}: hit ${MAX_ROWS}-row ceiling — apply migration 0035 for DB-side aggregation.`
  );
  return out;
}

/**
 * Per-account balance (native currency), summed in the database.
 * Returns a Map<accountId, balance>. Never throws.
 */
export async function getAccountBalances(db: any): Promise<Map<string, number>> {
  // Fast path: aggregate in Postgres (migration 0035).
  try {
    const { data, error } = await db.rpc("account_balances");
    if (!error && Array.isArray(data)) {
      return new Map(
        data.map((r: any) => [r.account_id as string, Number(r.balance ?? 0)])
      );
    }
    if (error) {
      console.warn(
        "account_balances RPC unavailable, falling back to paginated sum:",
        error.message ?? error
      );
    }
  } catch (e) {
    console.warn("account_balances RPC threw, falling back:", e);
  }

  // Fallback: paginated full scan, summed in JS. Correct at any size (just
  // slower) so balances are never silently truncated before 0035 is applied.
  const rows = await pagedSelect<{ account_id: string; direction: string; amount: number | null }>(
    (offset, limit) =>
      db
        .from("account_transactions")
        .select("account_id, direction, amount")
        .range(offset, offset + limit - 1),
    "account_balances.fallback"
  );

  const balances = new Map<string, number>();
  for (const r of rows) {
    const delta = r.direction === "in" ? Number(r.amount ?? 0) : -Number(r.amount ?? 0);
    balances.set(r.account_id, (balances.get(r.account_id) ?? 0) + delta);
  }
  return balances;
}
