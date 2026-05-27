'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, X, Clock, ArrowRight, TrendingUp } from 'lucide-react';
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
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
      >
        <div className="glass-card-bright overflow-hidden">
          {/* Search input */}
          <form onSubmit={onSubmit} className="flex items-center gap-3 p-4 border-b border-border">
            <Search className="w-5 h-5 text-text-3 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(''); }}
              placeholder="Paste a Solana wallet address..."
              className="flex-1 bg-transparent text-text placeholder-text-3 outline-none text-base font-mono"
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-text-3 hover:text-text">
                <X className="w-4 h-4" />
              </button>
            )}
            <button type="submit" className="btn-primary py-1.5 px-3 text-sm">
              Track
            </button>
          </form>

          {error && (
            <p className="text-red text-sm px-4 py-2 bg-red/5">{error}</p>
          )}

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-3 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Recent
                </span>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-text-3 hover:text-text transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {recentSearches.slice(0, 5).map((addr) => (
                  <button
                    key={addr}
                    onClick={() => handleSearch(addr)}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-surface-3 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-3 h-3 text-accent" />
                      </div>
                      <span className="font-mono text-sm text-text-2 group-hover:text-text">
                        {shortenAddress(addr, 6)}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {recentSearches.length === 0 && (
            <div className="p-6 text-center text-text-3 text-sm">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Paste any Solana wallet address to start tracking</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
