'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, RefreshCw } from 'lucide-react';
import copy from 'copy-to-clipboard';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/appStore';
import { formatDate, formatUsd, isValidSolanaAddress, shortenAddress, timeAgo } from '@/lib/utils';
import { getClientId, trackRemoteWallet, untrackRemoteWallet } from '@/lib/watchlist';
import type { ApiResponse, WalletAnalysis } from '@/types';

interface Props {
  address: string;
}

function solscanAddressUrl(address: string) {
  return `https://solscan.io/account/${address}`;
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
    refetchInterval: false,
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

  const analysisCoverage =
    data && data.analyzedTransactions > 0
      ? `Recent activity from ${data.analyzedTransactions} transactions`
      : data?.lastTransactionAt
        ? 'Recent wallet activity available'
        : 'Data unavailable';

  const activityLevelLabel = data?.activityLevel || 'Data unavailable';
  const activityLevelDetail = data?.recentTradingActivity || 'Not enough recent activity';
  const walletInsights = data?.walletInsights ?? [];
  const behaviorSignals = data?.behaviorSignals ?? [];
  const activitySummary = data?.activitySummary || 'No activity summary available';

  const holdDurationLabel =
    data?.averageEstimatedHoldDurationHours == null
      ? 'N/A'
      : data.averageEstimatedHoldDurationHours >= 24
        ? `${(data.averageEstimatedHoldDurationHours / 24).toFixed(1)} days`
        : `${data.averageEstimatedHoldDurationHours.toFixed(1)} hours`;

  const riskClass =
    data?.riskLevel === 'High'
      ? 'text-red'
      : data?.riskLevel === 'Medium'
        ? 'text-amber-300'
        : 'text-accent';

  return (
    <div className="page-shell px-4 pb-16 pt-6 sm:pt-10">
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

      <section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <article className="stat-card rounded-[1.5rem]">
          <p className="metric-title">SOL Balance</p>
          <p className="metric-value mt-2">{isLoading ? '...' : `${(data?.solBalance || 0).toFixed(4)} SOL`}</p>
          <p className="metric-detail">Live wallet base balance</p>
        </article>
        <article className="stat-card rounded-[1.5rem]">
          <p className="metric-title">Token Holdings</p>
          <p className="metric-value mt-2">{isLoading ? '...' : data?.totalTokenHoldings ?? 0}</p>
          {!isLoading && <p className="metric-detail">Portfolio value: {formatUsd(data?.portfolioValueUsd || 0)}</p>}
        </article>
        <article className="stat-card rounded-[1.5rem]">
          <p className="metric-title">Portfolio Diversity</p>
          <p className="metric-value mt-2">
            {isLoading
              ? '...'
              : `${(data?.portfolioDiversity ?? 0).toFixed(1)} / 100`}
          </p>
          <p className="metric-detail mt-1">Concentration {(data?.portfolioConcentrationScore ?? 0).toFixed(1)} / 100</p>
        </article>
        <article className="stat-card rounded-[1.5rem]">
          <p className="metric-title">Last Active</p>
          <p className="metric-value mt-2 text-[1.25rem] sm:text-[1.4rem]">
            {isLoading
              ? '...'
              : data?.lastActiveAt
                ? `${formatDate(data.lastActiveAt)} (${timeAgo(data.lastActiveAt)})`
                : 'No recent activity'}
          </p>
          {!isLoading && <p className="metric-detail mt-1">{analysisCoverage}</p>}
        </article>
        <article className="stat-card rounded-[1.5rem]">
          <p className="metric-title">Activity Level</p>
          <p className="metric-value mt-2 text-[1.25rem] sm:text-[1.4rem]">{isLoading ? '...' : activityLevelLabel}</p>
          {!isLoading && <p className="metric-detail mt-1">{activityLevelDetail}</p>}
        </article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Wallet Insights</h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-text-3">Loading insights...</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {(walletInsights.length > 0 ? walletInsights : [{ label: 'Behavior still forming', detail: 'Not enough signal yet' }]).map((insight) => (
                  <span
                    key={insight.label}
                    className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
                  >
                    {insight.label}
                  </span>
                ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-text-2">
                {(walletInsights.length > 0 ? walletInsights : [{ label: 'Behavior still forming', detail: 'Not enough signal yet' }]).map((insight) => (
                  <li key={insight.label} className="rounded-lg border border-border px-3 py-2">
                    <span className="font-semibold text-text">{insight.label}</span>
                    <span className="text-text-3">: {insight.detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>

        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Activity Summary</h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-text-3">Loading summary...</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-text-2">{activitySummary}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Activity Level</p>
                  <p className="mt-1 font-semibold text-text">{activityLevelLabel}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Trading Style</p>
                  <p className="mt-1 font-semibold text-text">{data?.tradingStyle || 'Long-term holder'}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Estimated Hold</p>
                  <p className="mt-1 font-semibold text-text">{holdDurationLabel === 'N/A' ? 'Unavailable' : holdDurationLabel}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Risk</p>
                  <p className={`mt-1 font-semibold ${riskClass}`}>{data?.riskLevel || 'Low'}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-text-3">{activityLevelDetail}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Recent Tx</p>
                  <p className="mt-1 font-semibold text-text">{data?.analyzedTransactions ?? 0}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Frequency</p>
                  <p className="mt-1 font-semibold text-text">{(data?.tradingFrequency ?? 0).toFixed(1)} / day</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Last Active</p>
                  <p className="mt-1 font-semibold text-text">{data?.lastActiveAt ? timeAgo(data.lastActiveAt) : 'No recent activity'}</p>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">Concentration</p>
                  <p className="mt-1 font-semibold text-text">{(data?.portfolioConcentrationScore ?? 0).toFixed(0)} / 100</p>
                </div>
              </div>
            </>
          )}
        </article>

        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Behavior Signals</h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-text-3">Loading signals...</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {(behaviorSignals.length > 0 ? behaviorSignals : [{ label: 'No clear behavior signal', value: 'Waiting for more data' }]).map((signal) => (
                <div key={signal.label} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-text-3">{signal.label}</p>
                  <p className="mt-1 text-sm font-semibold text-text">{signal.value}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="mt-4">
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
      </section>
    </div>
  );
}
