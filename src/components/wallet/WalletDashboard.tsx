'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, RefreshCw } from 'lucide-react';
import copy from 'copy-to-clipboard';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/appStore';
import { formatDate, formatPercent, formatUsd, isValidSolanaAddress, shortenAddress, timeAgo } from '@/lib/utils';
import { getClientId, trackRemoteWallet, untrackRemoteWallet } from '@/lib/watchlist';
import type { ApiResponse, WalletAnalysis } from '@/types';

interface Props {
  address: string;
}

function solscanAddressUrl(address: string) {
  return `https://solscan.io/account/${address}`;
}

function solscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

function tokenLabel(name: string, symbol: string, mint: string): string {
  const trimmedName = name?.trim() || '';
  const trimmedSymbol = symbol?.trim() || '';

  if (trimmedName && trimmedSymbol) {
    if (trimmedName.toLowerCase() === trimmedSymbol.toLowerCase()) {
      return trimmedName;
    }
    return `${trimmedName} (${trimmedSymbol})`;
  }

  return trimmedName || trimmedSymbol || shortenAddress(mint);
}

export function WalletDashboard({ address }: Props) {
  const { isWatchlisted, addToWatchlist, removeFromWatchlist } = useAppStore();
  const [isWatchlistSaving, setIsWatchlistSaving] = useState(false);
  const isValid = isValidSolanaAddress(address);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<WalletAnalysis>({
    queryKey: ['wallet-analysis', address],
    queryFn: async () => {
      const response = await fetch(`/api/wallet/${address}`, { cache: 'no-store' });
      const payload = (await response.json()) as ApiResponse<WalletAnalysis>;
      if (!payload.success || !payload.data) {
        throw new Error(payload.error || 'Unable to load wallet analysis');
      }
      return payload.data;
    },
    enabled: isValid,
    refetchInterval: (query) => (query.state.data?.ageScanInProgress ? 3000 : false),
  });

  if (!isValid) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Invalid Wallet Address</h1>
        <p className="mt-2 text-text-3">Please enter a valid Solana wallet address.</p>
        <Link href="/" className="btn-secondary mt-6">Back to Search</Link>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Unable to Load Wallet</h1>
        <p className="mt-2 text-text-3">{error instanceof Error ? error.message : 'Please try again in a moment.'}</p>
        <button onClick={() => refetch()} className="btn-primary mt-6 px-6 py-2 text-sm">Retry</button>
      </div>
    );
  }

  const watchlisted = isWatchlisted(address);
  const walletAgeLabel =
    data?.walletAgeDays == null
      ? 'No detected activity'
      : data.walletAgeDays < 1
        ? '<1 day'
        : data.walletAgeDays >= 365
          ? `${(data.walletAgeDays / 365).toFixed(1)} yrs (${Math.floor(data.walletAgeDays)} days)`
          : `${Math.floor(data.walletAgeDays)} days`;

  const toggleWatchlist = async () => {
    if (isWatchlistSaving) return;
    setIsWatchlistSaving(true);

    const clientId = getClientId();

    try {
      if (watchlisted) {
        removeFromWatchlist(address);
        toast.success('Removed from watchlist');
        const ok = await untrackRemoteWallet(clientId, address);
        if (!ok) toast('Saved locally. Supabase sync unavailable.', { icon: 'ℹ️' });
        return;
      }

      addToWatchlist(address);
      toast.success('Added to watchlist');
      const ok = await trackRemoteWallet(clientId, address);
      if (!ok) toast('Saved locally. Supabase sync unavailable.', { icon: 'ℹ️' });
    } finally {
      setIsWatchlistSaving(false);
    }
  };

  const copyAddress = () => {
    copy(address);
    toast.success('Address copied');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-text sm:text-2xl">Wallet Analysis</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface-2 px-2 py-1 font-mono text-xs text-text-2 sm:text-sm">
                {shortenAddress(address, 8)}
              </code>
              <button onClick={copyAddress} className="btn-ghost px-2 py-1 text-xs">Copy</button>
              <a href={solscanAddressUrl(address)} target="_blank" rel="noreferrer" className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs">
                Solscan <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="btn-secondary px-3 py-2 text-sm" disabled={isFetching}>
              <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </button>
            <button
              onClick={toggleWatchlist}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isWatchlistSaving}
            >
              {watchlisted ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              {isWatchlistSaving ? 'Saving...' : watchlisted ? 'Tracking' : 'Track Wallet'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <article className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-3">SOL Balance</p>
          <p className="mt-1 text-lg font-semibold">{isLoading ? '...' : `${(data?.solBalance || 0).toFixed(4)} SOL`}</p>
        </article>
        <article className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-3">Portfolio Value</p>
          <p className="mt-1 text-lg font-semibold">{isLoading ? '...' : formatUsd(data?.portfolioValueUsd || 0)}</p>
        </article>
        <article className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-3">Estimated Wallet Age</p>
          <p className="mt-1 text-lg font-semibold">{isLoading ? '...' : walletAgeLabel}</p>
          {!isLoading && data?.firstTransactionAt && (
            <p className="mt-0.5 text-xs text-text-3">Approximate First Activity: {formatDate(data.firstTransactionAt)}</p>
          )}
          {!isLoading && data?.ageScanInProgress && (
            <p className="mt-0.5 text-xs text-amber-300">Scanning wallet history...</p>
          )}
        </article>
        <article className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-3">Estimated PnL</p>
          <p className="mt-1 text-lg font-semibold">{isLoading ? '...' : formatUsd(data?.estimatedPnlUsd || 0)}</p>
        </article>
        <article className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-3">Estimated Win Rate</p>
          <p className="mt-1 text-lg font-semibold">
            {isLoading ? '...' : data?.estimatedWinRate == null ? 'Insufficient data' : `${data.estimatedWinRate.toFixed(1)}%`}
          </p>
          {!isLoading && (
            <p className="mt-0.5 text-xs text-text-3">
              Closed trades: {data?.totalTrades ?? 0} | Wins: {data?.winningTrades ?? 0} | Losses: {data?.losingTrades ?? 0}
            </p>
          )}
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Timeline</h2>
        <div className="mt-3 grid gap-2 text-sm text-text-2 sm:grid-cols-2">
          <p>
            First transaction:{' '}
            {isLoading
              ? '...'
              : data?.firstTransactionAt
                ? `${formatDate(data.firstTransactionAt)} (${timeAgo(data.firstTransactionAt)})`
                : 'Not available'}
          </p>
          <p>
            Last transaction:{' '}
            {isLoading
              ? '...'
              : data?.lastTransactionAt
                ? `${formatDate(data.lastTransactionAt)} (${timeAgo(data.lastTransactionAt)})`
                : 'Not available'}
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Current Token Holdings</h2>
          <div className="mt-4 space-y-2">
            {isLoading && <p className="text-sm text-text-3">Loading holdings...</p>}
            {!isLoading && (data?.holdings.length || 0) === 0 && <p className="text-sm text-text-3">No non-zero SPL holdings found.</p>}
            {!isLoading && data?.holdings.map((holding) => (
              <div key={holding.mint} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{tokenLabel(holding.name, holding.symbol, holding.mint)}</p>
                  <p className="text-xs text-text-3">{holding.uiAmount.toFixed(4)} tokens</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-text">{formatUsd(holding.valueUsd)}</p>
                  <p className={holding.estimatedPnl24h >= 0 ? 'text-xs text-accent' : 'text-xs text-red'}>
                    {formatUsd(holding.estimatedPnl24h)} (24h est.)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Recent Transactions</h2>
          <div className="mt-4 space-y-2">
            {isLoading && <p className="text-sm text-text-3">Loading transactions...</p>}
            {!isLoading && (data?.recentTransactions.length || 0) === 0 && (
              <p className="text-sm text-text-3">No recent transactions found.</p>
            )}
            {!isLoading && data?.recentTransactions.map((tx) => (
              <a
                key={tx.signature}
                href={solscanTxUrl(tx.signature)}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-border px-3 py-2 hover:border-accent/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-text-2">{shortenAddress(tx.signature, 6)}</p>
                  <p className={tx.solChange >= 0 ? 'text-xs text-accent' : 'text-xs text-red'}>
                    {tx.solChange >= 0 ? '+' : ''}{tx.solChange.toFixed(4)} SOL
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-text-3">
                  <span>{timeAgo(tx.timestamp)}</span>
                  <span>{tx.status}</span>
                </div>
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Top Winners</h2>
          <div className="mt-3 space-y-2">
            {isLoading && <p className="text-sm text-text-3">Loading...</p>}
            {!isLoading && (data?.topWinners.length || 0) === 0 && <p className="text-sm text-text-3">No winners yet.</p>}
            {!isLoading && data?.topWinners.map((token) => (
              <div key={token.mint} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <p className="text-sm text-text">{tokenLabel(token.name, token.symbol, token.mint)}</p>
                <p className="text-sm text-accent">{formatUsd(token.estimatedPnl24h)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Top Losers</h2>
          <div className="mt-3 space-y-2">
            {isLoading && <p className="text-sm text-text-3">Loading...</p>}
            {!isLoading && (data?.topLosers.length || 0) === 0 && <p className="text-sm text-text-3">No losers yet.</p>}
            {!isLoading && data?.topLosers.map((token) => (
              <div key={token.mint} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <p className="text-sm text-text">{tokenLabel(token.name, token.symbol, token.mint)}</p>
                <p className="text-sm text-red">{formatUsd(token.estimatedPnl24h)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
