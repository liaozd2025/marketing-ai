import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketing_ai:marketing_ai@localhost:5432/marketing_ai";
const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const pool = new Pool({ connectionString: databaseUrl });

try {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const migrationFile of migrationFiles) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [migrationFile],
      );

      if (alreadyApplied.rowCount) {
        continue;
      }

      const sql = await readFile(
        new URL(`../migrations/${migrationFile}`, import.meta.url),
        "utf8",
      );

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [migrationFile],
        );
        await client.query("COMMIT");
        process.stdout.write(`Applied ${migrationFile}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    process.stdout.write("Database is up to date.\n");
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
