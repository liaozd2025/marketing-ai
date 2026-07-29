import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TenantId } from "@marketing-ai/database";

function storageRoot(): string {
  const configured = process.env.COMPOSITION_STORAGE_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(
        /* turbopackIgnore: true */ process.cwd(),
        ".data",
        "compositions",
      );
}

function resolveStorageKey(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(
    /* turbopackIgnore: true */ root,
    storageKey,
  );
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid composition storage key");
  }
  return resolved;
}

export async function storeCompositionFile(
  merchantId: TenantId,
  png: Buffer,
): Promise<string> {
  const storageKey = `${merchantId}/${randomUUID()}.png`;
  const target = resolveStorageKey(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, png, { flag: "wx" });
  return storageKey;
}

export async function readCompositionFile(
  storageKey: string,
): Promise<Buffer> {
  return readFile(resolveStorageKey(storageKey));
}

export async function removeCompositionFile(
  storageKey: string,
): Promise<void> {
  await rm(resolveStorageKey(storageKey), { force: true });
}
