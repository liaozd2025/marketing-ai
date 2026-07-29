import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { tenantId } from "@marketing-ai/database";
import { afterEach, describe, expect, it } from "vitest";

import {
  readAssetFile,
  removeAssetFile,
  storeAssetFile,
} from "./asset-storage";

const originalStorageDirectory = process.env.ASSET_STORAGE_DIR;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  if (originalStorageDirectory === undefined) {
    delete process.env.ASSET_STORAGE_DIR;
  } else {
    process.env.ASSET_STORAGE_DIR = originalStorageDirectory;
  }
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("tenant asset storage", () => {
  it("writes and reads a real uploaded file under its tenant directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "marketing-ai-assets-"));
    temporaryDirectories.push(directory);
    process.env.ASSET_STORAGE_DIR = directory;
    const merchantId = tenantId("11111111-1111-4111-8111-111111111111");
    const file = new File(["real image bytes"], "到店实拍.jpg", {
      type: "image/jpeg",
    });

    const key = await storeAssetFile(merchantId, file);

    expect(key).toMatch(
      /^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+[.]jpg$/,
    );
    await expect(readAssetFile(key)).resolves.toEqual(
      Buffer.from("real image bytes"),
    );
    await removeAssetFile(key);
    await expect(readAssetFile(key)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not allow a storage key to escape the configured root", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "marketing-ai-assets-"));
    temporaryDirectories.push(directory);
    process.env.ASSET_STORAGE_DIR = directory;

    await expect(readAssetFile("../secret")).rejects.toThrow(
      "Invalid asset storage key",
    );
  });
});
