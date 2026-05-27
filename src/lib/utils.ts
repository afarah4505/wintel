import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Number Formatting ────────────────────────────────────────────────────────
export function formatUsd(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 0.01 ? 6 : 2,
  }).format(value);
}

export function formatNumber(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatSolAmount(lamports: number): string {
  return `${(lamports / 1e9).toFixed(4)} SOL`;
}

// ─── Address Formatting ───────────────────────────────────────────────────────
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// ─── Date Formatting ──────────────────────────────────────────────────────────
export function timeAgo(date: string | number): string {
  const d = typeof date === 'number' ? new Date(date * 1000) : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatDate(date: string | number, fmt = 'MMM d, yyyy HH:mm'): string {
  const d = typeof date === 'number' ? new Date(date * 1000) : new Date(date);
  return format(d, fmt);
}

export function formatHoldTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export function getPnlColor(value: number): string {
  return value >= 0 ? 'text-accent' : 'text-red';
}

export function getPnlBg(value: number): string {
  return value >= 0 ? 'bg-accent/10 text-accent' : 'bg-red/10 text-red';
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getTokenLogoUrl(mint: string): string {
  return `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;
}

export function getDexScreenerUrl(pairAddress: string): string {
  return `https://dexscreener.com/solana/${pairAddress}`;
}
