import type { QueryResultRow } from "pg";

import type {
  Member,
  Merchant,
  SqlExecutor,
  TenantId,
} from "./types";

interface MerchantRow extends QueryResultRow {
  created_at: Date;
  id: string;
  name: string;
  slug: string;
}

interface MemberRow extends QueryResultRow {
  created_at: Date;
  email: string;
  id: string;
  merchant_id: string;
  role: "owner" | "member";
}

function toMerchant(row: MerchantRow): Merchant {
  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    slug: row.slug,
  };
}

function toMember(row: MemberRow): Member {
  return {
    createdAt: row.created_at,
    email: row.email,
    id: row.id,
    merchantId: row.merchant_id,
    role: row.role,
  };
}

/**
 * The only business-data entry point. A repository is permanently bound to
 * one tenant and does not expose methods that accept a merchantId argument.
 */
export class TenantDataAccess {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly merchantId: TenantId,
  ) {}

  async getMerchant(): Promise<Merchant | null> {
    const result = await this.executor.query<MerchantRow>(
      `SELECT id, slug, name, created_at
       FROM merchants
       WHERE id = $1`,
      [this.merchantId],
    );

    return result.rows[0] ? toMerchant(result.rows[0]) : null;
  }

  async getMember(memberId: string): Promise<Member | null> {
    const result = await this.executor.query<MemberRow>(
      `SELECT id, merchant_id, email, role, created_at
       FROM members
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, memberId],
    );

    return result.rows[0] ? toMember(result.rows[0]) : null;
  }

  async listMembers(): Promise<Member[]> {
    const result = await this.executor.query<MemberRow>(
      `SELECT id, merchant_id, email, role, created_at
       FROM members
       WHERE merchant_id = $1
       ORDER BY created_at ASC`,
      [this.merchantId],
    );

    return result.rows.map(toMember);
  }
}
