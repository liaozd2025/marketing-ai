CREATE TABLE knowledge_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL,
  task_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('paste', 'upload')),
  source_name text NOT NULL CHECK (length(trim(source_name)) > 0),
  source_media_type text NOT NULL CHECK (length(trim(source_media_type)) > 0),
  source_size integer NOT NULL CHECK (source_size > 0 AND source_size <= 100000),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'review', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (merchant_id, id),
  UNIQUE (merchant_id, task_id),
  FOREIGN KEY (merchant_id, created_by_member_id)
    REFERENCES members(merchant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_id, task_id)
    REFERENCES agent_tasks(merchant_id, id) ON DELETE CASCADE
);

CREATE INDEX knowledge_imports_merchant_created_idx
  ON knowledge_imports (merchant_id, created_at DESC);

CREATE TABLE knowledge_entity_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  import_id uuid NOT NULL,
  entity_type text NOT NULL
    CHECK (
      entity_type IN (
        'brandProfile',
        'offering',
        'audience',
        'campaign',
        'memberSegment',
        'asset'
      )
    ),
  position integer NOT NULL CHECK (position >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (merchant_id, id),
  UNIQUE (merchant_id, import_id, position),
  FOREIGN KEY (merchant_id, import_id)
    REFERENCES knowledge_imports(merchant_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'confirmed' AND confirmed_entity_id IS NOT NULL)
    OR (status <> 'confirmed' AND confirmed_entity_id IS NULL)
  )
);

CREATE INDEX knowledge_entity_drafts_import_idx
  ON knowledge_entity_drafts (merchant_id, import_id, position);
