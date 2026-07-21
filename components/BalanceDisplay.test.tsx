/**
 * Render tests for the balance panel shown on every tab.
 *
 * The one behaviour worth pinning down: a brand new (unfunded) wallet must not
 * blow up with a raw "failed to fetch balance" alert. It should recognise the
 * missing-account state and point the user at Friendbot, the same as the Fund
 * tab does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ME = 'GD5FXBZXOFNPJGAC3JYD2B7Q4LOBAVPNR4EVXYZ2W6QK3EXAMPLE7H7';

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
}));

vi.mock('@/lib/stellar-helper', () => ({
  stellar: {
    getBalance: mocks.getBalance,
  },
}));

import BalanceDisplay from './BalanceDisplay';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BalanceDisplay', () => {
  it('shows the balance once the account loads', async () => {
    mocks.getBalance.mockResolvedValue({ xlm: '42.5', assets: [] });
    render(<BalanceDisplay publicKey={ME} />);
    await waitFor(() => expect(screen.getByText(/42\.50/)).toBeInTheDocument());
  });

  it('points an unfunded wallet at Friendbot instead of alerting', async () => {
    // The Horizon 404 an empty account produces: message is the status text,
    // the 404 lives on the response.
    mocks.getBalance.mockRejectedValue(
      Object.assign(new Error('Not Found'), { response: { status: 404 } })
    );
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<BalanceDisplay publicKey={ME} />);

    await waitFor(() =>
      expect(screen.getByText(/needs testnet XLM first/i)).toBeInTheDocument()
    );
    // No raw alert, and a one-tap way out pointed at this wallet.
    expect(alertSpy).not.toHaveBeenCalled();
    const link = screen.getByRole('link', { name: /fund with friendbot/i });
    expect(link).toHaveAttribute('href', `https://friendbot.stellar.org/?addr=${ME}`);
  });

  it('recovers once the account is funded', async () => {
    mocks.getBalance
      .mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), { response: { status: 404 } })
      )
      .mockResolvedValueOnce({ xlm: '100', assets: [] });

    render(<BalanceDisplay publicKey={ME} />);
    await waitFor(() =>
      expect(screen.getByText(/needs testnet XLM first/i)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.getByText(/100\.00/)).toBeInTheDocument());
    expect(screen.queryByText(/needs testnet XLM/i)).not.toBeInTheDocument();
  });

  it('still surfaces a genuine failure as an alert', async () => {
    mocks.getBalance.mockRejectedValue(new Error('RPC unreachable'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<BalanceDisplay publicKey={ME} />);

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.queryByText(/needs testnet XLM/i)).not.toBeInTheDocument();
  });
});
