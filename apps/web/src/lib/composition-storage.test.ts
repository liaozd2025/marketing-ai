import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { tenantId } from "@marketing-ai/database";
import { afterEach, describe, expect, it } from "vitest";

import {
  readCompositionFile,
  removeCompositionFile,
  storeCompositionFile,
} from "./composition-storage";

const previousDirectory = process.env.COMPOSITION_STORAGE_DIR;

afterEach(() => {
  if (previousDirectory === undefined) {
    delete process.env.COMPOSITION_STORAGE_DIR;
  } else {
    process.env.COMPOSITION_STORAGE_DIR = previousDirectory;
  }
});

describe("tenant composition storage", () => {
  it("writes and reads a PNG only under its tenant directory", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "marketing-ai-compositions-"),
    );
    process.env.COMPOSITION_STORAGE_DIR = directory;
    const merchantId = tenantId("11111111-1111-4111-8111-111111111111");
    const png = Buffer.from("89504e470d0a1a0a", "hex");

    const key = await storeCompositionFile(merchantId, png);

    expect(key).toMatch(new RegExp(`^${merchantId}/.+[.]png$`));
    await expect(readCompositionFile(key)).resolves.toEqual(png);
    await removeCompositionFile(key);
    await expect(readCompositionFile(key)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await rm(directory, { force: true, recursive: true });
  });

  it("rejects path traversal", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "marketing-ai-compositions-"),
    );
    process.env.COMPOSITION_STORAGE_DIR = directory;

    await expect(readCompositionFile("../secret")).rejects.toThrow(
      "Invalid composition storage key",
    );
    await rm(directory, { force: true, recursive: true });
  });
});
