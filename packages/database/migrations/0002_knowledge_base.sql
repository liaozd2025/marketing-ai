ALTER TABLE merchants
  ADD COLUMN vertical_pack_id text NOT NULL DEFAULT 'beauty-v1'
  CHECK (length(trim(vertical_pack_id)) > 0);

CREATE TABLE brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  persona text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT '',
  story text NOT NULL DEFAULT '',
  taboo_expressions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id)
);

CREATE TABLE offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text NOT NULL DEFAULT '',
  field_values jsonb NOT NULL DEFAULT '{}'
    CHECK (jsonb_typeof(field_values) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id)
);

CREATE INDEX offerings_merchant_id_idx ON offerings (merchant_id);

CREATE TABLE audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  pain_points text NOT NULL DEFAULT '',
  motivations text NOT NULL DEFAULT '',
  address_style text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id)
);

CREATE INDEX audiences_merchant_id_idx ON audiences (merchant_id);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  offer_details text NOT NULL DEFAULT '',
  rules text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at),
  UNIQUE (merchant_id, id)
);

CREATE INDEX campaigns_merchant_id_idx ON campaigns (merchant_id);

-- ADR-0003: this table stores segment definitions only. It intentionally has
-- no member records, names, phone numbers, email addresses, or other PII.
CREATE TABLE member_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  definition text NOT NULL DEFAULT '',
  trigger_scenarios text NOT NULL DEFAULT '',
  communication_goal text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id)
);

CREATE INDEX member_segments_merchant_id_idx
  ON member_segments (merchant_id);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  offering_id uuid,
  original_name text NOT NULL CHECK (length(trim(original_name)) > 0),
  mime_type text NOT NULL CHECK (
    mime_type LIKE 'image/%' OR mime_type LIKE 'video/%'
  ),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  storage_key text NOT NULL CHECK (length(trim(storage_key)) > 0),
  scene text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_real boolean NOT NULL DEFAULT true CHECK (is_real),
  is_effect_image boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id),
  UNIQUE (merchant_id, storage_key),
  FOREIGN KEY (merchant_id, offering_id)
    REFERENCES offerings(merchant_id, id)
    ON DELETE SET NULL (offering_id)
);

CREATE INDEX assets_merchant_id_idx ON assets (merchant_id);
CREATE INDEX assets_merchant_offering_idx
  ON assets (merchant_id, offering_id);
