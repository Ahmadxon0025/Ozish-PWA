-- Alfred long-term memory: durable facts extracted from conversations and
-- task history, injected into every chat's system prompt.
-- Access is server-side only (service role); RLS is enabled with no policies
-- so user-scoped clients cannot read or write it directly.

CREATE TABLE IF NOT EXISTS alfred_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  category VARCHAR NOT NULL DEFAULT 'general'
    CHECK (category IN ('team', 'person', 'process', 'preference', 'general')),
  source VARCHAR NOT NULL DEFAULT 'chat'
    CHECK (source IN ('chat', 'task', 'manual')),
  created_by UUID REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alfred_memories_active
  ON alfred_memories (active, created_at DESC);

ALTER TABLE alfred_memories ENABLE ROW LEVEL SECURITY;
