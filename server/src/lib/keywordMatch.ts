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
