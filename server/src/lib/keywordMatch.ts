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
