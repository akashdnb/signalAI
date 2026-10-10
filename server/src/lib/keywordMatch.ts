/**
 * Case-insensitive contains-match — one matching mode, not a configurable
 * set (roadmap Phase 1 scope cut: exact-vs-contains as separate selectable
 * modes is a preference surface no pilot has asked for). First matching
 * campaign wins; a comment matching two campaigns' keywords is an
 * onboarding/config question for the creator, not something to resolve
 * with matching-order guarantees.
 *
 * `targetMediaIds` is the campaign's post-targeting scope: empty means
 * every post (unrestricted, the default for every campaign created before
 * this existed), non-empty means only a comment on one of those posts can
 * match. `mediaId` is undefined when the webhook payload didn't carry one
 * (shouldn't happen for a real comment event, but fails closed rather than
 * matching a scoped campaign against a post we can't identify).
 */
/**
 * DM Conversation Continuation (webhookIngestService.ts): the sentinel
 * `matchedKeyword` value for a message that reached a reply not because it
 * matched a real configured keyword, but because the lead already had an
 * ongoing DM conversation with that campaign. A real, honest, non-null
 * value rather than leaving matchedKeyword null — leadEventReplyHandler.ts's
 * gate requires both matchedCampaignId and matchedKeyword truthy, and the
 * dashboard timeline (which reads matchedKeyword straight off this
 * attribute) needs to visibly distinguish this from a genuine silent
 * non-match, not look identical to one.
 */
export const CONTINUATION_KEYWORD = "(ongoing conversation)";
/** Timeline sentinel for an existing DM automation restarted after the 24-hour gap. */
export const RESTART_KEYWORD = "(automation restarted after messaging gap)";

export interface DmCampaignTrigger {
  campaignId: string;
  keyword: string;
  restartCampaign: boolean;
}

type DmCampaign = {
  id: string;
  keywords: string[];
  targetMediaIds: string[];
  triggerSource: "comment" | "message" | "both";
  replyChannel?: "dm" | "comment" | "both";
  enabled?: boolean;
};

/**
 * Resolve a private inbound DM against active, DM-capable campaigns. A real
 * keyword always wins. Otherwise an existing campaign continues within the
 * previous 24-hour window, but restarts from its first milestone after a gap.
 */
export function resolveDmCampaignTrigger(
  sourceText: string,
  campaigns: DmCampaign[],
  activeDmCampaignId: string | null,
  previousWindowOpen: boolean,
  mediaId?: string,
  hasPriorInboundDm = true,
): DmCampaignTrigger | null {
  // Direct keyword matching must remain restricted to campaigns explicitly
  // configured to accept message triggers.
  const keywordEligible = campaigns.filter((campaign) =>
    (campaign.triggerSource === "message" || campaign.triggerSource === "both") &&
    campaign.enabled !== false,
  );
  const match = findMatchingCampaign(sourceText, mediaId, keywordEligible);
  if (match) {
    // A closed (or never-opened) customer DM window starts a new run even
    // when this is the first message that can be associated with the campaign.
    return { ...match, restartCampaign: hasPriorInboundDm && !previousWindowOpen };
  }

  if (!activeDmCampaignId) return null;

  // Continuation is deliberately independent of triggerSource. A comment
  // campaign can own an active DM journey after its one-time private reply,
  // so the customer's first DM must be able to continue it. It must still be
  // enabled and explicitly DM-capable; public-comment-only campaigns cannot
  // become DM journeys by virtue of activeDmCampaignId alone.
  const continuedCampaign = campaigns.find((campaign) =>
    campaign.id === activeDmCampaignId &&
    campaign.enabled !== false &&
    (campaign.replyChannel === "dm" || campaign.replyChannel === "both"),
  );
  if (!continuedCampaign) return null;

  // A customer's first DM after a comment private reply opens the first
  // standard messaging window; keep that run going. Restart only if there
  // was a prior inbound DM and its 24-hour window has since expired.
  return previousWindowOpen || !hasPriorInboundDm
    ? { campaignId: continuedCampaign.id, keyword: CONTINUATION_KEYWORD, restartCampaign: false }
    : { campaignId: continuedCampaign.id, keyword: RESTART_KEYWORD, restartCampaign: true };
}

export function findMatchingCampaign(
  commentText: string,
  mediaId: string | undefined,
  campaigns: Array<{ id: string; keywords: string[]; targetMediaIds: string[] }>,
): { campaignId: string; keyword: string } | null {
  const normalized = commentText.toLowerCase();

  for (const campaign of campaigns) {
    if (campaign.targetMediaIds.length > 0 && (!mediaId || !campaign.targetMediaIds.includes(mediaId))) {
      continue;
    }
    for (const keyword of campaign.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return { campaignId: campaign.id, keyword };
      }
    }
  }

  return null;
}
