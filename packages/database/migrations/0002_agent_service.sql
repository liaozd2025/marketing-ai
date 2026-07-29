CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, created_by_member_id)
    REFERENCES members(merchant_id, id) ON DELETE CASCADE
);

CREATE INDEX conversations_merchant_updated_idx
  ON conversations (merchant_id, updated_at DESC);

CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(content) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (merchant_id, conversation_id)
    REFERENCES conversations(merchant_id, id) ON DELETE CASCADE
);

CREATE INDEX conversation_messages_history_idx
  ON conversation_messages (merchant_id, conversation_id, created_at, id);

CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL,
  conversation_id uuid,
  capability text NOT NULL
    CHECK (capability IN ('text', 'image', 'embedding')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  input jsonb NOT NULL,
  result jsonb,
  error_code text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, created_by_member_id)
    REFERENCES members(merchant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_id, conversation_id)
    REFERENCES conversations(merchant_id, id) ON DELETE CASCADE,
  CHECK (
    (capability = 'text' AND conversation_id IS NOT NULL)
    OR (capability <> 'text' AND conversation_id IS NULL)
  ),
  CHECK (
    (status = 'succeeded' AND result IS NOT NULL)
    OR status <> 'succeeded'
  )
);

CREATE INDEX agent_tasks_queue_idx
  ON agent_tasks (available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX agent_tasks_merchant_created_idx
  ON agent_tasks (merchant_id, created_at DESC);

CREATE TABLE provider_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  task_id uuid NOT NULL,
  capability text NOT NULL
    CHECK (capability IN ('text', 'image', 'embedding')),
  provider_id text NOT NULL,
  route_position integer NOT NULL CHECK (route_position >= 0),
  task_attempt integer NOT NULL CHECK (task_attempt > 0),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (merchant_id, task_id)
    REFERENCES agent_tasks(merchant_id, id) ON DELETE CASCADE
);

CREATE INDEX provider_attempts_task_idx
  ON provider_attempts (merchant_id, task_id, task_attempt, route_position);
