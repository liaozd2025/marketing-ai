ALTER TABLE brand_profiles
  ADD COLUMN primary_color text NOT NULL DEFAULT '#7655FF'
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN accent_color text NOT NULL DEFAULT '#F4C7AB'
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN font_style text NOT NULL DEFAULT 'modern'
    CHECK (font_style IN ('modern', 'warm', 'editorial'));

CREATE TABLE compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL,
  asset_id uuid,
  template_id text NOT NULL
    CHECK (template_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  usage text NOT NULL CHECK (usage IN ('general', 'effect')),
  headline text NOT NULL CHECK (
    length(trim(headline)) > 0 AND length(headline) <= 80
  ),
  body text NOT NULL CHECK (
    length(trim(body)) > 0 AND length(body) <= 600
  ),
  output_mime_type text NOT NULL DEFAULT 'image/png'
    CHECK (output_mime_type = 'image/png'),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  storage_key text NOT NULL CHECK (length(trim(storage_key)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, id),
  UNIQUE (merchant_id, storage_key),
  FOREIGN KEY (merchant_id, created_by_member_id)
    REFERENCES members(merchant_id, id),
  FOREIGN KEY (merchant_id, asset_id)
    REFERENCES assets(merchant_id, id)
    ON DELETE SET NULL (asset_id)
);

CREATE INDEX compositions_merchant_created_idx
  ON compositions (merchant_id, created_at DESC);
