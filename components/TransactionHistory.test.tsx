/**
 * Render tests for the Activity feed.
 *
 * The case worth pinning: a create_account entry (Friendbot funding a new
 * wallet) has no from/to/amount in the payments feed, so the old code showed
 * "N/A / N/A". It should read as "Account Funded" instead. Ordinary sends and
 * receives must keep showing the counterparties.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const ME = 'GD5FXBZXOFNPJGAC3JYD2B7Q4LOBAVPNR4EVXYZ2W6QK3EXAMPLE7H7';
const OTHER = 'GAE7X4FCFKP74MPG7W7XLF6E7YI7SOVUPFGSDRBVAOTBOGPDPUEYNBKZ';

const mocks = vi.hoisted(() => ({
  getRecentTransactions: vi.fn(),
}));

vi.mock('@/lib/stellar-helper', () => ({
  stellar: {
    getRecentTransactions: mocks.getRecentTransactions,
    getExplorerLink: (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`,
    formatAddress: (a: string, s = 4, e = 4) => `${a.slice(0, s)}...${a.slice(-e)}`,
  },
}));

import TransactionHistory from './TransactionHistory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TransactionHistory', () => {
  it('labels a Friendbot funding as Account Funded, not N/A', async () => {
    mocks.getRecentTransactions.mockResolvedValue([
      {
        id: '1',
        type: 'create_account',
        createdAt: new Date().toISOString(),
        hash: 'd11d03166572abcdef',
        // from/to/amount are absent for create_account.
      },
    ]);

    render(<TransactionHistory publicKey={ME} />);

    await waitFor(() => expect(screen.getByText('Account Funded')).toBeInTheDocument());
    expect(screen.getByText(/created and funded with testnet XLM/i)).toBeInTheDocument();
    // The bare "N/A / N/A" grid must be gone.
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('still shows counterparties for an ordinary payment', async () => {
    mocks.getRecentTransactions.mockResolvedValue([
      {
        id: '2',
        type: 'payment',
        amount: '25',
        asset: 'XLM',
        from: OTHER,
        to: ME,
        createdAt: new Date().toISOString(),
        hash: 'abc123def456',
      },
    ]);

    render(<TransactionHistory publicKey={ME} />);

    await waitFor(() => expect(screen.getByText('Received')).toBeInTheDocument());
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
    // The incoming amount is shown in green with a plus sign.
    expect(screen.getByText(/\+25\.00 XLM/)).toBeInTheDocument();
  });

  it('shows the empty state when there is no activity', async () => {
    mocks.getRecentTransactions.mockResolvedValue([]);
    render(<TransactionHistory publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument());
  });
});
