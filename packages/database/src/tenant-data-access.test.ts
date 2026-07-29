import type { QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";

import { TenantDataAccess } from "./tenant-data-access";
import { tenantId, type SqlExecutor } from "./types";

const merchantAId = tenantId("11111111-1111-4111-8111-111111111111");
const merchantBId = tenantId("22222222-2222-4222-8222-222222222222");
const memberAId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const memberBId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const createdAt = new Date("2026-07-30T00:00:00.000Z");

const merchants = [
  {
    created_at: createdAt,
    id: merchantAId,
    name: "Merchant A",
    slug: "merchant-a",
  },
  {
    created_at: createdAt,
    id: merchantBId,
    name: "Merchant B",
    slug: "merchant-b",
  },
];

const members = [
  {
    created_at: createdAt,
    email: "owner-a@example.com",
    id: memberAId,
    merchant_id: merchantAId,
    role: "owner",
  },
  {
    created_at: createdAt,
    email: "owner-b@example.com",
    id: memberBId,
    merchant_id: merchantBId,
    role: "owner",
  },
];

class InMemoryExecutor implements SqlExecutor {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rowCount: number; rows: Row[] }> {
    this.calls.push({ text, values });
    const normalized = text.replace(/\s+/g, " ").trim();
    let rows: QueryResultRow[];

    if (normalized.includes("FROM merchants")) {
      rows = merchants.filter((merchant) => merchant.id === values[0]);
    } else if (normalized.includes("FROM members")) {
      // This fake store holds both tenants. Only SQL predicates and bound
      // parameters can prevent a cross-tenant record from being returned.
      rows = members.filter(
        (member) =>
          member.merchant_id === values[0] &&
          (!normalized.includes("id = $2") || member.id === values[1]),
      );
    } else {
      throw new Error(`Unexpected query: ${normalized}`);
    }

    return { rowCount: rows.length, rows: rows as Row[] };
  }
}

describe("TenantDataAccess", () => {
  it("returns only the merchant bound to the repository", async () => {
    const executor = new InMemoryExecutor();
    const tenant = new TenantDataAccess(executor, merchantAId);

    await expect(tenant.getMerchant()).resolves.toMatchObject({
      id: merchantAId,
      name: "Merchant A",
    });
  });

  it("blocks a cross-tenant member lookup in the data layer", async () => {
    const executor = new InMemoryExecutor();
    const tenantA = new TenantDataAccess(executor, merchantAId);

    await expect(tenantA.getMember(memberBId)).resolves.toBeNull();
    expect(executor.calls[0]?.text).toContain(
      "WHERE merchant_id = $1 AND id = $2",
    );
    expect(executor.calls[0]?.values).toEqual([merchantAId, memberBId]);
  });

  it("never lists members from another tenant", async () => {
    const executor = new InMemoryExecutor();
    const tenantA = new TenantDataAccess(executor, merchantAId);

    await expect(tenantA.listMembers()).resolves.toEqual([
      expect.objectContaining({
        id: memberAId,
        merchantId: merchantAId,
      }),
    ]);
    expect(executor.calls[0]?.text).toContain("WHERE merchant_id = $1");
    expect(executor.calls[0]?.values).toEqual([merchantAId]);
  });
});
