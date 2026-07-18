/**
 * Shakhan — Stellar Money Toolkit
 *
 * Three payment tools on Stellar testnet (Send · Tip Jar · Split Bill).
 * Layout: header-based wallet connect + a two-pane app shell (sidebar nav
 * + content) once connected. All blockchain logic lives in
 * lib/stellar-helper.ts (DO NOT MODIFY).
 */

'use client';

import { useState } from 'react';
import { stellar } from '@/lib/stellar-helper';
import BalanceDisplay from '@/components/BalanceDisplay';
import PaymentForm from '@/components/PaymentForm';
import TransactionHistory from '@/components/TransactionHistory';
import TipJar from '@/components/TipJar';
import SplitBill from '@/components/SplitBill';
import FundCampaign from '@/components/FundCampaign';
import { FaPaperPlane, FaQrcode, FaUsers, FaWallet, FaCopy, FaCheck, FaHandHoldingHeart } from 'react-icons/fa';
import { MdLogout } from 'react-icons/md';

type Tab = 'send' | 'tip' | 'split' | 'fund';

export default function Home() {
  const [publicKey, setPublicKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>('send');
  const [copied, setCopied] = useState(false);

  const connect = async () => {
    try {
      setLoading(true);
      const key = await stellar.connectWallet();
      setPublicKey(key);
      setIsConnected(true);
    } catch (err: any) {
      alert(`Couldn't connect wallet:\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    stellar.disconnect();
    setPublicKey('');
    setIsConnected(false);
  };

  const copyAddress = async () => {
    await navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaymentSuccess = () => setRefreshKey((prev) => prev + 1);

  const nav: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'send', label: 'Send', icon: <FaPaperPlane /> },
    { id: 'tip', label: 'Tip Jar', icon: <FaQrcode /> },
    { id: 'split', label: 'Split Bill', icon: <FaUsers /> },
    { id: 'fund', label: 'Fund', icon: <FaHandHoldingHeart /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800 flex flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-neutral-100 to-neutral-400 rounded-xl flex items-center justify-center text-xl font-black text-neutral-900">
              S
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Shakhan</span>
            <span className="hidden sm:inline text-white/30 text-xs border border-white/15 rounded-full px-2 py-0.5">
              Testnet
            </span>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-2 text-sm text-white/80 transition-colors"
                title={copied ? 'Copied!' : 'Copy address'}
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono">{stellar.formatAddress(publicKey, 4, 4)}</span>
                {copied ? <FaCheck className="text-green-400" /> : <FaCopy className="text-white/40" />}
              </button>
              <button
                onClick={disconnect}
                className="p-2 text-white/50 hover:text-red-400 transition-colors"
                title="Disconnect"
              >
                <MdLogout />
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={loading}
              className="flex items-center gap-2 bg-neutral-100 hover:bg-white text-neutral-900 font-semibold text-sm px-4 py-2 rounded-full transition-all hover:scale-[1.03] disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-r-transparent" />
              ) : (
                <FaWallet />
              )}
              {loading ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {!isConnected ? (
          /* Landing */
          <div className="py-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <span className="inline-block text-white/50 text-sm border border-white/15 rounded-full px-3 py-1 mb-6">
                Payments on Stellar, made simple
              </span>
              <h1 className="text-4xl md:text-6xl font-black text-white mb-5 leading-tight">
                One wallet,{' '}
                <span className="bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
                  four tools
                </span>
              </h1>
              <p className="text-white/60 text-lg mb-8">
                Send XLM, receive tips with a QR code, split a bill with friends, or
                back a campaign through a smart contract — all on Stellar&apos;s fast,
                near-free network.
              </p>
              <button
                onClick={connect}
                disabled={loading}
                className="inline-flex items-center gap-2 bg-neutral-100 hover:bg-white text-neutral-900 font-bold px-7 py-3.5 rounded-full transition-all hover:scale-[1.03] disabled:opacity-50"
              >
                <FaWallet />
                {loading ? 'Connecting…' : 'Connect a wallet to start'}
              </button>
              <p className="text-white/30 text-xs mt-4">
                Works with Freighter, xBull, Albedo, Lobstr & more · Shakhan never sees your keys
              </p>
            </div>

            {/* Tool showcase */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {[
                { icon: '💸', title: 'Send', desc: 'Send XLM to any address with a memo and instant confirmation.' },
                { icon: '🫙', title: 'Tip Jar', desc: 'Turn your wallet into a shareable QR tip jar anyone can scan.' },
                { icon: '🧮', title: 'Split Bill', desc: 'Split a total evenly across friends and pay everyone at once.' },
                { icon: '🫱', title: 'Fund', desc: 'Back a crowdfunding campaign by calling a Soroban smart contract.' },
              ].map((t) => (
                <div
                  key={t.title}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] hover:border-white/20 transition-all"
                >
                  <div className="text-3xl mb-3">{t.icon}</div>
                  <h3 className="text-white font-semibold mb-1">{t.title}</h3>
                  <p className="text-white/60 text-sm">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* App shell: sidebar + content */
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar nav */}
            <aside className="lg:w-52 flex-shrink-0">
              <nav className="flex lg:flex-col gap-2 lg:sticky lg:top-24">
                {nav.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      tab === n.id
                        ? 'bg-white/10 text-white border border-white/15'
                        : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {n.icon}
                    <span>{n.label}</span>
                  </button>
                ))}
              </nav>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-8">
              <div key={`balance-${refreshKey}`}>
                <BalanceDisplay publicKey={publicKey} />
              </div>

              <div>
                {tab === 'send' && <PaymentForm publicKey={publicKey} onSuccess={handlePaymentSuccess} />}
                {tab === 'tip' && <TipJar publicKey={publicKey} />}
                {tab === 'split' && <SplitBill publicKey={publicKey} onSuccess={handlePaymentSuccess} />}
                {tab === 'fund' && <FundCampaign publicKey={publicKey} onSuccess={handlePaymentSuccess} />}
              </div>

              <div key={`history-${refreshKey}`}>
                <TransactionHistory publicKey={publicKey} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-white/40 text-xs">
          Shakhan · Built with Stellar SDK · Testnet only — no real funds are used.
        </div>
      </footer>
    </div>
  );
}
