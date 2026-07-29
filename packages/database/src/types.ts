import type { QueryResultRow } from "pg";

export interface QueryResult<Row> {
  readonly rowCount: number | null;
  readonly rows: Row[];
}

export interface SqlExecutor {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface Merchant {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly verticalPackId: string;
}

export interface Member {
  readonly createdAt: Date;
  readonly email: string;
  readonly id: string;
  readonly merchantId: string;
  readonly role: "owner" | "member";
}

export interface AuthenticatedMember extends Member {
  readonly passwordHash: string;
}

export interface RegisteredAccount {
  readonly member: Member;
  readonly merchant: Merchant;
}

export type TenantId = string & { readonly __tenantId: unique symbol };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function tenantId(value: string): TenantId {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError("Invalid tenant identifier");
  }

  return value as TenantId;
}
