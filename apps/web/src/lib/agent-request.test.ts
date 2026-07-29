import { describe, expect, it } from "vitest";

import {
  InvalidAgentRequestError,
  parseAgentTaskRequest,
} from "./agent-request";

describe("parseAgentTaskRequest", () => {
  it("parses a conversation continuation", () => {
    expect(
      parseAgentTaskRequest({
        capability: "text",
        conversation_id: "conversation-1",
        prompt: "continue",
      }),
    ).toEqual({
      capability: "text",
      conversationId: "conversation-1",
      prompt: "continue",
    });
  });

  it("explicitly rejects client-reported tenant identity", () => {
    expect(() =>
      parseAgentTaskRequest({
        capability: "text",
        merchant_id: "merchant-b",
        prompt: "cross tenant",
      }),
    ).toThrowError(InvalidAgentRequestError);
  });

  it("bounds embedding batches", () => {
    expect(() =>
      parseAgentTaskRequest({ capability: "embedding", texts: [] }),
    ).toThrow("texts must contain");
  });
});
