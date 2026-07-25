# Alfred Roadmap — ClickUp Brain patterns, right-sized for this dashboard

This is the implementation plan distilled from a full teardown of ClickUp's AI
layer (Brain² chat, Autopilot/Super Agents, AI fields, metering, governance),
adapted to what this product actually is: a small-team internal ERP-style
dashboard (finance, sales, leads, tasks, treasury) on Next.js + Supabase.

## Ground rules (adopted as law)

1. **The model never computes numbers.** All figures in Alfred answers come
   from the app's own deterministic business logic (`lib/business/*`,
   Supabase aggregates). The model selects, explains, and narrates — it does
   not do arithmetic. Anything it can't see in its context, it must say it
   can't see.
2. **Writes are propose-then-approve, no exceptions.** Alfred emits a
   structured action proposal; the user clicks approve; the executor runs it
   under the requesting user's RLS-scoped client and logs to
   `alfred_action_log`. Task-level writes only. Finance is read-only.
   Delete does not exist as an action type.
3. **Permissions are inherited, never granted.** Alfred's context is built
   through the *requesting user's* Supabase client, so row-level security
   already filters what it can see. An agent never sees more than the person
   asking.
4. **Everything is metered and audited.** Model calls log to `ai_usage_log`;
   actions log to `alfred_action_log` with actor, input, output, timestamp.

## What exists today

| ClickUp concept | Our equivalent | Status |
|---|---|---|
| Docked side panel (Brain²) | Half-screen Alfred panel, chat-first | ✅ shipped |
| Context engine | Tasks + users + finance snapshot in prompt, RLS-filtered | ✅ shipped |
| Persistent memory | `alfred_memories` + per-exchange extraction loop | ✅ shipped |
| Conversation persistence | `alfred_conversations`, hydrated on open, "Yangi suhbat" | ✅ shipped |
| Suggestion chips | Data-derived chips (overdue counts baked in) | ✅ shipped |
| Propose-then-approve actions | Action block protocol → ProposalDisplay → executor | ✅ shipped |
| Audit log | `alfred_action_log`, `ai_usage_log` | ✅ shipped |
| Scheduled agents | Daily/evening Telegram crons + collection reminders (the "Creditor Watchdog" already existed) + Alfred morning brief | ✅ shipped |
| Cost metering | `ai_usage_log` (tokens per feature per user) | ✅ shipped (no UI yet) |

## Deliberately skipped (big-company problems)

- Multi-entity / multi-currency context chips — single entity, UZS/USD only
- Conversational agent builder + 90-agent catalog — we hand-build the 3–5
  agents this team needs
- Model routing UI — server picks the model (`claude-sonnet-5` for chat,
  `claude-haiku-4-5` for extraction/briefs)
- Per-seat AI quotas — team of ~5; `ai_usage_log` is enough for now

## Next increments (in order of value)

1. **AI usage dashboard card** — surface `ai_usage_log` as a small admin
   card (spend by feature/user, ClickUp-style bar). Data already exists.
2. **AI fields** — computed columns on records, ClickUp's most ERP-relevant
   pattern. Start with two: lead risk flag, task next-action. Explicit
   recompute button, cached value — never silently re-run.
3. **Drill-down links** — every number in an Alfred answer links to the page
   that shows the underlying rows (P&L → /finance, receivables → /payments).
4. **Approval inbox** — a page listing pending/executed Alfred actions from
   `alfred_action_log` (the trust dashboard; watch approval rate per agent).
5. **Streaming responses** — visible "work steps" while Alfred thinks
   (needs SSE alongside tRPC; cosmetic, do last).

## Metrics that matter

- Answer accuracy on a ~50-question eval set built from real usage
- % of numeric claims that came from the snapshot (target: 100%)
- Action proposal acceptance rate (below ~70% → retune the prompt)
- Weekly active Alfred users / total seats
- Tokens per resolved question (`ai_usage_log`)
