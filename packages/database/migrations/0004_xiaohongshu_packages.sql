ALTER TABLE compositions
  ADD COLUMN source_task_id uuid;

ALTER TABLE compositions
  ADD FOREIGN KEY (merchant_id, source_task_id)
    REFERENCES agent_tasks(merchant_id, id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX compositions_merchant_source_task_idx
  ON compositions (merchant_id, source_task_id)
  WHERE source_task_id IS NOT NULL;
