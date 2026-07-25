-- Alfred Phase 2: Conversation & Action Tracking Tables

-- Conversation state for persistent Alfred chat
CREATE TABLE alfred_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  workspace_id UUID,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  context_snapshot JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- Action execution audit trail
CREATE TABLE alfred_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES alfred_conversations(id),
  actor_id UUID REFERENCES users(id),
  action_type VARCHAR NOT NULL CHECK (action_type IN ('assign', 'update', 'create', 'notify', 'schedule')),
  target_id VARCHAR,
  target_type VARCHAR,
  input_data JSONB,
  output_data JSONB,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'cancelled')),
  error_message TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences for Alfred
CREATE TABLE alfred_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE NOT NULL,
  auto_confirm_assignments BOOLEAN DEFAULT false,
  split_strategy VARCHAR DEFAULT 'balanced' CHECK (split_strategy IN ('balanced', 'capacity', 'skill')),
  notification_level VARCHAR DEFAULT 'compact' CHECK (notification_level IN ('verbose', 'compact', 'minimal')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_alfred_conversations_user_id ON alfred_conversations(user_id);
CREATE INDEX idx_alfred_conversations_active ON alfred_conversations(active, updated_at DESC);
CREATE INDEX idx_alfred_action_log_conversation_id ON alfred_action_log(conversation_id);
CREATE INDEX idx_alfred_action_log_actor_id ON alfred_action_log(actor_id);
CREATE INDEX idx_alfred_action_log_status ON alfred_action_log(status);

-- RLS Policies
ALTER TABLE alfred_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfred_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfred_user_preferences ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only see their own
CREATE POLICY alfred_conversations_select ON alfred_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY alfred_conversations_insert ON alfred_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY alfred_conversations_update ON alfred_conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- Action log: Users can only see actions from their own conversations
CREATE POLICY alfred_action_log_select ON alfred_action_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM alfred_conversations c
      WHERE c.id = alfred_action_log.conversation_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY alfred_action_log_insert ON alfred_action_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM alfred_conversations c
      WHERE c.id = alfred_action_log.conversation_id
      AND c.user_id = auth.uid()
    )
    AND actor_id = auth.uid()
  );

-- User preferences: Users can only manage their own
CREATE POLICY alfred_user_preferences_select ON alfred_user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY alfred_user_preferences_insert ON alfred_user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY alfred_user_preferences_update ON alfred_user_preferences
  FOR UPDATE USING (auth.uid() = user_id);
