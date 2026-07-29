import { Pool } from "pg";

import { AgentQueueDataAccess } from "./agent-queue-data-access";
import { IdentityDataAccess } from "./identity-data-access";
import { TenantAgentDataAccess } from "./tenant-agent-data-access";
import { TenantDataAccess } from "./tenant-data-access";
import type { SqlExecutor, TenantId } from "./types";

const localDatabaseUrl =
  "postgresql://marketing_ai:marketing_ai@localhost:5432/marketing_ai";

export class Database {
  readonly agentQueue: AgentQueueDataAccess;
  readonly identity: IdentityDataAccess;
  private readonly pool: Pool;
  private readonly executor: SqlExecutor;

  constructor(connectionString = process.env.DATABASE_URL ?? localDatabaseUrl) {
    this.pool = new Pool({ connectionString });
    this.executor = {
      query: async (text, values) =>
        this.pool.query(text, values ? [...values] : undefined),
    };
    this.agentQueue = new AgentQueueDataAccess(this.pool);
    this.identity = new IdentityDataAccess(this.pool);
  }

  agentForTenant(merchantId: TenantId): TenantAgentDataAccess {
    return new TenantAgentDataAccess(this.pool, merchantId);
  }

  forTenant(merchantId: TenantId): TenantDataAccess {
    return new TenantDataAccess(this.executor, merchantId);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

declare global {
  var marketingAiDatabase: Database | undefined;
}

export const database =
  globalThis.marketingAiDatabase ?? new Database();

if (process.env.NODE_ENV !== "production") {
  globalThis.marketingAiDatabase = database;
}
