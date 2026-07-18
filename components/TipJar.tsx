/**
 * TipJar Component
 *
 * A shareable "tip jar" page. Shows the connected wallet's address as a QR
 * code so anyone can scan it and send XLM. Also lets the owner set a suggested
 * amount that gets baked into the shareable text.
 *
 * Uses the pre-built blockchain helpers (stellar.formatAddress) — no wallet
 * private keys are ever touched here; this screen only RECEIVES.
 */

'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { stellar } from '@/lib/stellar-helper';
import { FaQrcode, FaHeart } from 'react-icons/fa';
import { Card, Input, CopyButton } from './example-components';

interface TipJarProps {
  publicKey: string;
}

export default function TipJar({ publicKey }: TipJarProps) {
  const [suggested, setSuggested] = useState('10');
  const [label, setLabel] = useState('Buy me a coffee ☕');

  return (
    <Card>
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <FaQrcode className="text-neutral-300" />
        Tip Jar
      </h2>
      <p className="text-white/60 text-sm mb-6">
        Share this page or QR code. Anyone can scan it with a Stellar wallet to send you XLM.
      </p>

      <div className="grid md:grid-cols-2 gap-6 items-center">
        {/* QR + address */}
        <div className="flex flex-col items-center text-center">
          <div className="bg-white p-4 rounded-2xl shadow-lg">
            <QRCodeSVG value={publicKey} size={180} level="M" />
          </div>
          <p className="text-white/50 text-xs mt-4 mb-1">Your address</p>
          <p className="text-white font-mono text-sm">
            {stellar.formatAddress(publicKey, 6, 6)}
          </p>
          <div className="mt-2">
            <CopyButton text={publicKey} />
          </div>
        </div>

        {/* Customize the jar */}
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/15 rounded-xl p-4">
            <p className="text-neutral-300 text-sm flex items-center gap-2 mb-1">
              <FaHeart /> {label || 'Support me'}
            </p>
            <p className="text-white text-3xl font-bold">
              {suggested || '0'} <span className="text-lg text-white/60">XLM</span>
            </p>
            <p className="text-white/50 text-xs mt-1">Suggested tip</p>
          </div>

          <Input
            label="Jar title"
            placeholder="Buy me a coffee ☕"
            value={label}
            onChange={setLabel}
          />
          <Input
            label="Suggested amount (XLM)"
            type="number"
            placeholder="10"
            value={suggested}
            onChange={setSuggested}
          />
        </div>
      </div>

      <div className="mt-6 p-3 bg-white/5 border border-white/15 rounded-lg">
        <p className="text-neutral-300 text-xs">
          💡 This screen only <strong>receives</strong> funds — your keys stay in your wallet.
        </p>
      </div>
    </Card>
  );
}
