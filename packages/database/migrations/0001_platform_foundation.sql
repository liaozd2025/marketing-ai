CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE merchants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  id uuid PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id)
);

CREATE INDEX members_merchant_id_idx ON members (merchant_id);

-- ADR-0004: Postgres also owns vector search. Every retrievable record carries
-- merchant_id so future similarity queries cannot omit the tenant predicate.
CREATE TABLE knowledge_item_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('asset', 'history')),
  source_id uuid NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id)
);

CREATE INDEX knowledge_item_embeddings_merchant_id_idx
  ON knowledge_item_embeddings (merchant_id);

CREATE INDEX knowledge_item_embeddings_vector_idx
  ON knowledge_item_embeddings
  USING hnsw (embedding vector_cosine_ops);
