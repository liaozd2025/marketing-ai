ALTER TABLE assets
  ADD COLUMN indexing_status text NOT NULL DEFAULT 'not_indexed'
    CHECK (
      indexing_status IN (
        'not_indexed',
        'queued',
        'running',
        'succeeded',
        'failed'
      )
    ),
  ADD COLUMN indexing_task_id uuid,
  ADD COLUMN indexing_error text,
  ADD COLUMN indexed_at timestamptz;

CREATE INDEX assets_merchant_indexing_status_idx
  ON assets (merchant_id, indexing_status, updated_at DESC);

CREATE INDEX assets_merchant_search_filters_idx
  ON assets (merchant_id, scene, offering_id);

ALTER TABLE assets
  ADD FOREIGN KEY (merchant_id, indexing_task_id)
    REFERENCES agent_tasks(merchant_id, id)
    ON DELETE SET NULL (indexing_task_id);

ALTER TABLE knowledge_item_embeddings
  ADD COLUMN task_id uuid,
  ADD COLUMN provider_id text,
  ADD COLUMN embedding_space text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE knowledge_item_embeddings
SET embedding_space = 'legacy:1536'
WHERE embedding_space IS NULL;

ALTER TABLE knowledge_item_embeddings
  ALTER COLUMN embedding_space SET NOT NULL;

CREATE UNIQUE INDEX knowledge_item_embeddings_source_idx
  ON knowledge_item_embeddings (merchant_id, source_type, source_id);

CREATE INDEX knowledge_item_embeddings_space_idx
  ON knowledge_item_embeddings (merchant_id, embedding_space);

ALTER TABLE knowledge_item_embeddings
  ADD FOREIGN KEY (merchant_id, task_id)
    REFERENCES agent_tasks(merchant_id, id)
    ON DELETE SET NULL (task_id);
