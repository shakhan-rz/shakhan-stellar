/**
 * Amount conversion and badge types.
 *
 * Deliberately free of any wallet, network or browser dependency: this is the
 * arithmetic that decides how much money moves, and it should be testable and
 * reviewable on its own. lib/crowdfunding.ts re-exports everything here.
 */

/** Stroops per XLM. Stellar counts amounts in integer stroops. */
const STROOPS = 10_000_000n;

/**
 * Parse a user-entered XLM amount into stroops.
 *
 * Anything finer than a stroop is truncated rather than rounded — rounding up
 * would send money the user did not type.
 */
export function xlmToStroops(value: string): bigint {
  const [whole, frac = ''] = value.trim().split('.');
  const fracPadded = (frac + '0000000').slice(0, 7);
  return BigInt(whole || '0') * STROOPS + BigInt(fracPadded || '0');
}

/** Format stroops as an XLM string, without trailing zeros. */
export function stroopsToXlm(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / STROOPS;
  const frac = (abs % STROOPS).toString().padStart(7, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

/** Badge tier, matching the `Tier` enum in the badge contract. */
export enum Tier {
  Bronze = 0,
  Silver = 1,
  Gold = 2,
}

export type Badge = {
  supporter: string;
  total: bigint;
  tier: Tier;
  count: number;
};

export type Campaign = {
  goalStroops: bigint;
  raisedStroops: bigint;
  deadline: number; // unix seconds
};

/**
 * Rank supporters by amount given, highest first.
 *
 * Sorting bigints needs an explicit comparator — the default one stringifies,
 * which would put "90000000" above "100000000".
 */
export function rankSupporters(badges: Badge[]): Badge[] {
  return [...badges].sort((a, b) =>
    b.total > a.total ? 1 : b.total < a.total ? -1 : 0
  );
}

/**
 * How much further to the next badge tier, or null if there is no next tier
 * or the thresholds are not loaded yet.
 */
export function nextTierGap(
  badge: Badge | null,
  silverAt: bigint,
  goldAt: bigint
): { label: string; remaining: bigint } | null {
  if (!badge || badge.tier === Tier.Gold) return null;
  const target = badge.tier === Tier.Bronze ? silverAt : goldAt;
  const label = badge.tier === Tier.Bronze ? 'Silver' : 'Gold';
  if (target <= 0n || badge.total >= target) return null;
  return { label, remaining: target - badge.total };
}
