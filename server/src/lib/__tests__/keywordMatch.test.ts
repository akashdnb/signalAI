import { describe, expect, it } from "vitest";
import { CONTINUATION_KEYWORD, findMatchingCampaign, RESTART_KEYWORD, resolveDmCampaignTrigger } from "../keywordMatch.js";

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

describe("resolveDmCampaignTrigger", () => {
  const campaigns = [
    { id: "dm-1", keywords: ["link"], targetMediaIds: [], triggerSource: "message" as const, replyChannel: "dm" as const },
    { id: "both-1", keywords: ["price"], targetMediaIds: [], triggerSource: "both" as const, replyChannel: "both" as const },
    { id: "comment-1", keywords: ["hello"], targetMediaIds: [], triggerSource: "comment" as const, replyChannel: "comment" as const },
  ];

  it("continues the active DM automation when the previous 24-hour window is open", () => {
    expect(resolveDmCampaignTrigger("just checking in", campaigns, "dm-1", true)).toEqual({
      campaignId: "dm-1", keyword: CONTINUATION_KEYWORD, restartCampaign: false,
    });
  });

  it("restarts the active DM automation when the customer returns after the window expires", () => {
    expect(resolveDmCampaignTrigger("just checking in", campaigns, "dm-1", false)).toEqual({
      campaignId: "dm-1", keyword: RESTART_KEYWORD, restartCampaign: true,
    });
  });

  it("prefers a real keyword and restarts from the beginning after a gap", () => {
    expect(resolveDmCampaignTrigger("please send the LINK", campaigns, "dm-1", false)).toEqual({
      campaignId: "dm-1", keyword: "link", restartCampaign: true,
    });
  });

  it("does not restart a campaign for a lead with no active DM campaign and no keyword", () => {
    expect(resolveDmCampaignTrigger("just checking in", campaigns, null, false)).toBeNull();
  });

  it("starts a fresh run for a direct keyword match after the 24-hour window is closed", () => {
    expect(resolveDmCampaignTrigger("please send the LINK", campaigns, null, false)).toEqual({
      campaignId: "dm-1", keyword: "link", restartCampaign: true,
    });
  });

  it("continues a comment-started DM journey on the customer's first DM", () => {
    const commentCampaign = {
      id: "comment-dm-1",
      keywords: ["hello"],
      targetMediaIds: [],
      triggerSource: "comment" as const,
      replyChannel: "dm" as const,
    };

    expect(resolveDmCampaignTrigger("thanks", [commentCampaign], "comment-dm-1", false, undefined, false)).toEqual({
      campaignId: "comment-dm-1", keyword: CONTINUATION_KEYWORD, restartCampaign: false,
    });
  });

  it("restarts a comment-started DM journey after a later 24-hour gap", () => {
    const commentCampaign = {
      id: "comment-dm-1",
      keywords: ["hello"],
      targetMediaIds: [],
      triggerSource: "comment" as const,
      replyChannel: "dm" as const,
    };

    expect(resolveDmCampaignTrigger("back again", [commentCampaign], "comment-dm-1", false, undefined, true)).toEqual({
      campaignId: "comment-dm-1", keyword: RESTART_KEYWORD, restartCampaign: true,
    });
  });

  it("does not continue a campaign that cannot send DMs", () => {
    const commentOnly = {
      id: "comment-only-1",
      keywords: ["hello"],
      targetMediaIds: [],
      triggerSource: "comment" as const,
      replyChannel: "comment" as const,
    };

    expect(resolveDmCampaignTrigger("just checking in", [commentOnly], "comment-only-1", true)).toBeNull();
  });

  it("does not continue a disabled DM-capable campaign", () => {
    const disabled = {
      id: "disabled-dm-1",
      keywords: ["hello"],
      targetMediaIds: [],
      triggerSource: "comment" as const,
      replyChannel: "dm" as const,
      enabled: false,
    };

    expect(resolveDmCampaignTrigger("just checking in", [disabled], "disabled-dm-1", true)).toBeNull();
  });
});
