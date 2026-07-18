/**
 * TransactionHistory Component
 * 
 * Displays recent transactions for the connected wallet
 * 
 * Features:
 * - List recent transactions
 * - Show: amount, from/to, date
 * - Link to Stellar Expert for details
 * - Empty state when no transactions
 * - Loading state
 * - Refresh functionality
 */

'use client';

import { useState, useEffect } from 'react';
import { stellar } from '@/lib/stellar-helper';
import { FaHistory, FaSync, FaArrowUp, FaArrowDown, FaExternalLinkAlt } from 'react-icons/fa';
import { Card, EmptyState } from './example-components';

interface Transaction {
  id: string;
  type: string;
  amount?: string;
  asset?: string;
  from?: string;
  to?: string;
  createdAt: string;
  hash: string;
}

interface TransactionHistoryProps {
  publicKey: string;
}

export default function TransactionHistory({ publicKey }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [limit] = useState(10);

  const fetchTransactions = async () => {
    try {
      setRefreshing(true);
      const txs = await stellar.getRecentTransactions(publicKey, limit);
      setTransactions(txs);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchTransactions();
    }
  }, [publicKey]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatAddress = (address?: string): string => {
    if (!address) return 'N/A';
    return stellar.formatAddress(address, 4, 4);
  };

  const isOutgoing = (tx: Transaction): boolean => {
    return tx.from === publicKey;
  };

  if (loading) {
    return (
      <Card title="📜 Transaction History">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-white/5 rounded-lg"></div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FaHistory className="text-neutral-300" />
          Activity
        </h2>
        <button
          onClick={fetchTransactions}
          disabled={refreshing}
          className="text-neutral-300 hover:text-white disabled:opacity-50 transition-colors"
          title="Refresh transactions"
        >
          <FaSync className={`text-xl ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon="📭"
          title="No Transactions Yet"
          description="Your transaction history will appear here once you start sending or receiving XLM."
        />
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const outgoing = isOutgoing(tx);
            
            return (
              <div
                key={tx.id}
                className="bg-white/5 hover:bg-white/10 rounded-xl p-4 transition-all border border-white/10 hover:border-white/20"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      outgoing 
                        ? 'bg-red-500/20 text-red-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {outgoing ? <FaArrowUp /> : <FaArrowDown />}
                    </div>
                    <div>
                      <p className="text-white font-semibold">
                        {outgoing ? 'Sent' : 'Received'}
                      </p>
                      {tx.amount && (
                        <p className={`text-lg font-bold ${
                          outgoing ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {outgoing ? '-' : '+'}{parseFloat(tx.amount).toFixed(2)} {tx.asset || 'XLM'}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <a
                    href={stellar.getExplorerLink(tx.hash, 'tx')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-300 hover:text-white text-sm flex items-center gap-1 transition-colors"
                  >
                    Details <FaExternalLinkAlt className="text-xs" />
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-white/40 text-xs mb-1">From</p>
                    <p className="text-white/80 font-mono">{formatAddress(tx.from)}</p>
                  </div>
                  <div>
                    <p className="text-white/40 text-xs mb-1">To</p>
                    <p className="text-white/80 font-mono">{formatAddress(tx.to)}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                  <p className="text-white/40 text-xs">{formatDate(tx.createdAt)}</p>
                  <p className="text-white/30 text-xs font-mono">{tx.hash.slice(0, 12)}...</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-4 text-center">
          <p className="text-white/40 text-sm">
            Showing last {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </Card>
  );
}

