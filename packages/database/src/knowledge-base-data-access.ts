import type { QueryResultRow } from "pg";

import type {
  Asset,
  AssetInput,
  AssetSearchFilters,
  AssetSearchResult,
  Audience,
  AudienceInput,
  BrandProfile,
  BrandProfileInput,
  Campaign,
  CampaignInput,
  MemberSegment,
  MemberSegmentInput,
  Offering,
  OfferingInput,
} from "./knowledge-base-types";
import { embeddingVectorLiteral } from "./embedding";
import type { SqlExecutor, TenantId } from "./types";

interface RecordRow extends QueryResultRow {
  created_at: Date;
  id: string;
  merchant_id: TenantId;
  updated_at: Date;
}

interface BrandProfileRow extends RecordRow {
  accent_color: string;
  font_style: "editorial" | "modern" | "warm";
  persona: string;
  primary_color: string;
  story: string;
  taboo_expressions: string[];
  tone: string;
}

interface OfferingRow extends RecordRow {
  description: string;
  field_values: Record<string, unknown>;
  name: string;
}

interface AudienceRow extends RecordRow {
  address_style: string;
  motivations: string;
  name: string;
  pain_points: string;
}

interface CampaignRow extends RecordRow {
  ends_at: Date | null;
  name: string;
  offer_details: string;
  rules: string;
  starts_at: Date | null;
}

interface MemberSegmentRow extends RecordRow {
  communication_goal: string;
  definition: string;
  name: string;
  trigger_scenarios: string;
}

interface AssetRow extends RecordRow {
  byte_size: number | string;
  indexed_at: Date | null;
  indexing_error: string | null;
  indexing_status: Asset["indexingStatus"];
  indexing_task_id: string | null;
  is_effect_image: boolean;
  is_real: true;
  mime_type: string;
  notes: string;
  offering_id: string | null;
  original_name: string;
  scene: string;
  storage_key: string;
}

interface AssetSearchRow extends AssetRow {
  similarity: number | string;
}

function base(row: RecordRow) {
  return {
    createdAt: row.created_at,
    id: row.id,
    merchantId: row.merchant_id,
    updatedAt: row.updated_at,
  };
}

function toBrandProfile(row: BrandProfileRow): BrandProfile {
  return {
    ...base(row),
    accentColor: row.accent_color,
    fontStyle: row.font_style,
    persona: row.persona,
    primaryColor: row.primary_color,
    story: row.story,
    tabooExpressions: row.taboo_expressions,
    tone: row.tone,
  };
}

function toOffering(row: OfferingRow): Offering {
  return {
    ...base(row),
    description: row.description,
    fieldValues: row.field_values,
    name: row.name,
  };
}

function toAudience(row: AudienceRow): Audience {
  return {
    ...base(row),
    addressStyle: row.address_style,
    motivations: row.motivations,
    name: row.name,
    painPoints: row.pain_points,
  };
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    ...base(row),
    endsAt: row.ends_at,
    name: row.name,
    offerDetails: row.offer_details,
    rules: row.rules,
    startsAt: row.starts_at,
  };
}

function toMemberSegment(row: MemberSegmentRow): MemberSegment {
  return {
    ...base(row),
    communicationGoal: row.communication_goal,
    definition: row.definition,
    name: row.name,
    triggerScenarios: row.trigger_scenarios,
  };
}

function toAsset(row: AssetRow): Asset {
  return {
    ...base(row),
    byteSize: Number(row.byte_size),
    indexedAt: row.indexed_at,
    indexingError: row.indexing_error,
    indexingStatus: row.indexing_status,
    indexingTaskId: row.indexing_task_id,
    isEffectImage: row.is_effect_image,
    isReal: row.is_real,
    mimeType: row.mime_type,
    notes: row.notes,
    offeringId: row.offering_id,
    originalName: row.original_name,
    scene: row.scene,
    storageKey: row.storage_key,
  };
}

/**
 * Tenant-bound CRUD for the six fixed knowledge-base entities from ADR-0001.
 * No method accepts a merchant id; every statement binds the constructor id.
 */
