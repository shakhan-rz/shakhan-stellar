/**
 * Tests for the event subscription's failure handling.
 *
 * The RPC server is mocked so a stale cursor and a dropped connection can be
 * simulated deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.hoisted(() => ({
  getLatestLedger: vi.fn(),
  getEvents: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<any>('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: class {
        constructor() {
          return rpc;
        }
      },
    },
  };
});

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: vi.fn(),
  WalletNetwork: { TESTNET: 'testnet' },
  allowAllModules: () => [],
  FREIGHTER_ID: 'freighter',
}));

import { watchContributions } from './crowdfunding';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  rpc.getLatestLedger.mockResolvedValue({ sequence: 1000 });
  rpc.getEvents.mockResolvedValue({ events: [], latestLedger: 1000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchContributions', () => {
  it('advances the cursor past ledgers it has already scanned', async () => {
    const stop = watchContributions(() => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(rpc.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 1000 })
    );

    rpc.getEvents.mockResolvedValue({ events: [], latestLedger: 1005 });
    await vi.advanceTimersByTimeAsync(5000);

    expect(rpc.getEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ startLedger: 1001 })
    );
    stop();
  });

  it('retries the same range after a single failure', async () => {
    watchContributions(
      () => {},
      () => {}
    );
    await vi.advanceTimersByTimeAsync(0);
    rpc.getEvents.mockRejectedValueOnce(new Error('network blip'));
    await vi.advanceTimersByTimeAsync(5000);

    // Cursor unchanged: a brief blip should not skip events.
    const before = rpc.getLatestLedger.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(rpc.getLatestLedger.mock.calls.length).toBe(before);
  });

  it('rejoins at the head when the cursor goes stale', async () => {
    const onError = vi.fn();
    watchContributions(() => {}, onError);
    await vi.advanceTimersByTimeAsync(0);

    // The window the cursor points at has been pruned — every poll fails the
    // same way, which would otherwise wedge the watcher forever.
    rpc.getEvents.mockRejectedValue(new Error('startLedger is before the oldest ledger'));
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(5000);

    expect(onError).toHaveBeenCalled();

    // Recovery: re-reads the latest ledger and resumes from there.
    rpc.getLatestLedger.mockResolvedValue({ sequence: 99_000 });
    rpc.getEvents.mockResolvedValue({ events: [], latestLedger: 99_000 });
    await vi.advanceTimersByTimeAsync(5000);

    expect(rpc.getEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ startLedger: 99_000 })
    );
  });

  it('stops polling once unsubscribed', async () => {
    const stop = watchContributions(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const calls = rpc.getEvents.mock.calls.length;

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rpc.getEvents.mock.calls.length).toBe(calls);
  });
});
