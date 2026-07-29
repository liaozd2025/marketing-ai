import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { TenantId } from "@marketing-ai/database";

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/"] as const;

function storageRoot(): string {
  const configured = process.env.ASSET_STORAGE_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(
        /* turbopackIgnore: true */ process.cwd(),
        ".data",
        "assets",
      );
}

function extensionFor(file: File): string {
  const extension = path.extname(file.name).toLowerCase();
  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

function resolveStorageKey(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(
    /* turbopackIgnore: true */ root,
    storageKey,
  );
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid asset storage key");
  }
  return resolved;
}

export function validateAssetFile(file: File): void {
  if (file.size === 0 || file.size > MAX_ASSET_BYTES) {
    throw new Error("asset-size");
  }
  if (!ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    throw new Error("asset-type");
  }
}

export async function storeAssetFile(
  merchantId: TenantId,
  file: File,
): Promise<string> {
  validateAssetFile(file);
  const storageKey = `${merchantId}/${randomUUID()}${extensionFor(file)}`;
  const target = resolveStorageKey(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });
  return storageKey;
}

export async function readAssetFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStorageKey(storageKey));
}

export async function removeAssetFile(storageKey: string): Promise<void> {
  await rm(resolveStorageKey(storageKey), { force: true });
}
