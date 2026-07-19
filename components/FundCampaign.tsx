/**
 * FundCampaign Component
 *
 * The "Fund" tab. Reads live campaign state from the Soroban crowdfunding
 * contract on testnet (goal / raised / deadline / your contribution) and lets
 * the connected wallet contribute XLM by calling the contract.
 *
 * Contributing also earns a supporter badge: the campaign contract calls a
 * second contract, the badge registry, which tracks each backer's running
 * total and awards a Bronze / Silver / Gold tier. Both the badge and the
 * supporter leaderboard are read from that second contract.
 *
 * The panel subscribes to the campaign's `Contributed` events, so a
 * contribution made by anyone — in another browser, from the CLI — shows up
 * here within a few seconds without a refresh.
 *
 * Contract logic lives in lib/crowdfunding.ts (separate from the locked
 * stellar-helper.ts).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { stellar } from '@/lib/stellar-helper';
import {
  CONTRACT_ID,
  BADGE_ID,
  Campaign,
  Badge,
  Tier,
  getCampaign,
  getContribution,
  getBadge,
  getSupporters,
  getThresholds,
  watchContributions,
  contribute,
  stroopsToXlm,
} from '@/lib/crowdfunding';
import { FaHandHoldingHeart, FaExternalLinkAlt, FaTrophy, FaBolt } from 'react-icons/fa';
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

const TIERS: Record<Tier, { label: string; medal: string; ring: string }> = {
  [Tier.Bronze]: { label: 'Bronze', medal: '🥉', ring: 'border-amber-700/50 bg-amber-700/10' },
  [Tier.Silver]: { label: 'Silver', medal: '🥈', ring: 'border-slate-300/40 bg-slate-300/10' },
  [Tier.Gold]: { label: 'Gold', medal: '🥇', ring: 'border-yellow-400/50 bg-yellow-400/10' },
};

export default function FundCampaign({ publicKey, onSuccess }: FundCampaignProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [myContribution, setMyContribution] = useState<bigint>(0n);
  const [badge, setBadge] = useState<Badge | null>(null);
  const [supporters, setSupporters] = useState<Badge[]>([]);
  const [thresholds, setThresholds] = useState<[bigint, bigint]>([0n, 0n]);
  const [loadingState, setLoadingState] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [liveFlash, setLiveFlash] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoadingState(true);
      setLoadError(null);
      try {
        const [c, mine, mineBadge, all, thr] = await Promise.all([
          getCampaign(publicKey),
          getContribution(publicKey),
          getBadge(publicKey),
          getSupporters(publicKey),
          getThresholds(publicKey),
        ]);
        setCampaign(c);
        setMyContribution(mine);
        setBadge(mineBadge);
        setSupporters(all);
        setThresholds(thr);
      } catch (err: any) {
        setLoadError(err?.message || 'Could not load campaign state.');
      } finally {
        if (showSpinner) setLoadingState(false);
      }
    },
    [publicKey]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Keep the latest `load` reachable from the subscription without making the
  // subscription itself depend on it — re-subscribing on every render would
  // restart the event cursor and replay events.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const unsubscribe = watchContributions((e) => {
      const who =
        e.donor === publicKey ? 'You' : stellar.formatAddress(e.donor, 4, 4);
      setLiveFlash(`${who} contributed ${stroopsToXlm(e.amount)} XLM`);
      // Long enough to notice and read after looking away; the numbers it
      // announces stay changed regardless.
      setTimeout(() => setLiveFlash(null), 15000);
      // Refresh quietly: the numbers change under the user, not the layout.
      loadRef.current(false);
    });
    return unsubscribe;
  }, [publicKey]);

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

  // How much further to the next badge tier, if there is one.
  const [silverAt, goldAt] = thresholds;
  const nextTier = (() => {
    if (!badge || badge.tier === Tier.Gold) return null;
    const target = badge.tier === Tier.Bronze ? silverAt : goldAt;
    const label = badge.tier === Tier.Bronze ? 'Silver' : 'Gold';
    if (target <= 0n || badge.total >= target) return null;
    return { label, remaining: target - badge.total };
  })();

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

      {liveFlash && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sm text-sky-200">
          <FaBolt className="shrink-0 text-sky-300" />
          <span>{liveFlash}</span>
          <span className="ml-auto text-xs text-sky-300/60">live</span>
        </div>
      )}

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

          {/* Supporter badge — awarded by a second contract */}
          <div
            className={`rounded-xl border p-4 ${
              badge ? TIERS[badge.tier].ring : 'border-white/10 bg-white/5'
            }`}
          >
            {badge ? (
              <div className="flex items-center gap-4">
                <div className="text-4xl leading-none">{TIERS[badge.tier].medal}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {TIERS[badge.tier].label} supporter
                  </p>
                  <p className="text-sm text-white/60">
                    {stroopsToXlm(badge.total)} XLM over {badge.count}{' '}
                    {badge.count === 1 ? 'contribution' : 'contributions'}
                  </p>
                  {nextTier && (
                    <p className="mt-1 text-xs text-white/40">
                      {stroopsToXlm(nextTier.remaining)} XLM more for {nextTier.label}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-4xl leading-none opacity-30">🥉</div>
                <div>
                  <p className="font-semibold text-white/80">No badge yet</p>
                  <p className="text-sm text-white/50">
                    Contribute to earn one — the campaign awards it through a
                    second contract.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Leaderboard */}
          {supporters.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                <FaTrophy className="text-yellow-400/70" />
                Top supporters
                <span className="text-white/40">({supporters.length})</span>
              </h3>
              <ol className="space-y-2">
                {supporters.slice(0, 5).map((s, i) => {
                  const isMe = s.supporter === publicKey;
                  return (
                    <li
                      key={s.supporter}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        isMe
                          ? 'border-white/25 bg-white/10'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <span className="w-4 text-white/40">{i + 1}</span>
                      <span>{TIERS[s.tier].medal}</span>
                      <span className="font-mono text-white/80">
                        {stellar.formatAddress(s.supporter, 4, 4)}
                        {isMe && <span className="ml-2 text-white/50">(you)</span>}
                      </span>
                      <span className="ml-auto font-semibold text-white">
                        {stroopsToXlm(s.total)} XLM
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

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

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 border-t border-white/10 pt-4 text-xs font-mono text-white/40">
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white/70"
            >
              Campaign {stellar.formatAddress(CONTRACT_ID, 4, 4)}
            </a>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${BADGE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white/70"
            >
              Badges {stellar.formatAddress(BADGE_ID, 4, 4)}
            </a>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
