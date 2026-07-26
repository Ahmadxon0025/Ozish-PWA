-- 0036_purge_volatile_memories.sql
-- Alfred stored some volatile facts before the anti-volatile filter existed —
-- task counts, "OVERLOADED" states, velocity/delay numbers, balances. Those
-- change over time, so replaying them into answers makes Alfred confidently
-- wrong. Soft-delete (active = false) every stored memory that matches the
-- same volatile pattern the app now rejects at write time. Reversible: no row
-- is removed, only deactivated.

-- NB: PostgreSQL regex uses \y for a word boundary — \b means a literal
-- backspace here (unlike JS), so the "N ta" clause must use \y.
UPDATE alfred_memories
SET active = false,
    updated_at = NOW()
WHERE active = true
  AND content ~* '([0-9]+\s*(ta|bitim)\y)|overloaded|hozircha|bugungi|shu\s+(hafta|oy)da|balans|qoldiq|velocity|vazifa/kun|kechikish\s+[0-9]|[0-9]+\s*so''?m';
