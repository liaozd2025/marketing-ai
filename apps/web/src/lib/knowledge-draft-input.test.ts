import { getVerticalPack } from "@marketing-ai/vertical-packs";
import { describe, expect, it } from "vitest";

import {
  InvalidKnowledgeDraftError,
  parseKnowledgeDraftRequest,
} from "./knowledge-draft-input";

const pack = getVerticalPack("beauty-v1");

describe("knowledge draft confirmation input", () => {
  it("requires missing extracted fields to be corrected before confirmation", () => {
    expect(() =>
      parseKnowledgeDraftRequest(
        {
          action: "confirm",
          payload: {
            description: "",
            fieldValues: { price: 298 },
            name: "肩颈护理",
          },
        },
        "offering",
        pack,
      ),
    ).toThrow(InvalidKnowledgeDraftError);

    expect(
      parseKnowledgeDraftRequest(
        {
          action: "confirm",
          payload: {
            description: "",
            fieldValues: {
              durationMinutes: 60,
              offeringType: "service",
              price: 298,
              sellingPoints: "轻重可沟通",
              suitableFor: "久坐人群",
            },
            name: "肩颈护理",
          },
        },
        "offering",
        pack,
      ),
    ).toMatchObject({
      action: "confirm",
      confirmation: {
        entityType: "offering",
      },
    });
  });

  it("accepts corrected asset metadata so the route can attach a real file", () => {
    expect(
      parseKnowledgeDraftRequest(
        {
          action: "confirm",
          payload: {
            isEffectImage: false,
            notes: "商家确认是门头实拍",
            originalName: "门头实拍.png",
            scene: "门店环境",
          },
        },
        "asset",
        pack,
      ),
    ).toEqual({
      action: "confirm",
      assetMetadata: {
        isEffectImage: false,
        notes: "商家确认是门头实拍",
        originalName: "门头实拍.png",
        scene: "门店环境",
      },
    });
  });
});
