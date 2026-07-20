/**
 * Tests for the wallet connect flow.
 *
 * The bug these guard against: reading the address before the user has picked
 * a wallet. That silently "works" on a desktop where the default wallet's
 * extension is installed, and fails on every phone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const kit = vi.hoisted(() => ({
  openModal: vi.fn(),
  setWallet: vi.fn(),
  getAddress: vi.fn(),
}));

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: class {
    constructor() {
      return kit;
    }
  },
  WalletNetwork: { TESTNET: 'Test SDF Network ; September 2015' },
  allowAllModules: () => [],
  FREIGHTER_ID: 'freighter',
}));

import { connectWallet } from './wallet';

const ADDRESS = 'GB237RO6DJ2OS5CXAQI63QZ3IVM4FETD7RYOETALEWXVIYD6SXZ7H775';

beforeEach(() => {
  vi.clearAllMocks();
  kit.getAddress.mockResolvedValue({ address: ADDRESS });
});

describe('connectWallet', () => {
  it('waits for the user to choose before reading the address', async () => {
    let choose: ((o: { id: string }) => void) | undefined;
    kit.openModal.mockImplementation(async (params: any) => {
      choose = params.onWalletSelected;
    });

    const pending = connectWallet();
    await Promise.resolve();

    // Nothing may be read while the picker is still open — this is exactly
    // what the helper got wrong.
    expect(kit.getAddress).not.toHaveBeenCalled();

    choose!({ id: 'albedo' });
    await expect(pending).resolves.toBe(ADDRESS);

    // And the address is read for the wallet the user actually picked.
    expect(kit.setWallet).toHaveBeenCalledWith('albedo');
    expect(kit.setWallet.mock.invocationCallOrder[0]).toBeLessThan(
      kit.getAddress.mock.invocationCallOrder[0]
    );
  });

  it('honours a wallet other than the default', async () => {
    kit.openModal.mockImplementation(async (params: any) => {
      params.onWalletSelected({ id: 'xbull' });
    });

    await connectWallet();
    expect(kit.setWallet).toHaveBeenCalledWith('xbull');
    expect(kit.setWallet).not.toHaveBeenCalledWith('freighter');
  });

  it('rejects when the picker is dismissed', async () => {
    kit.openModal.mockImplementation(async (params: any) => {
      params.onClosed();
    });

    await expect(connectWallet()).rejects.toThrow(/cancelled/i);
    expect(kit.getAddress).not.toHaveBeenCalled();
  });

  it('rejects when the wallet returns no address', async () => {
    kit.openModal.mockImplementation(async (params: any) => {
      params.onWalletSelected({ id: 'albedo' });
    });
    kit.getAddress.mockResolvedValue({ address: '' });

    await expect(connectWallet()).rejects.toThrow(/no address/i);
  });
});
