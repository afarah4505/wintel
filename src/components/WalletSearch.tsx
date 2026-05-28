'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Search, Sparkles, X, TrendingUp } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { isValidSolanaAddress, shortenAddress } from '@/lib/utils';

interface Props {
  onClose: () => void;
}

export function WalletSearch({ onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const { recentSearches, addRecentSearch, clearRecentSearches } = useAppStore();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSearch = (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    if (!isValidSolanaAddress(trimmed)) {
      setError('Invalid Solana address');
      return;
    }
    addRecentSearch(trimmed);
    router.push(`/wallet/${trimmed}`);
    onClose();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        className="fixed left-1/2 top-24 z-50 w-full max-w-2xl -translate-x-1/2 px-4"
      >
        <div className="premium-card overflow-hidden rounded-[1.75rem]">
          <div className="border-b border-white/8 bg-white/[0.03] px-5 py-4">
            <p className="section-kicker flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Quick wallet search
            </p>
            <p className="mt-2 text-sm text-text-2">Paste an address to jump directly into wallet intelligence.</p>
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
            <Search className="h-5 w-5 shrink-0 text-text-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError('');
              }}
              placeholder="Paste a Solana wallet address..."
              className="flex-1 border-0 bg-transparent text-base font-mono text-text outline-none placeholder:text-text-3"
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="rounded-full p-2 text-text-3 transition-colors hover:bg-white/5 hover:text-text">
                <X className="h-4 w-4" />
              </button>
            )}
            <button type="submit" className="btn-primary px-4 py-2.5 text-sm">
              Track
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {error && <p className="border-b border-white/8 bg-red/5 px-5 py-3 text-sm text-red">{error}</p>}

          {recentSearches.length > 0 ? (
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="section-kicker flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Recent searches
                </span>
                <button onClick={clearRecentSearches} className="text-xs text-text-3 transition-colors hover:text-text">
                  Clear all
                </button>
              </div>
              <div className="grid gap-2">
                {recentSearches.slice(0, 5).map((addr) => (
                  <button
                    key={addr}
                    onClick={() => handleSearch(addr)}
                    className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition-all duration-200 hover:border-accent/25 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <TrendingUp className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-mono text-sm text-text-2">{shortenAddress(addr, 6)}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-text-3" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-text-3">
              <Search className="mx-auto mb-3 h-8 w-8 opacity-30" />
              <p>Paste any Solana wallet address to start tracking</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
