/**
 * Tests for the amount conversion and ranking logic in lib/amounts.
 *
 * The conversions are the highest-consequence code in the frontend: they turn
 * what someone types into the integer that actually moves. Getting a decimal
 * place wrong here sends 10x the intended amount, and it would look correct on
 * screen right up until the transaction confirmed.
 */

import { describe, it, expect } from 'vitest';
import {
  xlmToStroops,
  stroopsToXlm,
  rankSupporters,
  nextTierGap,
  isAccountNotFound,
  Tier,
  type Badge,
} from './amounts';

describe('xlmToStroops', () => {
  it('converts whole amounts', () => {
    expect(xlmToStroops('1')).toBe(10_000_000n);
    expect(xlmToStroops('100')).toBe(1_000_000_000n);
    expect(xlmToStroops('0')).toBe(0n);
  });

  it('converts decimals without losing precision', () => {
    expect(xlmToStroops('1.5')).toBe(15_000_000n);
    expect(xlmToStroops('0.5')).toBe(5_000_000n);
    expect(xlmToStroops('12.3456789')).toBe(123_456_789n);
  });

  it('handles the smallest representable unit', () => {
    expect(xlmToStroops('0.0000001')).toBe(1n);
  });

  it('pads short decimals rather than misreading them', () => {
    // "0.1" is a tenth of an XLM — a million stroops, not one.
    expect(xlmToStroops('0.1')).toBe(1_000_000n);
    expect(xlmToStroops('0.01')).toBe(100_000n);
  });

  it('truncates beyond seven decimal places', () => {
    // Stellar has no sub-stroop precision; extra digits are dropped, never
    // rounded up into money the user did not intend to send.
    expect(xlmToStroops('1.99999999')).toBe(19_999_999n);
  });

  it('ignores surrounding whitespace', () => {
    expect(xlmToStroops('  2.5  ')).toBe(25_000_000n);
  });

  it('stays exact for amounts past the safe integer range', () => {
    // 1e10 XLM is 1e17 stroops, beyond Number.MAX_SAFE_INTEGER. This is the
    // reason the code uses BigInt at all.
    expect(xlmToStroops('10000000000')).toBe(100_000_000_000_000_000n);
  });
});

describe('stroopsToXlm', () => {
  it('formats whole amounts without a decimal point', () => {
    expect(stroopsToXlm(10_000_000n)).toBe('1');
    expect(stroopsToXlm(1_000_000_000n)).toBe('100');
    expect(stroopsToXlm(0n)).toBe('0');
  });

  it('trims trailing zeros', () => {
    expect(stroopsToXlm(15_000_000n)).toBe('1.5');
    expect(stroopsToXlm(1_500_000n)).toBe('0.15');
  });

  it('keeps leading zeros inside the fraction', () => {
    // 1 stroop is 0.0000001 XLM — the zeros between the point and the 1 are
    // significant, and dropping them would inflate the number a millionfold.
    expect(stroopsToXlm(1n)).toBe('0.0000001');
    expect(stroopsToXlm(100_000n)).toBe('0.01');
  });

  it('handles negatives', () => {
    expect(stroopsToXlm(-15_000_000n)).toBe('-1.5');
  });
});

describe('round trip', () => {
  it('survives conversion in both directions', () => {
    for (const value of ['0', '1', '0.1', '1.5', '12.3456789', '0.0000001', '100']) {
      expect(stroopsToXlm(xlmToStroops(value))).toBe(value);
    }
  });

  it('does not fall into scientific notation', () => {
    // `String(Number('0.0000001'))` is '1e-7', which is not an amount any
    // wallet or explorer would accept. Formatting from the bigint sidesteps
    // Number entirely — this test exists to keep it that way.
    const formatted = stroopsToXlm(xlmToStroops('0.0000001'));
    expect(formatted).toBe('0.0000001');
    expect(formatted).not.toContain('e');
  });
});

// The leaderboard sorts on bigint totals. Array.sort's default comparator
// stringifies, which would rank "9" above "10" — the sort has to compare
// numerically.
describe('supporter ranking', () => {
  const badge = (total: bigint, tier: Tier): Badge => ({
    supporter: `G${total}`,
    total,
    tier,
    count: 1,
  });

  it('orders by amount, highest first', () => {
    const sorted = rankSupporters([
      badge(60_000_000n, Tier.Silver),
      badge(220_000_000n, Tier.Gold),
      badge(10_000_000n, Tier.Bronze),
    ]);
    expect(sorted.map((b) => b.total)).toEqual([
      220_000_000n,
      60_000_000n,
      10_000_000n,
    ]);
  });

  it('does not fall back to string ordering', () => {
    // Lexically "90000000" > "100000000", so a stringifying sort gets this
    // backwards.
    const sorted = rankSupporters([badge(90_000_000n, Tier.Gold), badge(100_000_000n, Tier.Gold)]);
    expect(sorted[0].total).toBe(100_000_000n);
  });
});

describe('nextTierGap', () => {
  const badge = (total: bigint, tier: Tier): Badge => ({
    supporter: 'G...',
    total,
    tier,
    count: 1,
  });

  const SILVER = 50_000_000n; // 5 XLM
  const GOLD = 200_000_000n; // 20 XLM

  it('reports the distance to Silver from Bronze', () => {
    const gap = nextTierGap(badge(10_000_000n, Tier.Bronze), SILVER, GOLD);
    expect(gap).toEqual({ label: 'Silver', remaining: 40_000_000n });
  });

  it('reports the distance to Gold from Silver', () => {
    // The 6 XLM / "14 XLM more for Gold" case shown in the UI.
    const gap = nextTierGap(badge(60_000_000n, Tier.Silver), SILVER, GOLD);
    expect(gap).toEqual({ label: 'Gold', remaining: 140_000_000n });
  });

  it('reports nothing once Gold is reached', () => {
    expect(nextTierGap(badge(220_000_000n, Tier.Gold), SILVER, GOLD)).toBeNull();
  });

  it('reports nothing without a badge', () => {
    expect(nextTierGap(null, SILVER, GOLD)).toBeNull();
  });

  it('reports nothing before the thresholds have loaded', () => {
    // Thresholds default to 0n on first render; showing "0 XLM more" then
    // would be wrong.
    expect(nextTierGap(badge(10_000_000n, Tier.Bronze), 0n, 0n)).toBeNull();
  });
});

describe('isAccountNotFound', () => {
  it('recognises the unfunded-account error', () => {
    expect(
      isAccountNotFound(new Error('Account not found: GD5FXBZXOFNPJGAC3JYD2B7'))
    ).toBe(true);
    expect(isAccountNotFound(new Error('NotFound'))).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    // These need to surface as real errors, not a "go fund your wallet" nudge.
    expect(isAccountNotFound(new Error('RPC unreachable'))).toBe(false);
    expect(isAccountNotFound(new Error('Timed out'))).toBe(false);
    expect(isAccountNotFound(undefined)).toBe(false);
  });
});
