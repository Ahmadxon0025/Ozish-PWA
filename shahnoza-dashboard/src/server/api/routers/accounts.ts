import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  roleProcedure,
  managerProcedure,
  superAdminProcedure,
} from "@/server/api/trpc";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { round2 } from "@/lib/business/currency";
import { deleteRelatedEntries } from "@/lib/business/account-posting";
import { requireAdminClient } from "@/lib/supabase/admin";
import { groupBy, sum } from "./_helpers";

// Finance roles can read; managers (+super admin) can move money.
const financeProcedure = roleProcedure("super_admin", "owner", "sales_manager");
// Deleting a source record (expense/sale) is an owner-level correction.
const ownerProcedure = roleProcedure("super_admin", "owner");

function toUsdAt(amount: number, currency: string, uzsPerUsd: number): number {
  if (currency === "USD") return round2(amount);
  return round2(uzsPerUsd > 0 ? amount / uzsPerUsd : 0);
}

export const accountsRouter = createTRPCRouter({
  /** Current CBU rate (UZS per 1 USD) + freshness. */
  currentRate: financeProcedure.query(async ({ ctx }) => {
    return getCurrentRate(ctx.supabase);
  }),

  /** All accounts with live balances (native currency + USD equivalent). */
  list: financeProcedure.query(async ({ ctx }) => {
    const [{ data: accounts }, { data: txns }, rate] = await Promise.all([
      ctx.supabase
        .from("accounts")
        .select("*")
        .order("sort_order", { ascending: true }),
      ctx.supabase
        .from("account_transactions")
        .select("account_id, direction, amount"),
      getCurrentRate(ctx.supabase),
    ]);

    const byAccount = groupBy(txns ?? [], (t) => t.account_id);
    const items = (accounts ?? []).map((a) => {
      const rows = byAccount.get(a.id) ?? [];
      const inflow = sum(
        rows.filter((r) => r.direction === "in"),
        (r) => r.amount,
      );
      const outflow = sum(
        rows.filter((r) => r.direction === "out"),
        (r) => r.amount,
      );
      const balance = round2(inflow - outflow);
      return {
        ...a,
        balance, // in the account's own currency
        balanceUsd: toUsdAt(balance, a.currency, rate.rate),
      };
    });

    const totalUsd = round2(sum(items, (i) => i.balanceUsd));
    return { items, totalUsd, rate };
  }),

  /** Ledger, optionally filtered to one account. */
  transactions: financeProcedure
    .input(
      z
        .object({
          accountId: z.string().uuid().optional(),
          limit: z.number().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("account_transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(input?.limit ?? 50);
      if (input?.accountId) q = q.eq("account_id", input.accountId);
      const { data: txns } = await q;
      const rows = txns ?? [];

      const { data: accounts } = await ctx.supabase
        .from("accounts")
        .select("id, name, currency");
      const accName = new Map((accounts ?? []).map((a) => [a.id, a.name]));

      // Enrich expense-linked entries with their expense category name so the
      // ledger can show what an outflow was for.
      const expenseIds = rows
        .filter((t) => t.related_type === "expense" && t.related_id)
        .map((t) => t.related_id as string);
      const catByTxnRelated = new Map<string, string>();
      if (expenseIds.length > 0) {
        const [{ data: exp }, { data: cats }] = await Promise.all([
          ctx.supabase.from("expenses").select("id, category_id").in("id", expenseIds),
          ctx.supabase.from("expense_categories").select("id, name"),
        ]);
        const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
        for (const e of exp ?? []) {
          if (e.category_id) {
            const name = catName.get(e.category_id);
            if (name) catByTxnRelated.set(e.id, name);
          }
        }
      }

      return rows.map((t) => ({
        ...t,
        accountName: t.account_id ? accName.get(t.account_id) ?? "—" : "—",
        categoryName:
          t.related_type === "expense" && t.related_id
            ? catByTxnRelated.get(t.related_id) ?? null
            : null,
      }));
    }),

  /**
   * Expenses posted to NO account — counted in P&L but absent from the ledger
   * and cashflow (hence P&L/cashflow can disagree). Surfaced so the owner can
   * fix or delete them. Delete via accounts.deleteSource (passes the id here).
   */
  orphanExpenses: financeProcedure.query(async ({ ctx }) => {
    const [{ data: exp }, { data: cats }] = await Promise.all([
      ctx.supabase
        .from("expenses")
        .select("id, amount, amount_usd, currency, description, expense_date, category_id")
        .is("account_id", null)
        .order("expense_date", { ascending: false })
        .limit(100),
      ctx.supabase.from("expense_categories").select("id, name"),
    ]);
    const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
    return (exp ?? []).map((e) => ({
      id: e.id,
      amount: e.amount,
      amountUsd: e.amount_usd,
      currency: e.currency,
      description: e.description,
      date: e.expense_date,
      category: e.category_id ? catName.get(e.category_id) ?? null : null,
    }));
  }),

  /** Deposit money into an account (e.g. incoming from abroad to the Visa card). */
  deposit: managerProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        amount: z.number().positive(),
        description: z.string().optional(),
        kind: z.enum(["deposit", "manual", "adjustment", "sale"]).default("deposit"),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccount(ctx.supabase, input.accountId);
      const rate = await getCurrentRate(ctx.supabase);
      const { error } = await ctx.supabase.from("account_transactions").insert({
        account_id: account.id,
        direction: "in",
        kind: input.kind,
        amount: input.amount,
        currency: account.currency,
        amount_usd: toUsdAt(input.amount, account.currency, rate.rate),
        rate: rate.rate,
        description: input.description ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        created_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Withdraw money from an account. */
  withdraw: managerProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        amount: z.number().positive(),
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await getAccount(ctx.supabase, input.accountId);
      const rate = await getCurrentRate(ctx.supabase);
      const { error } = await ctx.supabase.from("account_transactions").insert({
        account_id: account.id,
        direction: "out",
        kind: "withdraw",
        amount: input.amount,
        currency: account.currency,
        amount_usd: toUsdAt(input.amount, account.currency, rate.rate),
        rate: rate.rate,
        description: input.description ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        created_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /**
   * Move money between accounts. If the accounts differ in currency the amount
   * is converted at the CBU rate (or an override), and both legs are recorded.
   * `amount` is expressed in the SOURCE account's currency.
   */
  transfer: managerProcedure
    .input(
      z.object({
        fromAccountId: z.string().uuid(),
        toAccountId: z.string().uuid(),
        amount: z.number().positive(),
        rate: z.number().positive().optional(), // override UZS-per-USD
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromAccountId === input.toAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bir xil hisob tanlandi." });
      }
      const [from, to] = await Promise.all([
        getAccount(ctx.supabase, input.fromAccountId),
        getAccount(ctx.supabase, input.toAccountId),
      ]);
      const current = await getCurrentRate(ctx.supabase);
      const rate = input.rate ?? current.rate;

      // Convert the source amount into the destination currency.
      let toAmount = input.amount;
      if (from.currency !== to.currency) {
        if (from.currency === "UZS" && to.currency === "USD") {
          toAmount = round2(input.amount / rate);
        } else if (from.currency === "USD" && to.currency === "UZS") {
          toAmount = round2(input.amount * rate);
        }
      }

      const outUsd = toUsdAt(input.amount, from.currency, rate);
      const inUsd = toUsdAt(toAmount, to.currency, rate);
      const group = randomUUID();
      const occurred = input.occurredAt ?? new Date().toISOString();
      const kind = from.currency === to.currency ? "transfer" : "conversion";

      const { error } = await ctx.supabase.from("account_transactions").insert([
        {
          account_id: from.id,
          direction: "out",
          kind,
          amount: input.amount,
          currency: from.currency,
          amount_usd: outUsd,
          rate,
          description: input.description ?? `→ ${to.name}`,
          transfer_group: group,
          occurred_at: occurred,
          created_by: ctx.appUser.id,
        },
        {
          account_id: to.id,
          direction: "in",
          kind,
          amount: toAmount,
          currency: to.currency,
          amount_usd: inUsd,
          rate,
          description: input.description ?? `← ${from.name}`,
          transfer_group: group,
          occurred_at: occurred,
          created_by: ctx.appUser.id,
        },
      ]);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true, toAmount, rate };
    }),

  createAccount: managerProcedure
    .input(
      z.object({
        name: z.string().min(1),
        kind: z.enum(["bank", "card", "cash", "visa", "other"]).default("bank"),
        currency: z.enum(["UZS", "USD"]).default("UZS"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error, data } = await ctx.supabase
        .from("accounts")
        .insert({ name: input.name, kind: input.kind, currency: input.currency })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  updateAccount: managerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      const { error } = await ctx.supabase
        .from("accounts")
        .update(patch as never)
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /**
   * Edit a manual ledger entry. Transfers/conversions update BOTH legs (the
   * amount is read in the source account's currency and re-converted at the
   * leg's stored rate). Entries created by an expense/sale must be edited at
   * their source, so those are rejected.
   */
  updateTransaction: managerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        amount: z.number().positive().optional(),
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: txn } = await ctx.supabase
        .from("account_transactions")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!txn) throw new TRPCError({ code: "NOT_FOUND" });
      if (["expense", "sale", "sale_refund"].includes(txn.related_type ?? "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bu yozuv Xarajatlar/Sotuvlar sahifasida tahrirlanadi.",
        });
      }
      const current = await getCurrentRate(ctx.supabase);

      if (txn.transfer_group) {
        const { data: legs } = await ctx.supabase
          .from("account_transactions")
          .select("*")
          .eq("transfer_group", txn.transfer_group);
        const clicked = (legs ?? []).find((l) => l.id === txn.id);
        const other = (legs ?? []).find((l) => l.id !== txn.id);
        if (!clicked || !other) throw new TRPCError({ code: "NOT_FOUND" });

        const rate = Number(clicked.rate ?? other.rate ?? current.rate);
        const desc = input.description;
        const occ = input.occurredAt;

        if (input.amount != null) {
          // amount is in the clicked leg's currency; re-derive the other leg.
          const newClicked = input.amount;
          let newOther = newClicked;
          if (clicked.currency !== other.currency) {
            // Convert the clicked-currency amount into the other leg's currency.
            newOther =
              clicked.currency === "UZS"
                ? round2(newClicked / rate) // so'm -> dollar
                : round2(newClicked * rate); // dollar -> so'm
          }
          await ctx.supabase
            .from("account_transactions")
            .update({
              amount: newClicked,
              amount_usd: toUsdAt(newClicked, clicked.currency, rate),
              ...(desc !== undefined ? { description: desc } : {}),
              ...(occ ? { occurred_at: occ } : {}),
            } as never)
            .eq("id", clicked.id);
          await ctx.supabase
            .from("account_transactions")
            .update({
              amount: newOther,
              amount_usd: toUsdAt(newOther, other.currency, rate),
              ...(occ ? { occurred_at: occ } : {}),
            } as never)
            .eq("id", other.id);
        } else if (desc !== undefined || occ) {
          await ctx.supabase
            .from("account_transactions")
            .update({
              ...(desc !== undefined ? { description: desc } : {}),
              ...(occ ? { occurred_at: occ } : {}),
            } as never)
            .eq("id", clicked.id);
          if (occ) {
            await ctx.supabase
              .from("account_transactions")
              .update({ occurred_at: occ } as never)
              .eq("id", other.id);
          }
        }
        return { ok: true };
      }

      // Single manual entry.
      const rate = Number(txn.rate ?? current.rate);
      const patch: Record<string, unknown> = {};
      if (input.amount != null) {
        patch.amount = input.amount;
        patch.amount_usd = toUsdAt(input.amount, txn.currency, rate);
      }
      if (input.description !== undefined) patch.description = input.description;
      if (input.occurredAt) patch.occurred_at = input.occurredAt;
      const { error } = await ctx.supabase
        .from("account_transactions")
        .update(patch as never)
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Delete a manual entry (both legs of a transfer). Expense/sale-linked
   * entries must be removed at their source. */
  deleteTransaction: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: txn } = await ctx.supabase
        .from("account_transactions")
        .select("id, transfer_group, related_type")
        .eq("id", input.id)
        .maybeSingle();
      if (!txn) throw new TRPCError({ code: "NOT_FOUND" });
      if (["expense", "sale", "sale_refund"].includes(txn.related_type ?? "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bu yozuv Xarajatlar/Sotuvlar sahifasida o'chiriladi.",
        });
      }
      if (txn.transfer_group) {
        await ctx.supabase
          .from("account_transactions")
          .delete()
          .eq("transfer_group", txn.transfer_group);
      } else {
        await ctx.supabase.from("account_transactions").delete().eq("id", input.id);
      }
      return { ok: true };
    }),

  /**
   * Delete the SOURCE behind a ledger row — its expense or sale, WITH every
   * dependent record — so the books stay consistent (no orphaned commissions,
   * payments, or ledger legs). Owner/super-admin only; irreversible. Manual
   * (source-less) rows are removed directly, like deleteTransaction.
   */
  deleteSource: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: txn } = await ctx.supabase
        .from("account_transactions")
        .select("id, related_type, related_id, transfer_group")
        .eq("id", input.id)
        .maybeSingle();

      // Elevated client: the role gate above is the authorization boundary; use
      // the service role so the delete isn't blocked by per-table RLS.
      const db = requireAdminClient();

      // No ledger row for this id → it's an orphan expense (no account posted)
      // surfaced in the ledger. Delete the expense directly.
      if (!txn) {
        const { data: exp } = await ctx.supabase
          .from("expenses")
          .select("id")
          .eq("id", input.id)
          .maybeSingle();
        if (!exp) throw new TRPCError({ code: "NOT_FOUND" });
        await deleteRelatedEntries(db, "expense", exp.id);
        const { error } = await db.from("expenses").delete().eq("id", exp.id);
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        return { ok: true, kind: "expense" as const };
      }

      const rid = txn.related_id;

      if (txn.related_type === "expense" && rid) {
        await deleteRelatedEntries(db, "expense", rid);
        const { error } = await db.from("expenses").delete().eq("id", rid);
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        return { ok: true, kind: "expense" as const };
      }

      if ((txn.related_type === "sale" || txn.related_type === "sale_refund") && rid) {
        // No FK cascade on sales → clear dependents first, then the ledger legs
        // (both "sale" and "sale_refund"), then the sale itself.
        await db.from("commissions").delete().eq("sale_id", rid);
        await db.from("payments").delete().eq("sale_id", rid);
        await db.from("account_transactions").delete().eq("related_id", rid);
        const { error } = await db.from("sales").delete().eq("id", rid);
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        return { ok: true, kind: "sale" as const };
      }

      // Source-less manual entry: remove both transfer legs (or the single row).
      if (txn.transfer_group) {
        await db
          .from("account_transactions")
          .delete()
          .eq("transfer_group", txn.transfer_group);
      } else {
        await db.from("account_transactions").delete().eq("id", input.id);
      }
      return { ok: true, kind: "manual" as const };
    }),

  /** Manually refresh the CBU rate now (super admin). */
  refreshRate: superAdminProcedure.mutation(async ({ ctx }) => {
    const { refreshFxRate } = await import("@/lib/business/exchange-rate");
    return refreshFxRate(ctx.supabase);
  }),
});

async function getAccount(
  db: Parameters<typeof getCurrentRate>[0],
  id: string,
) {
  const { data } = await db
    .from("accounts")
    .select("id, name, currency")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Hisob topilmadi." });
  return data;
}
