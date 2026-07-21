/**
 * BalanceDisplay Component
 * 
 * Displays user's XLM balance with refresh functionality
 * 
 * Features:
 * - Show XLM balance with nice formatting
 * - Refresh balance button
 * - Loading skeleton/spinner
 * - Multiple asset support (bonus feature ready)
 */

'use client';

import { useState, useEffect } from 'react';
import { stellar } from '@/lib/stellar-helper';
import { isAccountNotFound } from '@/lib/amounts';
import { FaSync, FaCoins } from 'react-icons/fa';
import { Card } from './example-components';

interface BalanceDisplayProps {
  publicKey: string;
}

export default function BalanceDisplay({ publicKey }: BalanceDisplayProps) {
  const [balance, setBalance] = useState<string>('0');
  const [assets, setAssets] = useState<Array<{ code: string; issuer: string; balance: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // A brand new wallet has no account on the ledger until Friendbot funds it.
  // That is an expected first-run state, not an error, so we point the user at
  // Friendbot instead of alerting a raw "failed to fetch balance".
  const [needsFunding, setNeedsFunding] = useState(false);

  const fetchBalance = async () => {
    try {
      setRefreshing(true);
      const balanceData = await stellar.getBalance(publicKey);
      setBalance(balanceData.xlm);
      setAssets(balanceData.assets);
      setNeedsFunding(false);
    } catch (error) {
      if (isAccountNotFound(error)) {
        setNeedsFunding(true);
      } else {
        console.error('Error fetching balance:', error);
        alert('Failed to fetch balance. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchBalance();
    }
  }, [publicKey]);

  const formatBalance = (balance: string): string => {
    const num = parseFloat(balance);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 7,
    });
  };

  if (loading) {
    return (
      <Card title="💰 Your Balance">
        <div className="animate-pulse">
          <div className="h-16 bg-white/5 rounded-lg mb-4"></div>
          <div className="h-10 bg-white/5 rounded-lg w-1/2"></div>
        </div>
      </Card>
    );
  }

  if (needsFunding) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <FaCoins className="text-yellow-400 shrink-0" />
          <h2 className="text-2xl font-bold text-white">Your Balance</h2>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          <p className="text-4xl mb-3">🚀</p>
          <p className="text-white font-semibold mb-2">
            This wallet needs testnet XLM first
          </p>
          <p className="text-white/60 text-sm mb-5">
            Your account is not on the ledger yet. Fund it once with the free
            testnet faucet, then reload.
          </p>
          <a
            href={`https://friendbot.stellar.org/?addr=${publicKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Fund with Friendbot
          </a>
          <div className="mt-4">
            <button
              onClick={fetchBalance}
              disabled={refreshing}
              className="text-neutral-300 hover:text-white disabled:opacity-50 text-sm underline transition-colors"
            >
              {refreshing ? 'Checking…' : "I funded it — check again"}
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FaCoins className="text-yellow-400" />
          Your Balance
        </h2>
        <button
          onClick={fetchBalance}
          disabled={refreshing}
          className="text-neutral-300 hover:text-white disabled:opacity-50 transition-colors"
          title="Refresh balance"
        >
          <FaSync className={`text-xl ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* XLM Balance */}
      <div className="bg-gradient-to-br from-neutral-700/60 to-neutral-800/60 border border-white/10 rounded-xl p-6 mb-4">
        <p className="text-white/60 text-sm mb-2">Available Balance</p>
        {/* A funded testnet balance runs to seven decimals, which overflows a
            phone at text-5xl. Scale the figure with the viewport and let it
            wrap rather than clipping the digits. */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-white break-all">
            {formatBalance(balance)}
          </p>
          <p className="text-xl sm:text-2xl text-white/80">XLM</p>
        </div>
        
        {/* USD Estimate (placeholder for bonus feature) */}
        <p className="text-white/40 text-sm mt-2">
          ≈ ${(parseFloat(balance) * 0.12).toFixed(2)} USD
        </p>
      </div>

      {/* Other Assets */}
      {assets.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/60 text-sm mb-3">Other Assets</p>
          {assets.map((asset, index) => (
            <div
              key={index}
              className="bg-white/5 border border-white/10 rounded-lg p-4 flex justify-between items-center"
            >
              <div>
                <p className="text-white font-semibold">{asset.code}</p>
                <p className="text-white/40 text-xs font-mono truncate max-w-[200px]">
                  {asset.issuer}
                </p>
              </div>
              <p className="text-white text-lg font-bold">
                {formatBalance(asset.balance)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-lg">
        <p className="text-white/60 text-xs">
          💡 Keep at least 1 XLM in your account for network reserves.
        </p>
      </div>
    </Card>
  );
}