export class KnowledgeBaseDataAccess {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly merchantId: TenantId,
  ) {}

  async getBrandProfile(): Promise<BrandProfile | null> {
    const result = await this.executor.query<BrandProfileRow>(
      `SELECT id, merchant_id, persona, tone, story, taboo_expressions,
              primary_color, accent_color, font_style, created_at, updated_at
       FROM brand_profiles
       WHERE merchant_id = $1`,
      [this.merchantId],
    );
    return result.rows[0] ? toBrandProfile(result.rows[0]) : null;
  }

  async saveBrandProfile(input: BrandProfileInput): Promise<BrandProfile> {
    const result = await this.executor.query<BrandProfileRow>(
      `INSERT INTO brand_profiles
         (merchant_id, persona, tone, story, taboo_expressions,
          primary_color, accent_color, font_style)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (merchant_id) DO UPDATE SET
         persona = EXCLUDED.persona,
         tone = EXCLUDED.tone,
         story = EXCLUDED.story,
         taboo_expressions = EXCLUDED.taboo_expressions,
         primary_color = EXCLUDED.primary_color,
         accent_color = EXCLUDED.accent_color,
         font_style = EXCLUDED.font_style,
         updated_at = now()
       WHERE brand_profiles.merchant_id = $1
       RETURNING id, merchant_id, persona, tone, story, taboo_expressions,
                 primary_color, accent_color, font_style,
                 created_at, updated_at`,
      [
        this.merchantId,
        input.persona,
        input.tone,
        input.story,
        [...input.tabooExpressions],
        input.primaryColor ?? "#7655FF",
        input.accentColor ?? "#F4C7AB",
        input.fontStyle ?? "modern",
      ],
    );
    return toBrandProfile(result.rows[0]);
  }

  async deleteBrandProfile(): Promise<boolean> {
    const result = await this.executor.query(
      "DELETE FROM brand_profiles WHERE merchant_id = $1",
      [this.merchantId],
    );
    return result.rowCount === 1;
  }

  async listOfferings(): Promise<Offering[]> {
    const result = await this.executor.query<OfferingRow>(
      `SELECT id, merchant_id, name, description, field_values,
              created_at, updated_at
       FROM offerings
       WHERE merchant_id = $1
       ORDER BY updated_at DESC, id`,
      [this.merchantId],
    );
    return result.rows.map(toOffering);
  }

  async getOffering(id: string): Promise<Offering | null> {
    const result = await this.executor.query<OfferingRow>(
      `SELECT id, merchant_id, name, description, field_values,
              created_at, updated_at
       FROM offerings
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toOffering(result.rows[0]) : null;
  }

  async createOffering(input: OfferingInput): Promise<Offering> {
    const result = await this.executor.query<OfferingRow>(
      `INSERT INTO offerings
         (merchant_id, name, description, field_values)
       VALUES ($1, $2, $3, $4)
       RETURNING id, merchant_id, name, description, field_values,
                 created_at, updated_at`,
      [
        this.merchantId,
        input.name,
        input.description,
        JSON.stringify(input.fieldValues),
      ],
    );
    return toOffering(result.rows[0]);
  }

  async updateOffering(
    id: string,
    input: OfferingInput,
  ): Promise<Offering | null> {
    const result = await this.executor.query<OfferingRow>(
      `UPDATE offerings
       SET name = $3, description = $4, field_values = $5, updated_at = now()
       WHERE merchant_id = $1 AND id = $2
       RETURNING id, merchant_id, name, description, field_values,
                 created_at, updated_at`,
      [
        this.merchantId,
        id,
        input.name,
        input.description,
        JSON.stringify(input.fieldValues),
      ],
    );
    return result.rows[0] ? toOffering(result.rows[0]) : null;
  }

  async deleteOffering(id: string): Promise<boolean> {
    return this.deleteById("offerings", id);
  }

  async listAudiences(): Promise<Audience[]> {
    const result = await this.executor.query<AudienceRow>(
      `SELECT id, merchant_id, name, pain_points, motivations, address_style,
              created_at, updated_at
       FROM audiences
       WHERE merchant_id = $1
       ORDER BY updated_at DESC, id`,
      [this.merchantId],
    );
    return result.rows.map(toAudience);
  }

  async getAudience(id: string): Promise<Audience | null> {
    const result = await this.executor.query<AudienceRow>(
      `SELECT id, merchant_id, name, pain_points, motivations, address_style,
              created_at, updated_at
       FROM audiences
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toAudience(result.rows[0]) : null;
  }

  async createAudience(input: AudienceInput): Promise<Audience> {
    const result = await this.executor.query<AudienceRow>(
      `INSERT INTO audiences
         (merchant_id, name, pain_points, motivations, address_style)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, merchant_id, name, pain_points, motivations,
                 address_style, created_at, updated_at`,
      [
        this.merchantId,
        input.name,
        input.painPoints,
        input.motivations,
        input.addressStyle,
      ],
    );
    return toAudience(result.rows[0]);
  }

  async updateAudience(
    id: string,
    input: AudienceInput,
  ): Promise<Audience | null> {
    const result = await this.executor.query<AudienceRow>(
      `UPDATE audiences
       SET name = $3, pain_points = $4, motivations = $5,
           address_style = $6, updated_at = now()
       WHERE merchant_id = $1 AND id = $2
       RETURNING id, merchant_id, name, pain_points, motivations,
                 address_style, created_at, updated_at`,
      [
        this.merchantId,
        id,
        input.name,
        input.painPoints,
        input.motivations,
        input.addressStyle,
      ],
    );
    return result.rows[0] ? toAudience(result.rows[0]) : null;
  }

  async deleteAudience(id: string): Promise<boolean> {
    return this.deleteById("audiences", id);
  }

  async listCampaigns(): Promise<Campaign[]> {
    const result = await this.executor.query<CampaignRow>(
      `SELECT id, merchant_id, name, starts_at, ends_at, offer_details, rules,
              created_at, updated_at
       FROM campaigns
       WHERE merchant_id = $1
       ORDER BY updated_at DESC, id`,
      [this.merchantId],
    );
    return result.rows.map(toCampaign);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const result = await this.executor.query<CampaignRow>(
      `SELECT id, merchant_id, name, starts_at, ends_at, offer_details, rules,
              created_at, updated_at
       FROM campaigns
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toCampaign(result.rows[0]) : null;
  }

  async createCampaign(input: CampaignInput): Promise<Campaign> {
    const result = await this.executor.query<CampaignRow>(
      `INSERT INTO campaigns
         (merchant_id, name, starts_at, ends_at, offer_details, rules)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, merchant_id, name, starts_at, ends_at, offer_details,
                 rules, created_at, updated_at`,
      [
        this.merchantId,
        input.name,
        input.startsAt,
        input.endsAt,
        input.offerDetails,
        input.rules,
      ],
    );
    return toCampaign(result.rows[0]);
  }

  async updateCampaign(
    id: string,
    input: CampaignInput,
  ): Promise<Campaign | null> {
    const result = await this.executor.query<CampaignRow>(
      `UPDATE campaigns
       SET name = $3, starts_at = $4, ends_at = $5, offer_details = $6,
           rules = $7, updated_at = now()
       WHERE merchant_id = $1 AND id = $2
       RETURNING id, merchant_id, name, starts_at, ends_at, offer_details,
                 rules, created_at, updated_at`,
      [
        this.merchantId,
        id,
        input.name,
        input.startsAt,
        input.endsAt,
        input.offerDetails,
        input.rules,
      ],
    );
    return result.rows[0] ? toCampaign(result.rows[0]) : null;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    return this.deleteById("campaigns", id);
  }

  async listMemberSegments(): Promise<MemberSegment[]> {
    const result = await this.executor.query<MemberSegmentRow>(
      `SELECT id, merchant_id, name, definition, trigger_scenarios,
              communication_goal, created_at, updated_at
       FROM member_segments
       WHERE merchant_id = $1
       ORDER BY updated_at DESC, id`,
      [this.merchantId],
    );
    return result.rows.map(toMemberSegment);
  }

  async getMemberSegment(id: string): Promise<MemberSegment | null> {
    const result = await this.executor.query<MemberSegmentRow>(
      `SELECT id, merchant_id, name, definition, trigger_scenarios,
              communication_goal, created_at, updated_at
       FROM member_segments
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toMemberSegment(result.rows[0]) : null;
  }

  async createMemberSegment(
    input: MemberSegmentInput,
  ): Promise<MemberSegment> {
    const result = await this.executor.query<MemberSegmentRow>(
      `INSERT INTO member_segments
         (merchant_id, name, definition, trigger_scenarios,
          communication_goal)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, merchant_id, name, definition, trigger_scenarios,
                 communication_goal, created_at, updated_at`,
      [
        this.merchantId,
        input.name,
        input.definition,
        input.triggerScenarios,
        input.communicationGoal,
      ],
    );
    return toMemberSegment(result.rows[0]);
  }

  async updateMemberSegment(
    id: string,
    input: MemberSegmentInput,
  ): Promise<MemberSegment | null> {
    const result = await this.executor.query<MemberSegmentRow>(
      `UPDATE member_segments
       SET name = $3, definition = $4, trigger_scenarios = $5,
           communication_goal = $6, updated_at = now()
       WHERE merchant_id = $1 AND id = $2
       RETURNING id, merchant_id, name, definition, trigger_scenarios,
                 communication_goal, created_at, updated_at`,
      [
        this.merchantId,
        id,
        input.name,
        input.definition,
        input.triggerScenarios,
        input.communicationGoal,
      ],
    );
    return result.rows[0] ? toMemberSegment(result.rows[0]) : null;
  }

  async deleteMemberSegment(id: string): Promise<boolean> {
    return this.deleteById("member_segments", id);
  }

  async listAssets(): Promise<Asset[]> {
    const result = await this.executor.query<AssetRow>(
      `SELECT id, merchant_id, offering_id, original_name, mime_type,
              byte_size, storage_key, scene, notes, is_real,
              is_effect_image, indexing_status, indexing_task_id,
              indexing_error, indexed_at, created_at, updated_at
       FROM assets
       WHERE merchant_id = $1
       ORDER BY updated_at DESC, id`,
      [this.merchantId],
    );
    return result.rows.map(toAsset);
  }

  async getAsset(id: string): Promise<Asset | null> {
    const result = await this.executor.query<AssetRow>(
      `SELECT id, merchant_id, offering_id, original_name, mime_type,
              byte_size, storage_key, scene, notes, is_real,
              is_effect_image, indexing_status, indexing_task_id,
              indexing_error, indexed_at, created_at, updated_at
       FROM assets
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }

  async createAsset(input: AssetInput): Promise<Asset> {
    const result = await this.executor.query<AssetRow>(
      `INSERT INTO assets
         (merchant_id, offering_id, original_name, mime_type, byte_size,
          storage_key, scene, notes, is_real, is_effect_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
       RETURNING id, merchant_id, offering_id, original_name, mime_type,
                 byte_size, storage_key, scene, notes, is_real,
                 is_effect_image, indexing_status, indexing_task_id,
                 indexing_error, indexed_at, created_at, updated_at`,
      [
        this.merchantId,
        input.offeringId,
        input.originalName,
        input.mimeType,
        input.byteSize,
        input.storageKey,
        input.scene,
        input.notes,
        input.isEffectImage,
      ],
    );
    return toAsset(result.rows[0]);
  }

  async createAssetAndQueueIndex(
    memberId: string,
    input: AssetInput,
  ): Promise<Asset> {
    const result = await this.executor.query<AssetRow>(
      `WITH ids AS (
         SELECT gen_random_uuid() AS asset_id, gen_random_uuid() AS task_id
       ),
       new_task AS (
         INSERT INTO agent_tasks
           (id, merchant_id, created_by_member_id, capability, input)
         SELECT
           task_id,
           $1,
           $10,
           'embedding',
           jsonb_build_object('purpose', 'asset-index', 'assetId', asset_id)
         FROM ids
         RETURNING id, merchant_id
       ),
       new_asset AS (
         INSERT INTO assets
           (
             id, merchant_id, offering_id, original_name, mime_type,
             byte_size, storage_key, scene, notes, is_real, is_effect_image,
             indexing_status, indexing_task_id
           )
         SELECT
           ids.asset_id, $1, $2, $3, $4, $5, $6, $7, $8, true, $9,
           'queued', task.id
         FROM ids, new_task task
         RETURNING *
       )
       SELECT
         id, merchant_id, offering_id, original_name, mime_type, byte_size,
         storage_key, scene, notes, is_real, is_effect_image, indexing_status,
         indexing_task_id, indexing_error, indexed_at, created_at, updated_at
       FROM new_asset`,
      [
        this.merchantId,
        input.offeringId,
        input.originalName,
        input.mimeType,
        input.byteSize,
        input.storageKey,
        input.scene,
        input.notes,
        input.isEffectImage,
        memberId,
      ],
    );
    return toAsset(result.rows[0]);
  }

  async updateAssetMetadata(
    id: string,
    input: Pick<
      AssetInput,
      "isEffectImage" | "notes" | "offeringId" | "scene"
    >,
  ): Promise<Asset | null> {
    const result = await this.executor.query<AssetRow>(
      `UPDATE assets
       SET offering_id = $3, scene = $4, notes = $5, is_real = true,
           is_effect_image = $6, updated_at = now()
       WHERE merchant_id = $1 AND id = $2
       RETURNING id, merchant_id, offering_id, original_name, mime_type,
                 byte_size, storage_key, scene, notes, is_real,
                 is_effect_image, indexing_status, indexing_task_id,
                 indexing_error, indexed_at, created_at, updated_at`,
      [
        this.merchantId,
        id,
        input.offeringId,
        input.scene,
        input.notes,
        input.isEffectImage,
      ],
    );
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }

  async deleteAsset(id: string): Promise<Asset | null> {
    const result = await this.executor.query<AssetRow>(
      `WITH target AS (
         SELECT *
         FROM assets
         WHERE merchant_id = $1 AND id = $2
       ),
       cancel_task AS (
         UPDATE agent_tasks task
         SET
           status = 'failed',
           error_code = 'ASSET_DELETED',
           error_message = 'Asset was deleted before indexing',
           completed_at = now(),
           updated_at = now()
         FROM target
         WHERE task.merchant_id = $1
           AND task.id = target.indexing_task_id
           AND task.status = 'queued'
       ),
       delete_embedding AS (
         DELETE FROM knowledge_item_embeddings embedding
         USING target
         WHERE embedding.merchant_id = $1
           AND embedding.merchant_id = target.merchant_id
           AND embedding.source_type = 'asset'
           AND embedding.source_id = target.id
       )
       DELETE FROM assets asset
       USING target
       WHERE asset.merchant_id = $1
         AND asset.merchant_id = target.merchant_id
         AND asset.id = target.id
       RETURNING asset.id, asset.merchant_id, asset.offering_id,
                 asset.original_name, asset.mime_type, asset.byte_size,
                 asset.storage_key, asset.scene, asset.notes, asset.is_real,
                 asset.is_effect_image, asset.indexing_status,
                 asset.indexing_task_id, asset.indexing_error,
                 asset.indexed_at, asset.created_at, asset.updated_at`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }

  async retryAssetIndex(
    id: string,
    memberId: string,
  ): Promise<Asset | null> {
    const result = await this.executor.query<AssetRow>(
      `WITH target AS (
         SELECT id, merchant_id
         FROM assets
         WHERE merchant_id = $1
           AND id = $2
           AND indexing_status IN ('not_indexed', 'failed')
         FOR UPDATE
       ),
       new_task AS (
         INSERT INTO agent_tasks
           (merchant_id, created_by_member_id, capability, input)
         SELECT
           merchant_id,
           $3,
           'embedding',
           jsonb_build_object('purpose', 'asset-index', 'assetId', id)
         FROM target
         RETURNING id, merchant_id
       )
       UPDATE assets asset
       SET
         indexing_status = 'queued',
         indexing_task_id = task.id,
         indexing_error = NULL,
         indexed_at = NULL,
         updated_at = now()
       FROM target, new_task task
       WHERE asset.merchant_id = $1
         AND asset.merchant_id = target.merchant_id
         AND asset.id = target.id
       RETURNING asset.id, asset.merchant_id, asset.offering_id,
                 asset.original_name, asset.mime_type, asset.byte_size,
                 asset.storage_key, asset.scene, asset.notes, asset.is_real,
                 asset.is_effect_image, asset.indexing_status,
                 asset.indexing_task_id, asset.indexing_error,
                 asset.indexed_at, asset.created_at, asset.updated_at`,
      [this.merchantId, id, memberId],
    );
    return result.rows[0] ? toAsset(result.rows[0]) : null;
  }

  async searchAssets(
    embedding: readonly number[],
    embeddingSpace: string,
    filters: AssetSearchFilters,
  ): Promise<AssetSearchResult[]> {
    if (!embeddingSpace.trim()) {
      throw new Error("Embedding space is required for asset search");
    }
    const vector = embeddingVectorLiteral(embedding);
    const result = await this.executor.query<AssetSearchRow>(
      `SELECT
         asset.id, asset.merchant_id, asset.offering_id, asset.original_name,
         asset.mime_type, asset.byte_size, asset.storage_key, asset.scene,
         asset.notes, asset.is_real, asset.is_effect_image,
         asset.indexing_status, asset.indexing_task_id, asset.indexing_error,
         asset.indexed_at, asset.created_at, asset.updated_at,
         1 - (embedding.embedding <=> $2::vector) AS similarity
       FROM knowledge_item_embeddings embedding
       INNER JOIN assets asset
         ON asset.merchant_id = embedding.merchant_id
        AND asset.id = embedding.source_id
       WHERE embedding.merchant_id = $1
         AND asset.merchant_id = $1
         AND embedding.source_type = 'asset'
         AND embedding.embedding_space = $3
         AND asset.indexing_status = 'succeeded'
         AND ($4::uuid IS NULL OR asset.offering_id = $4)
         AND ($5::text IS NULL OR asset.scene = $5)
       ORDER BY embedding.embedding <=> $2::vector, asset.id
       LIMIT $6`,
      [
        this.merchantId,
        vector,
        embeddingSpace,
        filters.offeringId,
        filters.scene,
        filters.limit,
      ],
    );
    return result.rows.map((row) => ({
      asset: toAsset(row),
      similarity: Number(row.similarity),
    }));
  }

  private async deleteById(
    table: "audiences" | "campaigns" | "member_segments" | "offerings",
    id: string,
  ): Promise<boolean> {
    const result = await this.executor.query(
      `DELETE FROM ${table} WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rowCount === 1;
  }
}
