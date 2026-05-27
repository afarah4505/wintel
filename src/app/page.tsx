'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, Wallet } from 'lucide-react';
import { isValidSolanaAddress } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';

export default function HomePage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const { addRecentSearch } = useAppStore();

  const handleTrack = () => {
    const trimmed = address.trim();
    if (!trimmed) { setError('Please enter a wallet address'); return; }
    if (!isValidSolanaAddress(trimmed)) { setError('Invalid Solana address'); return; }
    addRecentSearch(trimmed);
    router.push(`/wallet/${trimmed}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTrack();
  };

  return (
    <div className="min-h-screen px-4">
      <section className="mx-auto max-w-4xl pt-16 pb-20 sm:pt-24">
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <Wallet className="h-7 w-7 text-accent" />
        </div>

        <h1 className="text-center text-4xl font-bold tracking-tight text-text sm:text-5xl">
          Solana Wallet Analyzer
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-text-2">
          Enter any wallet address to get a clean snapshot: balance, wallet age, holdings, estimated PnL,
          win rate, top winners and losers, and recent transactions.
        </p>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-3" />
              <input
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError('');
                }}
                onKeyDown={onKey}
                placeholder="Paste a Solana wallet address"
                className="input-primary w-full py-3 pl-10 font-mono text-base"
                spellCheck={false}
              />
            </div>
            <button
              onClick={handleTrack}
              className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3"
            >
              Analyze <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-red">{error}</p>}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 text-sm text-text-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">Public Solana RPC + Solana Web3.js</div>
          <div className="rounded-xl border border-border bg-surface p-4">DexScreener free price data</div>
          <div className="rounded-xl border border-border bg-surface p-4">Track wallets in your watchlist</div>
        </div>
      </section>
    </div>
  );
}
