/**
 * Case-insensitive contains-match — one matching mode, not a configurable
 * set (roadmap Phase 1 scope cut: exact-vs-contains as separate selectable
 * modes is a preference surface no pilot has asked for). First matching
 * campaign wins; a comment matching two campaigns' keywords is an
 * onboarding/config question for the creator, not something to resolve
 * with matching-order guarantees.
 */
export function findMatchingCampaign(
  commentText: string,
  campaigns: Array<{ id: string; keywords: string[] }>,
): { campaignId: string; keyword: string } | null {
  const normalized = commentText.toLowerCase();

  for (const campaign of campaigns) {
    for (const keyword of campaign.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return { campaignId: campaign.id, keyword };
      }
    }
  }

  return null;
}
