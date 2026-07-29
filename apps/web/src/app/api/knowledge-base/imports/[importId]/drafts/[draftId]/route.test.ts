import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmDraft: vi.fn(),
  forTenant: vi.fn(),
  getDraft: vi.fn(),
  getMerchant: vi.fn(),
  getSession: vi.fn(),
  removeAssetFile: vi.fn(),
  storeAssetFile: vi.fn(),
  tenantId: vi.fn((value: string) => value),
  validateAssetFile: vi.fn(),
}));

vi.mock("@marketing-ai/database", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@marketing-ai/database")
  >();
  return {
    ...actual,
    database: { forTenant: mocks.forTenant },
    tenantId: mocks.tenantId,
  };
});
vi.mock("@marketing-ai/asset-storage", () => ({
  removeAssetFile: mocks.removeAssetFile,
  storeAssetFile: mocks.storeAssetFile,
  validateAssetFile: mocks.validateAssetFile,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { PATCH } from "./route";

const context = {
  params: Promise.resolve({ draftId: "draft-1", importId: "import-1" }),
};

describe("asset cold-start draft confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      memberId: "member-1",
      merchantId: "merchant-1",
    });
    mocks.getMerchant.mockResolvedValue({ verticalPackId: "beauty-v1" });
    mocks.getDraft.mockResolvedValue({
      entityType: "asset",
      id: "draft-1",
      payload: {
        isEffectImage: false,
        notes: "",
        originalName: "门头实拍.png",
        scene: "门店环境",
      },
      status: "pending",
    });
    mocks.confirmDraft.mockResolvedValue({
      confirmedEntityId: "asset-1",
      entityType: "asset",
      id: "draft-1",
      payload: {
        isEffectImage: false,
        notes: "商家已核对原图",
        originalName: "门头实拍.png",
        scene: "门店环境",
      },
      status: "confirmed",
    });
    mocks.forTenant.mockReturnValue({
      coldStart: {
        confirmDraft: mocks.confirmDraft,
        getDraft: mocks.getDraft,
      },
      getMerchant: mocks.getMerchant,
    });
    mocks.storeAssetFile.mockResolvedValue("merchant-1/stored.png");
  });

  it("requires and stores a real asset file before atomic confirmation", async () => {
    const body = new FormData();
    body.set("action", "confirm");
    body.set(
      "payload",
      JSON.stringify({
        isEffectImage: false,
        notes: "商家已核对原图",
        originalName: "门头实拍.png",
        scene: "门店环境",
      }),
    );
    body.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "门头实拍.png", {
        type: "image/png",
      }),
    );

    const response = await PATCH(
      new Request("http://localhost/api/drafts/draft-1", {
        body,
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.storeAssetFile).toHaveBeenCalledWith(
      "merchant-1",
      expect.objectContaining({ name: "门头实拍.png", type: "image/png" }),
    );
    expect(mocks.confirmDraft).toHaveBeenCalledWith(
      "draft-1",
      {
        draftPayload: {
          isEffectImage: false,
          notes: "商家已核对原图",
          originalName: "门头实拍.png",
          scene: "门店环境",
        },
        entityType: "asset",
        input: {
          byteSize: 4,
          isEffectImage: false,
          mimeType: "image/png",
          notes: "商家已核对原图",
          offeringId: null,
          originalName: "门头实拍.png",
          scene: "门店环境",
          storageKey: "merchant-1/stored.png",
        },
      },
      "member-1",
    );
  });

  it("does not confirm asset metadata without actual file bytes", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/drafts/draft-1", {
        body: JSON.stringify({
          action: "confirm",
          payload: {
            isEffectImage: false,
            notes: "",
            originalName: "门头实拍.png",
            scene: "门店环境",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });
});
