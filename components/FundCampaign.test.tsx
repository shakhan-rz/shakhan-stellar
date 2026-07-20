/**
 * Render tests for the Fund tab.
 *
 * The contract client is mocked: these check what the user actually sees in
 * each state — loading, no badge yet, badge earned, leaderboard, load failure —
 * without touching the network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('recovers from a failed first load via Try again', async () => {
    mocks.getCampaign.mockRejectedValueOnce(new Error('RPC unreachable'));
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/RPC unreachable/)).toBeInTheDocument());

    // The failure state must offer a way back, and it must work.
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText(/goal 100 XLM/i)).toBeInTheDocument());
    expect(screen.queryByText(/RPC unreachable/)).not.toBeInTheDocument();
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

describe('background refresh', () => {
  it('keeps the panel visible when a live refresh fails', async () => {
    let onEvent: ((e: any) => void) | undefined;
    mocks.watchContributions.mockImplementation((cb: any) => {
      onEvent = cb;
      return () => {};
    });

    render(<FundCampaign publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/goal 100 XLM/i)).toBeInTheDocument());

    // A contribution lands, but the refresh it triggers hits a network blip.
    mocks.getCampaign.mockRejectedValue(new Error('RPC unreachable'));
    onEvent!({
      donor: OTHER,
      amount: 30_000_000n,
      totalRaised: 380_000_000n,
      goalReached: false,
      ledger: 1,
      txHash: 'abc',
    });

    // The already-loaded campaign must survive a transient failure.
    await waitFor(() =>
      expect(screen.getByText(/contributed 3 XLM/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/goal 100 XLM/i)).toBeInTheDocument();
  });
});

describe('overlapping loads', () => {
  it('does not leave the spinner stuck when an event lands mid-load', async () => {
    // Hold the first (spinner-showing) load open.
    let releaseFirst: (v: any) => void;
    mocks.getCampaign.mockReturnValueOnce(
      new Promise((res) => {
        releaseFirst = res;
      })
    );

    let onEvent: ((e: any) => void) | undefined;
    mocks.watchContributions.mockImplementation((cb: any) => {
      onEvent = cb;
      return () => {};
    });

    render(<FundCampaign publicKey={ME} />);
    expect(screen.getByText(/loading campaign/i)).toBeInTheDocument();

    // A contribution arrives while the first load is still in flight and
    // kicks off a second, quiet load.
    onEvent!({
      donor: OTHER,
      amount: 30_000_000n,
      totalRaised: 380_000_000n,
      goalReached: false,
      ledger: 1,
      txHash: 'abc',
    });

    // Now the original load comes back.
    releaseFirst!(campaign);

    // The spinner has to go away — the quiet load can't clear it, and the
    // first one has been superseded.
    await waitFor(() =>
      expect(screen.queryByText(/loading campaign/i)).not.toBeInTheDocument()
    );
    expect(screen.getByText(/goal 100 XLM/i)).toBeInTheDocument();
  });
});

describe('unfunded wallet', () => {
  it('explains how to get testnet XLM instead of showing a raw error', async () => {
    mocks.getCampaign.mockRejectedValue(
      new Error('Account not found: GD5FXBZXOFNPJGAC3JYD2B7Q4LOBAVPNR4EVXYZ')
    );

    render(<FundCampaign publicKey={ME} />);
    await waitFor(() =>
      expect(screen.getByText(/needs testnet XLM first/i)).toBeInTheDocument()
    );

    // The raw address-bearing error is not what the user should be reading.
    expect(screen.queryByText(/Account not found/)).not.toBeInTheDocument();

    // And there is a one-tap way out, pointed at this wallet.
    const link = screen.getByRole('link', { name: /fund with friendbot/i });
    expect(link).toHaveAttribute('href', `https://friendbot.stellar.org/?addr=${ME}`);
  });

  it('recovers once the account is funded', async () => {
    mocks.getCampaign.mockRejectedValueOnce(new Error('Account not found: G...'));
    render(<FundCampaign publicKey={ME} />);
    await waitFor(() =>
      expect(screen.getByText(/needs testnet XLM first/i)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: /funded it/i }));
    await waitFor(() => expect(screen.getByText(/goal 100 XLM/i)).toBeInTheDocument());
    expect(screen.queryByText(/needs testnet XLM/i)).not.toBeInTheDocument();
  });
});
