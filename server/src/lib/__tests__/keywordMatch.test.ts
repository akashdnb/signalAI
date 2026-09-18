import { describe, expect, it } from "vitest";
import { findMatchingCampaign } from "../keywordMatch.js";

describe("findMatchingCampaign", () => {
  const campaigns = [
    { id: "c1", keywords: ["LINK", "price"] },
    { id: "c2", keywords: ["giveaway"] },
  ];

  it("matches case-insensitively", () => {
    expect(findMatchingCampaign("please DM me the link", campaigns)).toEqual({
      campaignId: "c1",
      keyword: "LINK",
    });
  });

  it("matches as a substring (contains), not a whole-word match", () => {
    expect(findMatchingCampaign("what's the priceless deal here?", campaigns)).toEqual({
      campaignId: "c1",
      keyword: "price",
    });
  });

  it("checks multiple keywords per campaign", () => {
    expect(findMatchingCampaign("what a giveaway!", campaigns)?.campaignId).toBe("c2");
  });

  it("returns null when nothing matches", () => {
    expect(findMatchingCampaign("just a normal comment", campaigns)).toBeNull();
  });

  it("returns null against an empty campaign list", () => {
    expect(findMatchingCampaign("link please", [])).toBeNull();
  });
});
