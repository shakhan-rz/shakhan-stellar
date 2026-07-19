/**
 * Render tests for the Fund tab.
 *
 * The contract client is mocked: these check what the user actually sees in
 * each state — loading, no badge yet, badge earned, leaderboard, load failure —
 * without touching the network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Tier, type Badge, type Campaign } from '@/lib/amounts';

const ME = 'GB237RO6DJ2OS5CXAQI63QZ3IVM4FETD7RYOETALEWXVIYD6SXZ7H775';
const OTHER = 'GAE7X4FCFKP74MPG7W7XLF6E7YI7SOVUPFGSDRBVAOTBOGPDPUEYNBKZ';

const campaign: Campaign = {
  goalStroops: 1_000_000_000n, // 100 XLM
  raisedStroops: 350_000_000n, // 35 XLM
  deadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
};

const myBadge: Badge = {
  supporter: ME,
  total: 60_000_000n, // 6 XLM
  tier: Tier.Silver,
  count: 1,
};

const theirBadge: Badge = {
  supporter: OTHER,
  total: 290_000_000n, // 29 XLM
  tier: Tier.Gold,
  count: 3,
};

const mocks = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  getContribution: vi.fn(),
  getBadge: vi.fn(),
  getSupporters: vi.fn(),
  getThresholds: vi.fn(),
  contribute: vi.fn(),
  watchContributions: vi.fn(),
}));

vi.mock('@/lib/crowdfunding', async () => {
  const amounts = await vi.importActual<typeof import('@/lib/amounts')>('@/lib/amounts');
  return {
    ...amounts,
    CONTRACT_ID: 'CDARMHEBXGGGVQ53GASWRQHWDCVVB7O6SXZLZY47PTPINF6DDZWW4DNZ',
    BADGE_ID: 'CBACUDL2SDBNBPDBDBFND6LQYZW25LKNFWWXZSWI277TA5WHXYFFU3WY',
    ...mocks,
  };
});

vi.mock('@/lib/stellar-helper', () => ({
  stellar: {
    formatAddress: (a: string, s = 4, e = 4) => `${a.slice(0, s)}...${a.slice(-e)}`,
    getExplorerLink: (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`,
  },
}));

import FundCampaign from './FundCampaign';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCampaign.mockResolvedValue(campaign);
  mocks.getContribution.mockResolvedValue(60_000_000n);
  mocks.getBadge.mockResolvedValue(myBadge);
  mocks.getSupporters.mockResolvedValue([theirBadge, myBadge]);
  mocks.getThresholds.mockResolvedValue([50_000_000n, 200_000_000n]);
  mocks.watchContributions.mockReturnValue(() => {});
});

describe('FundCampaign', () => {
  it('shows a loading state before the contract responds', () => {
    render(<FundCampaign publicKey={ME} />);
    expect(screen.getByText(/loading campaign/i)).toBeInTheDocument();
  });

  it('renders campaign progress from the contract', async () => {
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(screen.getByText('35')).toBeInTheDocument());
    expect(screen.getByText(/goal 100 XLM/i)).toBeInTheDocument();
    expect(screen.getByText(/35\.0% funded/)).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows the badge earned and the gap to the next tier', async () => {
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() =>
      expect(screen.getByText(/silver supporter/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/6 XLM over 1 contribution/i)).toBeInTheDocument();
    expect(screen.getByText(/14 XLM more for Gold/i)).toBeInTheDocument();
  });

  it('offers an empty state when the wallet has no badge', async () => {
    mocks.getBadge.mockResolvedValue(null);
    mocks.getContribution.mockResolvedValue(0n);
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/no badge yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/supporter$/i)).not.toBeInTheDocument();
  });

  it('ranks supporters and marks the connected wallet', async () => {
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/top supporters/i)).toBeInTheDocument());

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Highest first, and only the connected wallet is labelled.
    expect(rows[0]).toHaveTextContent('29 XLM');
    expect(rows[1]).toHaveTextContent('6 XLM');
    expect(rows[1]).toHaveTextContent('(you)');
    expect(rows[0]).not.toHaveTextContent('(you)');
  });

  it('surfaces a load failure instead of showing stale zeros', async () => {
    mocks.getCampaign.mockRejectedValue(new Error('RPC unreachable'));
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/RPC unreachable/)).toBeInTheDocument());
    expect(screen.queryByText(/goal 100 XLM/i)).not.toBeInTheDocument();
  });

  it('subscribes to contract events and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    mocks.watchContributions.mockReturnValue(unsubscribe);

    const { unmount } = render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(mocks.watchContributions).toHaveBeenCalled());

    // A subscription left running after unmount would keep polling forever.
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
