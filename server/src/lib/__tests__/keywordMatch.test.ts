import { describe, expect, it } from "vitest";
import { findMatchingCampaign } from "../keywordMatch.js";

describe("findMatchingCampaign", () => {
  const campaigns = [
    { id: "c1", keywords: ["LINK", "price"], targetMediaIds: [] },
    { id: "c2", keywords: ["giveaway"], targetMediaIds: [] },
  ];

  it("matches case-insensitively", () => {
    expect(findMatchingCampaign("please DM me the link", "media-1", campaigns)).toEqual({
      campaignId: "c1",
      keyword: "LINK",
    });
  });

  it("matches as a substring (contains), not a whole-word match", () => {
    expect(findMatchingCampaign("what's the priceless deal here?", "media-1", campaigns)).toEqual({
      campaignId: "c1",
      keyword: "price",
    });
  });

  it("checks multiple keywords per campaign", () => {
    expect(findMatchingCampaign("what a giveaway!", "media-1", campaigns)?.campaignId).toBe("c2");
  });

  it("returns null when nothing matches", () => {
    expect(findMatchingCampaign("just a normal comment", "media-1", campaigns)).toBeNull();
  });

  it("returns null against an empty campaign list", () => {
    expect(findMatchingCampaign("link please", "media-1", [])).toBeNull();
  });

  describe("post targeting", () => {
    const scoped = [
      { id: "c1", keywords: ["LINK"], targetMediaIds: ["media-1"] },
      { id: "c2", keywords: ["LINK"], targetMediaIds: ["media-2"] },
      { id: "c3", keywords: ["LINK"], targetMediaIds: [] }, // unrestricted — matches every post
    ];

    it("only matches a campaign scoped to the comment's post", () => {
      expect(findMatchingCampaign("send the LINK", "media-1", scoped)?.campaignId).toBe("c1");
      expect(findMatchingCampaign("send the LINK", "media-2", scoped)?.campaignId).toBe("c2");
    });

    it("falls through to an unrestricted campaign when no scoped campaign matches this post", () => {
      expect(findMatchingCampaign("send the LINK", "media-3", scoped)?.campaignId).toBe("c3");
    });

    it("skips every post-scoped campaign when the event carries no media id", () => {
      expect(findMatchingCampaign("send the LINK", undefined, scoped)?.campaignId).toBe("c3");
    });
  });
});
