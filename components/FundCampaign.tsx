/**
 * FundCampaign Component
 *
 * The "Fund" tab. Reads live campaign state from the Soroban crowdfunding
 * contract on testnet (goal / raised / deadline / your contribution) and lets
 * the connected wallet contribute XLM by calling the contract. Shows the
 * transaction status and a link to the on-chain result.
 *
 * Contract logic lives in lib/crowdfunding.ts (separate from the locked
 * stellar-helper.ts).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { stellar } from '@/lib/stellar-helper';
import {
  CONTRACT_ID,
  Campaign,
  getCampaign,
  getContribution,
  contribute,
  stroopsToXlm,
} from '@/lib/crowdfunding';
import { FaHandHoldingHeart, FaExternalLinkAlt } from 'react-icons/fa';
import { Card, Input, Button, Alert } from './example-components';

interface FundCampaignProps {
  publicKey: string;
  onSuccess?: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'success'; hash: string }
  | { kind: 'error'; message: string };

export default function FundCampaign({ publicKey, onSuccess }: FundCampaignProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [myContribution, setMyContribution] = useState<bigint>(0n);
  const [loadingState, setLoadingState] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const load = useCallback(async () => {
    setLoadingState(true);
    setLoadError(null);
    try {
      const [c, mine] = await Promise.all([
        getCampaign(publicKey),
        getContribution(publicKey),
      ]);
      setCampaign(c);
      setMyContribution(mine);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load campaign state.');
    } finally {
      setLoadingState(false);
    }
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleContribute = async () => {
    setStatus({ kind: 'sending' });
    try {
      const value = parseFloat(amount);
      if (!amount || isNaN(value) || value <= 0) {
        throw new Error('Enter a valid amount greater than zero.');
      }
      const hash = await contribute(publicKey, amount);
      setStatus({ kind: 'success', hash });
      setAmount('');
      await load();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message || 'Contribution failed.' });
    }
  };

  const goal = campaign ? campaign.goalStroops : 0n;
  const raised = campaign ? campaign.raisedStroops : 0n;
  const percent =
    campaign && goal > 0n
      ? Math.min(100, Number((raised * 10000n) / goal) / 100)
      : 0;
  const deadlineDate = campaign ? new Date(campaign.deadline * 1000) : null;
  const isClosed = campaign ? Date.now() / 1000 > campaign.deadline : false;
  const goalReached = campaign ? raised >= goal && goal > 0n : false;

  return (
    <Card>
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <FaHandHoldingHeart className="text-neutral-300" />
        Fund a Campaign
      </h2>
      <p className="text-white/60 text-sm mb-6">
        Back this crowdfunding campaign — your contribution is sent by calling a
        smart contract on Stellar testnet.
      </p>

      {loadingState ? (
        <div className="flex items-center gap-3 text-white/60 py-8 justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-4 border-solid border-white/70 border-r-transparent" />
          Loading campaign…
        </div>
      ) : loadError ? (
        <Alert type="error" message={loadError} onClose={() => setLoadError(null)} />
      ) : campaign ? (
        <div className="space-y-6">
          {/* Progress */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className="text-3xl font-bold text-white">
                {stroopsToXlm(raised)}{' '}
                <span className="text-base font-normal text-white/50">XLM raised</span>
              </span>
              <span className="text-white/60 text-sm">
                goal {stroopsToXlm(goal)} XLM
              </span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-neutral-200 to-neutral-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-white/50">
              <span>{percent.toFixed(1)}% funded</span>
              <span>
                {deadlineDate &&
                  (isClosed
                    ? `Closed ${deadlineDate.toLocaleDateString()}`
                    : `Ends ${deadlineDate.toLocaleDateString()}`)}
              </span>
            </div>
          </div>

          {/* Status chips */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-white/50 text-xs mb-1">Your contribution</p>
              <p className="text-white font-semibold">
                {stroopsToXlm(myContribution)} XLM
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-white/50 text-xs mb-1">Status</p>
              <p className="text-white font-semibold">
                {goalReached ? '🎉 Goal reached' : isClosed ? 'Closed' : 'Open'}
              </p>
            </div>
          </div>

          {/* Contribute form */}
          {!isClosed && !goalReached && (
            <div className="space-y-3">
              <Input
                label="Amount to contribute (XLM)"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={setAmount}
              />
              <Button
                onClick={handleContribute}
                variant="primary"
                disabled={status.kind === 'sending'}
                fullWidth
              >
                {status.kind === 'sending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-4 border-solid border-white border-r-transparent" />
                    Confirming on-chain…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <FaHandHoldingHeart /> Contribute
                  </span>
                )}
              </Button>
            </div>
          )}

          {status.kind === 'success' && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <p className="text-green-300 font-semibold mb-1">
                ✓ Contribution confirmed
              </p>
              <a
                href={stellar.getExplorerLink(status.hash, 'tx')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300 text-sm inline-flex items-center gap-1"
              >
                View transaction <FaExternalLinkAlt className="text-xs" />
              </a>
            </div>
          )}

          {status.kind === 'error' && (
            <Alert
              type="error"
              message={status.message}
              onClose={() => setStatus({ kind: 'idle' })}
            />
          )}

          <a
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-white/40 hover:text-white/70 text-xs font-mono transition-colors"
          >
            Contract {stellar.formatAddress(CONTRACT_ID, 6, 6)}
          </a>
        </div>
      ) : null}
    </Card>
  );
}
