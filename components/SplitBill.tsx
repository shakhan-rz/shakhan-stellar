/**
 * SplitBill Component
 *
 * Enter a total amount and a list of recipient addresses. The app splits the
 * total evenly and sends each person their share as a separate XLM payment on
 * testnet, reporting success/failure per recipient.
 *
 * Reuses stellar.sendPayment() from the pre-built helper (DO NOT MODIFY that file).
 */

'use client';

import { useState } from 'react';
import { stellar } from '@/lib/stellar-helper';
import { FaUsers, FaPlus, FaTrash, FaPaperPlane } from 'react-icons/fa';
import { Card, Input, Button, Alert } from './example-components';

interface SplitBillProps {
  publicKey: string;
  onSuccess?: () => void;
}

// One row per person we're paying
type Sent = { address: string; status: 'pending' | 'ok' | 'fail'; hash?: string; error?: string };

export default function SplitBill({ publicKey, onSuccess }: SplitBillProps) {
  const [total, setTotal] = useState('');
  const [recipients, setRecipients] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [results, setResults] = useState<Sent[]>([]);

  // How much each valid recipient gets (evenly split), rounded to 7 decimals (Stellar precision)
  const validCount = recipients.filter((r) => r.trim().length === 56 && r.startsWith('G')).length;
  const perPerson = total && validCount > 0 ? (parseFloat(total) / validCount).toFixed(7) : '0';

  const updateRecipient = (index: number, value: string) => {
    setRecipients((prev) => prev.map((r, i) => (i === index ? value : r)));
  };

  const addRecipient = () => setRecipients((prev) => [...prev, '']);
  const removeRecipient = (index: number) =>
    setRecipients((prev) => prev.filter((_, i) => i !== index));

  const handleSplit = async () => {
    setAlert(null);
    setResults([]);

    const valid = recipients.filter((r) => r.trim().length === 56 && r.startsWith('G'));
    if (!total || parseFloat(total) <= 0) {
      setAlert({ type: 'error', message: 'Enter a valid total amount.' });
      return;
    }
    if (valid.length === 0) {
      setAlert({ type: 'error', message: 'Add at least one valid Stellar address (starts with G, 56 chars).' });
      return;
    }

    setLoading(true);
    const share = (parseFloat(total) / valid.length).toFixed(7);
    const collected: Sent[] = [];

    // Send each person their share, one after another
    for (const address of valid) {
      try {
        const res = await stellar.sendPayment({ from: publicKey, to: address, amount: share, memo: 'Split bill' });
        collected.push({ address, status: res.success ? 'ok' : 'fail', hash: res.hash });
      } catch (err: any) {
        collected.push({ address, status: 'fail', error: err?.message || 'failed' });
      }
      setResults([...collected]);
    }

    setLoading(false);
    const okCount = collected.filter((c) => c.status === 'ok').length;
    setAlert({
      type: okCount === valid.length ? 'success' : 'error',
      message: `Sent ${okCount}/${valid.length} payments of ${share} XLM each.`,
    });
    if (okCount > 0 && onSuccess) onSuccess();
  };

  return (
    <Card>
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <FaUsers className="text-neutral-300" />
        Split Bill
      </h2>
      <p className="text-white/60 text-sm mb-6">
        Split a total evenly and pay everyone their share in one go.
      </p>

      {alert && (
        <div className="mb-4">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      <div className="space-y-4">
        <Input
          label="Total amount (XLM)"
          type="number"
          placeholder="0.00"
          value={total}
          onChange={setTotal}
        />

        <div className="bg-white/5 border border-white/15 rounded-xl p-4 flex justify-between items-center">
          <span className="text-white/70 text-sm">Each person pays</span>
          <span className="text-white text-2xl font-bold">
            {perPerson} <span className="text-sm text-white/60">XLM</span>
          </span>
        </div>

        <div className="space-y-2">
          <label className="block text-white/80 text-sm">Recipients</label>
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  label=""
                  placeholder="GXXXXXXXX... (56 chars)"
                  value={r}
                  onChange={(v) => updateRecipient(i, v)}
                />
              </div>
              {recipients.length > 1 && (
                <button
                  onClick={() => removeRecipient(i)}
                  className="mt-1 p-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  aria-label="Remove recipient"
                >
                  <FaTrash />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addRecipient}
            className="text-neutral-300 hover:text-white text-sm flex items-center gap-2 mt-1"
          >
            <FaPlus /> Add recipient
          </button>
        </div>

        <Button onClick={handleSplit} variant="primary" disabled={loading} fullWidth>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-4 border-solid border-white border-r-transparent"></div>
              Sending payments...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <FaPaperPlane /> Split & Send
            </span>
          )}
        </Button>
      </div>

      {/* Per-recipient results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          {results.map((res, i) => (
            <div
              key={i}
              className="flex justify-between items-center bg-white/5 rounded-lg px-4 py-3 text-sm"
            >
              <span className="text-white/80 font-mono">{stellar.formatAddress(res.address, 4, 4)}</span>
              {res.status === 'ok' ? (
                <a
                  href={stellar.getExplorerLink(res.hash!, 'tx')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 hover:text-green-300"
                >
                  ✓ Sent — View →
                </a>
              ) : (
                <span className="text-red-400">✕ Failed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
