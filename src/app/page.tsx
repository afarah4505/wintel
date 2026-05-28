'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { isValidSolanaAddress } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';

const featureCards = [
  'Behavioral wallet insights',
  'Portfolio concentration signals',
  'Fast Solana-native analysis',
];

export default function HomePage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const { addRecentSearch } = useAppStore();

  const handleTrack = () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setError('Please enter a wallet address');
      return;
    }
    if (!isValidSolanaAddress(trimmed)) {
      setError('Invalid Solana address');
      return;
    }
    addRecentSearch(trimmed);
    router.push(`/wallet/${trimmed}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTrack();
  };

  return (
    <div className="relative overflow-hidden px-4 pb-16 pt-10 sm:pt-16">
      <div className="page-shell">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-surface/70 px-5 py-10 shadow-glass backdrop-blur-xl sm:px-8 sm:py-14 lg:px-12">
          <div className="orb hero-orb-cyan -right-24 top-4 h-64 w-64 opacity-70" />
          <div className="orb hero-orb-purple -left-24 bottom-4 h-72 w-72 opacity-60" />

          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-glow-sm">
              <Wallet className="h-8 w-8 text-accent" />
            </div>

            <p className="section-kicker">AI-powered wallet intelligence</p>
            <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-text sm:text-5xl lg:text-6xl" style={{ fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif' }}>
              Premium crypto intelligence for Solana wallets.
            </h1>
            <p className="section-subtitle mx-auto mt-5">
              Get fast behavioral summaries, portfolio context, and clean wallet signals without the noise of a raw block explorer.
            </p>

            <div className="mx-auto mt-10 max-w-3xl rounded-[1.75rem] border border-white/10 bg-background/55 p-3 shadow-card backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-3" />
                  <input
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setError('');
                    }}
                    onKeyDown={onKey}
                    placeholder="Paste a Solana wallet address"
                    className="input-primary border-white/10 bg-surface/70 py-3.5 pl-11 font-mono text-base"
                    spellCheck={false}
                  />
                </div>
                <button
                  onClick={handleTrack}
                  className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3.5"
                >
                  Analyze Wallet <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {error && <p className="mt-3 text-left text-sm text-red">{error}</p>}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {featureCards.map((feature) => (
                <span key={feature} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  {feature}
                </span>
              ))}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <div className="premium-card rounded-[1.5rem] p-4 text-left">
                <p className="metric-title">Signal Quality</p>
                <p className="metric-value mt-2">Fast</p>
                <p className="metric-detail mt-1">Lightweight analysis tuned for quick wallet scanning.</p>
              </div>
              <div className="premium-card rounded-[1.5rem] p-4 text-left">
                <p className="metric-title">Style</p>
                <p className="metric-value mt-2">Minimal</p>
                <p className="metric-detail mt-1">Focused cards, subtle glow, zero clutter.</p>
              </div>
              <div className="premium-card rounded-[1.5rem] p-4 text-left">
                <p className="metric-title">Trust</p>
                <p className="metric-value mt-2">Clear</p>
                <p className="metric-detail mt-1 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  Readable wallet intelligence built for fast decisions.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
