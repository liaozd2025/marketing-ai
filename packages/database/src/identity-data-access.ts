import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  AuthenticatedMember,
  Merchant,
  RegisteredAccount,
} from "./types";

interface AuthenticatedMemberRow extends QueryResultRow {
  created_at: Date;
  email: string;
  id: string;
  merchant_id: string;
  password_hash: string;
  role: "owner" | "member";
}

interface MerchantRow extends QueryResultRow {
  created_at: Date;
  id: string;
  name: string;
  slug: string;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("This email is already registered");
    this.name = "EmailAlreadyRegisteredError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function merchantSlug(name: string, merchantId: string): string {
  const readable = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  return `${readable || "merchant"}-${merchantId.slice(0, 8)}`;
}

function toAuthenticatedMember(
  row: AuthenticatedMemberRow,
): AuthenticatedMember {
  return {
    createdAt: row.created_at,
    email: row.email,
    id: row.id,
    merchantId: row.merchant_id,
    passwordHash: row.password_hash,
    role: row.role,
  };
}

function toMerchant(row: MerchantRow): Merchant {
  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    slug: row.slug,
  };
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}

/**
 * Identity lookup is intentionally separate from tenant business data:
 * email is globally unique and is used only to establish the signed session.
 */
export class IdentityDataAccess {
  constructor(private readonly pool: Pool) {}

  async findMemberByEmail(
    email: string,
  ): Promise<AuthenticatedMember | null> {
    const result = await this.pool.query<AuthenticatedMemberRow>(
      `SELECT id, merchant_id, email, password_hash, role, created_at
       FROM members
       WHERE email = $1`,
      [normalizeEmail(email)],
    );

    return result.rows[0] ? toAuthenticatedMember(result.rows[0]) : null;
  }

  async registerMerchant(input: {
    email: string;
    merchantName: string;
    passwordHash: string;
  }): Promise<RegisteredAccount> {
    const client = await this.pool.connect();
    const merchantId = randomUUID();
    const memberId = randomUUID();

    try {
      await client.query("BEGIN");
      const merchantResult = await client.query<MerchantRow>(
        `INSERT INTO merchants (id, slug, name)
         VALUES ($1, $2, $3)
         RETURNING id, slug, name, created_at`,
        [
          merchantId,
          merchantSlug(input.merchantName, merchantId),
          input.merchantName.trim(),
        ],
      );
      const memberResult = await client.query<AuthenticatedMemberRow>(
        `INSERT INTO members
           (id, merchant_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'owner')
         RETURNING
           id, merchant_id, email, password_hash, role, created_at`,
        [
          memberId,
          merchantId,
          normalizeEmail(input.email),
          input.passwordHash,
        ],
      );
      await client.query("COMMIT");

      const merchant = toMerchant(merchantResult.rows[0]);
      const authenticatedMember = toAuthenticatedMember(memberResult.rows[0]);
      const member = {
        createdAt: authenticatedMember.createdAt,
        email: authenticatedMember.email,
        id: authenticatedMember.id,
        merchantId: authenticatedMember.merchantId,
        role: authenticatedMember.role,
      };

      return { member, merchant };
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
