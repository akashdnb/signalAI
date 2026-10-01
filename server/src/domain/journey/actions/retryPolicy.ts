export interface JourneyActionRetryPolicy {
  maxAttempts: number;
  delaysSeconds: number[];
}

export const DEFAULT_JOURNEY_ACTION_RETRY_POLICY: JourneyActionRetryPolicy = {
  maxAttempts: 5,
  delaysSeconds: [30, 120, 600, 1800],
};

export function getRetryDelaySeconds(
  policy: JourneyActionRetryPolicy,
  attemptCount: number,
): number | null {
  if (attemptCount >= policy.maxAttempts) {
    return null;
  }

  const index = Math.max(0, attemptCount - 1);

  return policy.delaysSeconds[
    Math.min(index, policy.delaysSeconds.length - 1)
  ] ?? null;
}

export function getRetryAt(
  policy: JourneyActionRetryPolicy,
  attemptCount: number,
  now = new Date(),
): Date | null {
  const delaySeconds = getRetryDelaySeconds(policy, attemptCount);

  if (delaySeconds === null) {
    return null;
  }

  return new Date(now.getTime() + delaySeconds * 1000);
}
