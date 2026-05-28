import { NextRequest, NextResponse } from 'next/server';
import { getSolanaConnection, getSolBalance, getTokenBalances } from '@/lib/helius';
import { PublicKey } from '@solana/web3.js';
import { getTokenPairs } from '@/lib/dexscreener';
import { isValidSolanaAddress } from '@/lib/utils';
import type {
  ActivityLevel,
  RiskLevel,
  TokenHolding,
  Trade,
  TradingStyle,
  WalletActivityFeedItem,
  WalletAnalysis,
} from '@/types';

const MAX_TX_COUNT = 10;
const FAST_SIGNATURE_FETCH_COUNT = 120;
const DEEP_SIGNATURE_FETCH_COUNT = 500;
const ANALYTICS_INITIAL_SIGNATURE_FETCH_COUNT = 500;
const ANALYTICS_MIN_TRANSACTIONS = 500;
const ANALYTICS_MAX_TRANSACTIONS = 5000;
const ANALYTICS_WINDOW_DAYS = 45;
const ANALYTICS_FOREGROUND_TX_FETCH_LIMIT = 120;
const ANALYTICS_BACKGROUND_TX_FETCH_LIMIT = 300;
const ANALYTICS_BACKGROUND_PAGES_PER_RUN = 2;
const ANALYTICS_TX_BATCH_SIZE = 80;
const ANALYTICS_TX_TIMEOUT_MS = 2200;
const ANALYTICS_CACHE_TTL_MS = 120000;
const FAST_ANALYTICS_TIMEOUT_MS = 2500;
const FEED_SIGNATURE_FETCH_LIMIT = 30;
const FEED_BUILD_TIMEOUT_MS = 2500;
const FEED_DUST_NOTIONAL_USD = 1.5;
const FEED_GROUP_WINDOW_SECONDS = 20 * 60;
const MIN_CLOSED_TRADE_NOTIONAL_USD = 3;
const MIN_TOKEN_DELTA = 0.000001;
const MAX_NON_BASE_TOKEN_LEGS = 4;
const LARGE_TRANSACTION_USD = 500;
const RECENT_ACTIVITY_WINDOW_DAYS = 7;
const RECENT_ACTIVITY_FEED_LIMIT = 14;
const MAX_HOLDINGS = 10;
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const metadataCache = new Map<string, Promise<{ name: string; symbol: string } | null>>();

type SignatureInfo = Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getSignaturesForAddress']>>[number];
type ParsedWalletTx = NonNullable<Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getParsedTransaction']>>>;

type AnalyticsTxSummary = {
  signature: string;
  timestamp: number;
  solChange: number;
  feeSol: number;
  status: 'confirmed' | 'failed';
  tokenDeltas: Array<[string, number]>;
};

type ActivityFeedDraft = {
  type: WalletActivityFeedItem['type'];
  signature: string;
  timestamp: number;
  mint: string;
  notionalUsd: number;
};

type WalletAnalyticsSnapshot = {
  latestSignature: string | null;
  analyzedTransactions: number;
  analyzedDays: number;
  uniqueTokensTraded: number;
  activityLevel: ActivityLevel;
  tradingFrequency: number;
  recentTradingActivity: string;
  tradingStyle: TradingStyle;
  averageEstimatedHoldDurationHours: number | null;
  riskLevel: RiskLevel;
  recentActivityFeed: ActivityFeedDraft[];
  recentTrades: Trade[];
  cachedAt: number;
};

type WalletAnalyticsCacheEntry = {
  latestSignature: string | null;
  signatures: SignatureInfo[];
  scanBeforeSignature: string | null;
  scanComplete: boolean;
  isScanning: boolean;
  txSummaries: Map<string, AnalyticsTxSummary>;
  snapshot: WalletAnalyticsSnapshot;
  updatedAt: number;
};

const walletAnalyticsCache = new Map<string, WalletAnalyticsCacheEntry>();
const activeAnalyticsScans = new Set<string>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  try {
    return await Promise.race([work, wait(ms).then(() => fallback)]);
  } catch {
    return fallback;
  }
}

async function rpcWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await wait(300 * (attempt + 1));
    }
  }

  throw lastError;
}

function parseMetadataString(data: Buffer, offset: number): { value: string; nextOffset: number } {
  if (offset + 4 > data.length) return { value: '', nextOffset: data.length };
  const length = data.readUInt32LE(offset);
  const start = offset + 4;
  const end = Math.min(start + length, data.length);
  const value = data
    .slice(start, end)
    .toString('utf8')
    .replace(/\0/g, '')
    .trim();
  return { value, nextOffset: end };
}

function parseMetaplexMetadata(data: Buffer): { name: string; symbol: string } | null {
  try {
    // key (1) + updateAuthority (32) + mint (32)
    let offset = 65;
    const nameRes = parseMetadataString(data, offset);
    offset = nameRes.nextOffset;
    const symbolRes = parseMetadataString(data, offset);

    return {
      name: nameRes.value,
      symbol: symbolRes.value,
    };
  } catch {
    return null;
  }
}

async function getOnchainTokenMetadata(mint: string): Promise<{ name: string; symbol: string } | null> {
  if (metadataCache.has(mint)) {
    return metadataCache.get(mint)!;
  }

  const request = (async () => {
    try {
      const conn = getSolanaConnection();
      const mintKey = new PublicKey(mint);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );

      const accountInfo = await conn.getAccountInfo(pda);
      if (!accountInfo?.data) return null;
      return parseMetaplexMetadata(Buffer.from(accountInfo.data));
    } catch {
      return null;
    }
  })();

  metadataCache.set(mint, request);
  return request;
}

function getPairTokenMeta(
  pair: Awaited<ReturnType<typeof getTokenPairs>>[number],
  mint: string
): { symbol?: string; name?: string } {
  if (pair.baseToken?.address === mint) {
    return {
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
    };
  }

  if (pair.quoteToken?.address === mint) {
    return {
      symbol: pair.quoteToken?.symbol,
      name: pair.quoteToken?.name,
    };
  }

  return {
    symbol: pair.baseToken?.symbol,
    name: pair.baseToken?.name,
  };
}

async function getSolPriceUsd(): Promise<number> {
  try {
    const pairs = await getTokenPairs(WRAPPED_SOL_MINT);
    const top = pairs[0];
    return top?.priceUsd ? Number(top.priceUsd) : 0;
  } catch {
    return 0;
  }
}

async function mapHoldings(address: string): Promise<TokenHolding[]> {
  const accounts = await getTokenBalances(address);

  const nonZeroAccounts = accounts.value
    .filter((entry) => {
      const token = entry.account.data.parsed?.info?.tokenAmount;
      return Number(token?.uiAmount ?? 0) > 0;
    })
    .slice(0, MAX_HOLDINGS);

  const holdings = await Promise.all(
    nonZeroAccounts.map(async (entry) => {
      const info = entry.account.data.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      const mint = String(info?.mint ?? '');
      const uiAmount = Number(tokenAmount?.uiAmount ?? 0);
      const decimals = Number(tokenAmount?.decimals ?? 0);

      let priceUsd = 0;
      let priceChange24h = 0;
      let symbol = '';
      let name = '';

      try {
        const pairs = await getTokenPairs(mint);
        if (pairs.length > 0) {
          const matchingPairs = pairs.filter(
            (pair) => pair.baseToken?.address === mint || pair.quoteToken?.address === mint
          );
          const pairPool = matchingPairs.length > 0 ? matchingPairs : pairs;
          const pair = pairPool.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
          const meta = getPairTokenMeta(pair, mint);

          priceUsd = Number(pair.priceUsd || 0);
          priceChange24h = Number(pair.priceChange?.h24 || 0);
          symbol = meta.symbol || symbol;
          name = meta.name || name;
        }
      } catch {
        // Keep zero-price fallback when market data is unavailable.
      }

      if (!name || !symbol) {
        const onchainMeta = await getOnchainTokenMetadata(mint);
        if (onchainMeta) {
          name = name || onchainMeta.name;
          symbol = symbol || onchainMeta.symbol;
        }
      }

      const valueUsd = uiAmount * priceUsd;
      const estimatedPnl24h = valueUsd * (priceChange24h / 100);

      return {
        mint,
        symbol,
        name,
        uiAmount,
        decimals,
        priceUsd,
        valueUsd,
        priceChange24h,
        estimatedPnl24h,
      } satisfies TokenHolding;
    })
  );

  return holdings.sort((a, b) => b.valueUsd - a.valueUsd);
}

type ClosedTradeAccumulator = {
  openQty: number;
  openCostUsd: number;
  openTimestampWeighted: number;
};

function getOwnerSolDelta(tx: ParsedWalletTx | null, address: string): { solChange: number; feeSol: number } {
  if (!tx || !tx.transaction) return { solChange: 0, feeSol: 0 };

  const message = (tx.transaction as unknown as { message?: unknown })?.message as
    | { accountKeys?: Array<string | { pubkey: { toBase58: () => string } }>; staticAccountKeys?: Array<{ toBase58: () => string }> }
    | undefined;

  const keyToBase58 = (k: unknown): string => {
    if (typeof k === 'string') return k;
    if (!k || typeof k !== 'object') return '';
    const obj = k as { pubkey?: unknown; toBase58?: () => string };
    if (typeof obj.toBase58 === 'function') return obj.toBase58();
    if (typeof obj.pubkey === 'string') return obj.pubkey;
    if (obj.pubkey && typeof obj.pubkey === 'object' && typeof (obj.pubkey as { toBase58?: () => string }).toBase58 === 'function') {
      return (obj.pubkey as { toBase58: () => string }).toBase58();
    }
    return '';
  };

  const accountKeys = Array.isArray(message?.accountKeys)
    ? message.accountKeys.map((k) => keyToBase58(k)).filter(Boolean)
    : Array.isArray(message?.staticAccountKeys)
      ? message.staticAccountKeys.map((k) => keyToBase58(k)).filter(Boolean)
      : [];

  const ownerIndex = accountKeys.findIndex((k) => k === address);
  const preBalance = ownerIndex >= 0 ? Number(tx.meta?.preBalances?.[ownerIndex] ?? 0) / 1e9 : 0;
  const postBalance = ownerIndex >= 0 ? Number(tx.meta?.postBalances?.[ownerIndex] ?? 0) / 1e9 : 0;
  const feeSol = Number(tx.meta?.fee ?? 0) / 1e9;
  return { solChange: postBalance - preBalance, feeSol };
}

function getOwnerTokenDeltas(tx: ParsedWalletTx | null, address: string): Map<string, number> {
  const deltas = new Map<string, number>();
  if (!tx) return deltas;

  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];

  const addDelta = (mint: string, value: number) => {
    if (!mint || !Number.isFinite(value)) return;
    deltas.set(mint, (deltas.get(mint) ?? 0) + value);
  };

  for (const bal of post) {
    if (bal.owner !== address) continue;
    const mint = bal.mint;
    const postAmt = Number(bal.uiTokenAmount?.uiAmountString ?? bal.uiTokenAmount?.uiAmount ?? 0);
    const preBal = pre.find((p) => p.owner === address && p.accountIndex === bal.accountIndex);
    const preAmt = Number(preBal?.uiTokenAmount?.uiAmountString ?? preBal?.uiTokenAmount?.uiAmount ?? 0);
    addDelta(mint, postAmt - preAmt);
  }

  for (const bal of pre) {
    if (bal.owner !== address) continue;
    const hasPost = post.some((p) => p.owner === address && p.accountIndex === bal.accountIndex);
    if (hasPost) continue;
    const preAmt = Number(bal.uiTokenAmount?.uiAmountString ?? bal.uiTokenAmount?.uiAmount ?? 0);
    addDelta(bal.mint, -preAmt);
  }

  return deltas;
}

function mergeSignatures(existing: SignatureInfo[], incoming: SignatureInfo[]): SignatureInfo[] {
  const merged = new Map<string, SignatureInfo>();

  for (const sig of [...incoming, ...existing]) {
    if (!sig?.signature) continue;
    merged.set(sig.signature, sig);
  }

  return [...merged.values()]
    .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
    .slice(0, ANALYTICS_MAX_TRANSACTIONS);
}

function selectAnalysisWindow(signatures: SignatureInfo[]): SignatureInfo[] {
  if (signatures.length === 0) return [];

  const cutoffTs = Math.floor(Date.now() / 1000) - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60;
  const selected: SignatureInfo[] = [];

  for (const sig of signatures) {
    selected.push(sig);
    if (selected.length >= ANALYTICS_MAX_TRANSACTIONS) break;

    const reachedMinCount = selected.length >= ANALYTICS_MIN_TRANSACTIONS;
    const reachedCutoff = (sig.blockTime ?? Number.MAX_SAFE_INTEGER) <= cutoffTs;
    if (reachedMinCount && reachedCutoff) break;
  }

  return selected;
}

function shouldExpandAnalysisWindow(signatures: SignatureInfo[]): boolean {
  if (signatures.length >= ANALYTICS_MAX_TRANSACTIONS) return false;
  const selected = selectAnalysisWindow(signatures);
  if (selected.length < ANALYTICS_MIN_TRANSACTIONS) return true;
  const oldest = selected[selected.length - 1];
  if (!oldest) return false;

  const cutoffTs = Math.floor(Date.now() / 1000) - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60;
  return (oldest.blockTime ?? Number.MAX_SAFE_INTEGER) > cutoffTs;
}

function summarizeParsedTransaction(tx: ParsedWalletTx, address: string): AnalyticsTxSummary {
  const signature = tx.transaction.signatures[0] ?? '';
  const timestamp = tx.blockTime ?? 0;
  const { solChange, feeSol } = getOwnerSolDelta(tx, address);
  const tokenDeltas = [...getOwnerTokenDeltas(tx, address).entries()];

  return {
    signature,
    timestamp,
    solChange,
    feeSol,
    status: tx.meta?.err ? 'failed' : 'confirmed',
    tokenDeltas,
  };
}

async function fetchTransactionsForAnalytics(
  conn: ReturnType<typeof getSolanaConnection>,
  signatures: string[],
  address: string
): Promise<AnalyticsTxSummary[]> {
  const out: AnalyticsTxSummary[] = [];

  for (let i = 0; i < signatures.length; i += ANALYTICS_TX_BATCH_SIZE) {
    const chunk = signatures.slice(i, i + ANALYTICS_TX_BATCH_SIZE);
    const txs = await withTimeout(
      rpcWithRetry(() => conn.getParsedTransactions(chunk, { maxSupportedTransactionVersion: 0 }), 1),
      ANALYTICS_TX_TIMEOUT_MS,
      [] as Awaited<ReturnType<typeof conn.getParsedTransactions>>
    );

    for (const tx of txs ?? []) {
      if (!tx) continue;
      out.push(summarizeParsedTransaction(tx, address));
    }
  }

  return out;
}

function computeAnalyticsSnapshot(
  latestSignature: string | null,
  selectedSignatures: SignatureInfo[],
  txSummaries: Map<string, AnalyticsTxSummary>,
  solPriceUsd: number
): WalletAnalyticsSnapshot {
  const tokenBooks = new Map<string, ClosedTradeAccumulator>();
  const tradedMints = new Set<string>();
  const feed: ActivityFeedDraft[] = [];
  const recentlySeenMints = new Set<string>();
  const selectedSummaries = selectedSignatures
    .map((sig) => txSummaries.get(sig.signature))
    .filter((entry): entry is AnalyticsTxSummary => Boolean(entry));

  const byTimeAsc = [...selectedSummaries].sort((a, b) => a.timestamp - b.timestamp);
  const recentTrades: Trade[] = selectedSummaries
    .map((tx) => ({
      signature: tx.signature,
      timestamp: tx.timestamp,
      solChange: tx.solChange,
      feeSol: tx.feeSol,
      valueUsd: tx.solChange * solPriceUsd,
      status: tx.status,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_TX_COUNT);

  let holdDurationSumHours = 0;
  let holdDurationSamples = 0;
  let confirmedTradingTxs = 0;
  let recentWindowParsedTxs = 0;

  const nowSec = Math.floor(Date.now() / 1000);
  const recentCutoff = nowSec - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60;
  const recentWindowSignatureTxs = selectedSignatures.filter(
    (sig) => (sig.blockTime ?? 0) >= recentCutoff
  ).length;

  const pushFeed = (event: ActivityFeedDraft) => {
    if (event.notionalUsd <= 0) return;
    feed.push(event);
  };

  for (const tx of byTimeAsc) {
    if (tx.status === 'failed') continue;
    confirmedTradingTxs += 1;
    if (tx.timestamp >= recentCutoff) recentWindowParsedTxs += 1;

    const deltas = new Map(
      tx.tokenDeltas.filter(([, delta]) => Math.abs(delta) >= MIN_TOKEN_DELTA)
    );
    if (deltas.size === 0) continue;

    const nonBaseLegs = [...deltas.entries()].filter(
      ([mint]) => mint !== USDC_MINT && mint !== WRAPPED_SOL_MINT
    );
    if (nonBaseLegs.length === 0 || nonBaseLegs.length > MAX_NON_BASE_TOKEN_LEGS) {
      continue;
    }

    const stableDelta = deltas.get(USDC_MINT) ?? 0;
    const effectiveSolDelta = tx.solChange + tx.feeSol;
    const stableSpendUsd = stableDelta < 0 ? -stableDelta : 0;
    const stableReceiveUsd = stableDelta > 0 ? stableDelta : 0;
    const solSpendUsd = effectiveSolDelta < 0 ? -effectiveSolDelta * solPriceUsd : 0;
    const solReceiveUsd = effectiveSolDelta > 0 ? effectiveSolDelta * solPriceUsd : 0;

    const buyNotionalUsd = stableSpendUsd > 0 ? stableSpendUsd : solSpendUsd;
    const sellNotionalUsd = stableReceiveUsd > 0 ? stableReceiveUsd : solReceiveUsd;

    // Ignore non-trade activity that does not have a SOL/USDC quote leg.
    if (buyNotionalUsd <= 0 && sellNotionalUsd <= 0) {
      continue;
    }

    const buyLegs = nonBaseLegs.filter(([, delta]) => delta > 0);
    const sellLegs = nonBaseLegs.filter(([, delta]) => delta < 0);

    for (const [mint] of nonBaseLegs) {
      tradedMints.add(mint);
      if (!recentlySeenMints.has(mint)) {
        recentlySeenMints.add(mint);
        pushFeed({
          type: 'new-token',
          signature: tx.signature,
          timestamp: tx.timestamp,
          mint,
          notionalUsd: Math.max(buyNotionalUsd, sellNotionalUsd),
        });
      }
    }

    if (Math.max(buyNotionalUsd, sellNotionalUsd) >= LARGE_TRANSACTION_USD) {
      const dominantMint = nonBaseLegs[0]?.[0] ?? WRAPPED_SOL_MINT;
      pushFeed({
        type: 'large',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint: dominantMint,
        notionalUsd: Math.max(buyNotionalUsd, sellNotionalUsd),
      });
    }

    const totalBuyQty = buyLegs.reduce((sum, [, qty]) => sum + qty, 0);
    for (const [mint, qty] of buyLegs) {
      const alloc = totalBuyQty > 0 ? buyNotionalUsd * (qty / totalBuyQty) : 0;
      const book = tokenBooks.get(mint) ?? { openQty: 0, openCostUsd: 0, openTimestampWeighted: 0 };
      book.openQty += qty;
      book.openCostUsd += alloc;
      book.openTimestampWeighted += qty * tx.timestamp;
      tokenBooks.set(mint, book);

      pushFeed({
        type: 'buy',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint,
        notionalUsd: alloc,
      });
    }

    const totalSellQty = sellLegs.reduce((sum, [, qty]) => sum + Math.abs(qty), 0);
    for (const [mint, negQty] of sellLegs) {
      const qty = Math.abs(negQty);
      const book = tokenBooks.get(mint);
      if (!book || book.openQty <= 0 || qty <= 0) continue;

      const qtyClosed = Math.min(book.openQty, qty);
      const buyValueUsd = book.openCostUsd * (qtyClosed / book.openQty);
      const sellValueUsd = totalSellQty > 0 ? sellNotionalUsd * (qtyClosed / totalSellQty) : 0;

      const avgOpenTs = book.openQty > 0 ? book.openTimestampWeighted / book.openQty : tx.timestamp;
      const holdHours = Math.max((tx.timestamp - avgOpenTs) / 3600, 0);

      book.openQty -= qtyClosed;
      book.openCostUsd -= buyValueUsd;
      book.openTimestampWeighted -= avgOpenTs * qtyClosed;
      tokenBooks.set(mint, book);

      if (buyValueUsd < MIN_CLOSED_TRADE_NOTIONAL_USD && sellValueUsd < MIN_CLOSED_TRADE_NOTIONAL_USD) {
        continue;
      }

      holdDurationSumHours += holdHours;
      holdDurationSamples += 1;
      pushFeed({
        type: 'sell',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint,
        notionalUsd: sellValueUsd,
      });
    }
  }

  const newest = selectedSignatures[0]?.blockTime ?? null;
  const oldest = selectedSignatures[selectedSignatures.length - 1]?.blockTime ?? null;
  const analyzedDays = newest && oldest ? Math.max((newest - oldest) / (24 * 60 * 60), 0) : 0;
  const effectiveDays = Math.max(analyzedDays, 1);
  const tradingFrequency = confirmedTradingTxs / effectiveDays;

  const averageEstimatedHoldDurationHours = holdDurationSamples > 0 ? holdDurationSumHours / holdDurationSamples : null;

  let activityLevel: ActivityLevel = 'Low';
  if (tradingFrequency >= 20) activityLevel = 'Very High';
  else if (tradingFrequency >= 8) activityLevel = 'High';
  else if (tradingFrequency >= 2.5) activityLevel = 'Medium';

  const shortHold = averageEstimatedHoldDurationHours != null && averageEstimatedHoldDurationHours < 8;
  const midHold = averageEstimatedHoldDurationHours != null && averageEstimatedHoldDurationHours >= 8 && averageEstimatedHoldDurationHours < 96;

  let tradingStyle: TradingStyle = 'Long-term holder';
  if (tradingFrequency >= 20) tradingStyle = 'High-frequency trader';
  else if (shortHold && tradedMints.size >= 8) tradingStyle = 'Meme coin scalper';
  else if (midHold) tradingStyle = 'Swing trader';

  let riskLevel: RiskLevel = 'Low';
  if (tradingFrequency >= 12 || (shortHold && tradedMints.size >= 10)) riskLevel = 'High';
  else if (tradingFrequency >= 4 || tradedMints.size >= 6) riskLevel = 'Medium';

  const recentWindowTxs = Math.max(recentWindowParsedTxs, recentWindowSignatureTxs);
  const recentTradingActivity =
    recentWindowTxs === 0
      ? 'Dormant in the last 7 days'
      : `${recentWindowTxs} analyzed transactions in the last 7 days`;

  const recentActivityFeed = [...feed]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, RECENT_ACTIVITY_FEED_LIMIT);

  return {
    latestSignature,
    analyzedTransactions: selectedSummaries.length,
    analyzedDays,
    uniqueTokensTraded: tradedMints.size,
    activityLevel,
    tradingFrequency,
    recentTradingActivity,
    tradingStyle,
    averageEstimatedHoldDurationHours,
    riskLevel,
    recentActivityFeed,
    recentTrades,
    cachedAt: Date.now(),
  };
}

function createEmptyAnalyticsEntry(latestSignature: string | null): WalletAnalyticsCacheEntry {
  return {
    latestSignature,
    signatures: [],
    scanBeforeSignature: null,
    scanComplete: false,
    isScanning: false,
    txSummaries: new Map<string, AnalyticsTxSummary>(),
    snapshot: {
      latestSignature,
      analyzedTransactions: 0,
      analyzedDays: 0,
      uniqueTokensTraded: 0,
      activityLevel: 'Low',
      tradingFrequency: 0,
      recentTradingActivity: 'Dormant in the last 7 days',
      tradingStyle: 'Long-term holder',
      averageEstimatedHoldDurationHours: null,
      riskLevel: 'Low',
      recentActivityFeed: [],
      recentTrades: [],
      cachedAt: 0,
    },
    updatedAt: Date.now(),
  };
}

async function runBackgroundAnalyticsScan(
  address: string,
  conn: ReturnType<typeof getSolanaConnection>,
  pubkey: PublicKey,
  solPriceUsd: number
): Promise<void> {
  if (activeAnalyticsScans.has(address)) return;

  const entry = walletAnalyticsCache.get(address);
  if (!entry) return;

  activeAnalyticsScans.add(address);
  entry.isScanning = true;

  try {
    for (let page = 0; page < ANALYTICS_BACKGROUND_PAGES_PER_RUN; page += 1) {
      const selected = selectAnalysisWindow(entry.signatures);
      const missing = selected.filter((sig) => !entry.txSummaries.has(sig.signature));

      if (missing.length > 0) {
        const fetched = await fetchTransactionsForAnalytics(
          conn,
          missing.slice(0, ANALYTICS_BACKGROUND_TX_FETCH_LIMIT).map((sig) => sig.signature),
          address
        );
        for (const summary of fetched) {
          entry.txSummaries.set(summary.signature, summary);
        }
      }

      const needsMoreWindow = shouldExpandAnalysisWindow(entry.signatures);
      if (!needsMoreWindow || !entry.scanBeforeSignature) {
        entry.scanComplete = !needsMoreWindow;
        break;
      }

      const older = await withTimeout(
        rpcWithRetry(
          () =>
            conn.getSignaturesForAddress(pubkey, {
              limit: DEEP_SIGNATURE_FETCH_COUNT,
              before: entry.scanBeforeSignature ?? undefined,
            }),
          1
        ),
        3500,
        [] as SignatureInfo[]
      );

      if (older.length === 0) {
        entry.scanComplete = true;
        break;
      }

      entry.signatures = mergeSignatures(entry.signatures, older);
      entry.scanBeforeSignature = older[older.length - 1]?.signature ?? null;

      if (older.length < DEEP_SIGNATURE_FETCH_COUNT || entry.signatures.length >= ANALYTICS_MAX_TRANSACTIONS) {
        entry.scanComplete = true;
        break;
      }
    }

    const selected = selectAnalysisWindow(entry.signatures);
    entry.snapshot = computeAnalyticsSnapshot(entry.latestSignature, selected, entry.txSummaries, solPriceUsd);
    entry.updatedAt = Date.now();
  } catch {
    // Background analytics failures are non-fatal; keep the latest good snapshot.
  } finally {
    const cache = walletAnalyticsCache.get(address);
    if (cache) {
      cache.isScanning = false;
    }
    activeAnalyticsScans.delete(address);
  }
}

async function computeWalletAnalytics(
  conn: ReturnType<typeof getSolanaConnection>,
  pubkey: PublicKey,
  address: string,
  solPriceUsd: number,
  baseSignatures: SignatureInfo[]
): Promise<WalletAnalyticsSnapshot> {
  const seedLatestSignature = baseSignatures[0]?.signature ?? null;
  const now = Date.now();
  const existing = walletAnalyticsCache.get(address);

  let entry = existing ?? createEmptyAnalyticsEntry(seedLatestSignature);
  if (!existing) walletAnalyticsCache.set(address, entry);

  if (entry.latestSignature !== seedLatestSignature) {
    entry.latestSignature = seedLatestSignature;
  }

  entry.signatures = mergeSignatures(entry.signatures, baseSignatures);
  entry.scanBeforeSignature = entry.signatures[entry.signatures.length - 1]?.signature ?? null;

  const selected = selectAnalysisWindow(entry.signatures);
  const missing = selected.filter((sig) => !entry.txSummaries.has(sig.signature));
  if (missing.length > 0) {
    const fetched = await fetchTransactionsForAnalytics(
      conn,
      missing.slice(0, ANALYTICS_FOREGROUND_TX_FETCH_LIMIT).map((sig) => sig.signature),
      address
    );
    for (const summary of fetched) {
      entry.txSummaries.set(summary.signature, summary);
    }
  }

  entry.snapshot = computeAnalyticsSnapshot(entry.latestSignature, selected, entry.txSummaries, solPriceUsd);
  entry.updatedAt = now;

  const hasMissingInWindow = selected.some((sig) => !entry.txSummaries.has(sig.signature));
  const needsMoreWindow = shouldExpandAnalysisWindow(entry.signatures);
  const cacheFresh = now - entry.snapshot.cachedAt < ANALYTICS_CACHE_TTL_MS;

  if ((!cacheFresh || hasMissingInWindow || needsMoreWindow) && !entry.isScanning) {
    void runBackgroundAnalyticsScan(address, conn, pubkey, solPriceUsd);
  }

  return entry.snapshot;
}

function fallbackTradesFromSignatures(
  signatures: Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getSignaturesForAddress']>>
): Trade[] {
  return signatures.slice(0, MAX_TX_COUNT).map((sig) => ({
    signature: sig.signature,
    timestamp: sig.blockTime ?? 0,
    solChange: 0,
    feeSol: 0,
    valueUsd: 0,
    status: sig.err ? 'failed' : 'confirmed',
  }));
}

function shortMint(mint: string): string {
  if (!mint) return 'Unknown';
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function normalizeMetaValue(value: string | undefined): string {
  return (value || '').trim();
}

function resolveMintMeta(
  mint: string,
  holdingMeta: Map<string, { symbol: string; name: string }>
): { symbol: string; name: string } {
  if (mint === WRAPPED_SOL_MINT) {
    return { symbol: 'SOL', name: 'Solana' };
  }

  const fromHolding = holdingMeta.get(mint);
  const symbol = normalizeMetaValue(fromHolding?.symbol) || shortMint(mint);
  const name = normalizeMetaValue(fromHolding?.name) || symbol;
  return { symbol, name };
}

function compactBehaviorFeed(items: WalletActivityFeedItem[]): WalletActivityFeedItem[] {
  const grouped: WalletActivityFeedItem[] = [];

  for (const item of items) {
    const prev = grouped[grouped.length - 1];
    const canGroup =
      prev &&
      prev.type === item.type &&
      prev.mint === item.mint &&
      Math.abs(prev.timestamp - item.timestamp) <= FEED_GROUP_WINDOW_SECONDS &&
      prev.notionalUsd < FEED_DUST_NOTIONAL_USD &&
      item.notionalUsd < FEED_DUST_NOTIONAL_USD;

    if (!canGroup || !prev) {
      grouped.push(item);
      continue;
    }

    prev.notionalUsd += item.notionalUsd;
    prev.actionLabel = item.type === 'buy' ? `Increased holdings: ${item.tokenSymbol}` : `Reduced holdings: ${item.tokenSymbol}`;
    prev.actionDetail = 'Grouped multiple small actions';
    if (item.timestamp > prev.timestamp) {
      prev.timestamp = item.timestamp;
      prev.signature = item.signature;
    }
  }

  return grouped;
}

async function buildRecentBehaviorFeed(
  conn: ReturnType<typeof getSolanaConnection>,
  address: string,
  signatures: SignatureInfo[],
  holdings: TokenHolding[],
  solPriceUsd: number
): Promise<WalletActivityFeedItem[]> {
  const target = signatures
    .filter((sig) => !sig.err)
    .slice(0, FEED_SIGNATURE_FETCH_LIMIT)
    .map((sig) => sig.signature);

  if (target.length === 0) return [];

  const summaries = await withTimeout(
    fetchTransactionsForAnalytics(conn, target, address),
    FEED_BUILD_TIMEOUT_MS,
    [] as AnalyticsTxSummary[]
  );

  if (summaries.length === 0) return [];

  const holdingMeta = new Map(holdings.map((h) => [h.mint, { symbol: h.symbol, name: h.name }]));
  const holdingPrice = new Map(holdings.map((h) => [h.mint, h.priceUsd]));
  const seenMints = new Set<string>();
  const feed: WalletActivityFeedItem[] = [];

  const chronological = [...summaries]
    .filter((tx) => tx.status === 'confirmed')
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const tx of chronological) {
    const deltas = tx.tokenDeltas.filter(([, delta]) => Math.abs(delta) >= MIN_TOKEN_DELTA);
    const nonBaseLegs = deltas.filter(([mint]) => mint !== USDC_MINT && mint !== WRAPPED_SOL_MINT);

    const stableDelta = deltas.find(([mint]) => mint === USDC_MINT)?.[1] ?? 0;
    const effectiveSolDelta = tx.solChange + tx.feeSol;
    const stableSpendUsd = stableDelta < 0 ? -stableDelta : 0;
    const stableReceiveUsd = stableDelta > 0 ? stableDelta : 0;
    const solSpendUsd = effectiveSolDelta < 0 ? -effectiveSolDelta * solPriceUsd : 0;
    const solReceiveUsd = effectiveSolDelta > 0 ? effectiveSolDelta * solPriceUsd : 0;
    const buyNotionalUsd = stableSpendUsd > 0 ? stableSpendUsd : solSpendUsd;
    const sellNotionalUsd = stableReceiveUsd > 0 ? stableReceiveUsd : solReceiveUsd;

    if (nonBaseLegs.length === 0) {
      const transferUsd = Math.abs(effectiveSolDelta) * solPriceUsd;
      const transferSol = Math.abs(effectiveSolDelta);
      if (transferUsd < LARGE_TRANSACTION_USD && transferSol < 5) {
        continue;
      }

      feed.push({
        type: 'large',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint: WRAPPED_SOL_MINT,
        tokenSymbol: 'SOL',
        tokenName: 'Solana',
        notionalUsd: transferUsd,
        actionLabel: `Transferred ${transferSol.toFixed(2)} SOL`,
        actionDetail: 'Large SOL transfer',
      });
      continue;
    }

    const dominantLeg = [...nonBaseLegs].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    if (!dominantLeg) continue;

    const [mint, delta] = dominantLeg;
    const meta = resolveMintMeta(mint, holdingMeta);
    const qty = Math.abs(delta);
    const tokenPrice = holdingPrice.get(mint) ?? 0;
    const tokenNotionalUsd = qty * tokenPrice;

    if (delta > 0) {
      const isNewPosition = !seenMints.has(mint);
      seenMints.add(mint);

      const estimatedNotionalUsd =
        buyNotionalUsd > 0
          ? buyNotionalUsd
          : tokenNotionalUsd > 0
            ? tokenNotionalUsd
            : Math.abs(delta) * (solPriceUsd * 0.001);
      if (!isNewPosition && estimatedNotionalUsd < FEED_DUST_NOTIONAL_USD) {
        continue;
      }

      const actionLabel = isNewPosition
        ? `First-time token purchase: ${meta.symbol}`
        : estimatedNotionalUsd >= LARGE_TRANSACTION_USD
          ? `Bought ${meta.symbol}`
          : `Bought ${meta.symbol}`;

      const actionDetail =
        effectiveSolDelta < -MIN_TOKEN_DELTA
          ? `Swapped ${Math.abs(effectiveSolDelta).toFixed(2)} SOL -> ${meta.symbol}`
          : estimatedNotionalUsd >= LARGE_TRANSACTION_USD
            ? 'Large buy event'
            : `Increased holdings in ${meta.symbol}`;

      feed.push({
        type: isNewPosition ? 'new-token' : 'buy',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint,
        tokenSymbol: meta.symbol,
        tokenName: meta.name,
        notionalUsd: estimatedNotionalUsd,
        actionLabel,
        actionDetail,
      });
      continue;
    }

    if (delta < 0) {
      seenMints.add(mint);

      const estimatedNotionalUsd =
        sellNotionalUsd > 0
          ? sellNotionalUsd
          : tokenNotionalUsd > 0
            ? tokenNotionalUsd
            : Math.abs(delta) * (solPriceUsd * 0.001);
      if (estimatedNotionalUsd < FEED_DUST_NOTIONAL_USD) {
        continue;
      }

      const actionLabel =
        estimatedNotionalUsd >= LARGE_TRANSACTION_USD
          ? `Sold ${meta.symbol}`
          : `Sold ${meta.symbol}`;

      const actionDetail =
        effectiveSolDelta > MIN_TOKEN_DELTA
          ? `Swapped ${meta.symbol} -> ${Math.abs(effectiveSolDelta).toFixed(2)} SOL`
          : estimatedNotionalUsd >= LARGE_TRANSACTION_USD
            ? 'Large sell event'
            : `Reduced holdings in ${meta.symbol}`;

      feed.push({
        type: 'sell',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint,
        tokenSymbol: meta.symbol,
        tokenName: meta.name,
        notionalUsd: estimatedNotionalUsd,
        actionLabel,
        actionDetail,
      });
    }

    if (feed.length >= RECENT_ACTIVITY_FEED_LIMIT * 2) {
      break;
    }
  }

  if (feed.length === 0) {
    for (const tx of chronological) {
      const absSol = Math.abs(tx.solChange);
      const transferUsd = absSol * solPriceUsd;
      if (absSol < 0.15 && transferUsd < FEED_DUST_NOTIONAL_USD) {
        continue;
      }

      const actionLabel =
        tx.solChange < 0
          ? `Swapped ${absSol.toFixed(2)} SOL -> token`
          : `Swapped token -> ${absSol.toFixed(2)} SOL`;

      feed.push({
        type: 'large',
        signature: tx.signature,
        timestamp: tx.timestamp,
        mint: WRAPPED_SOL_MINT,
        tokenSymbol: 'SOL',
        tokenName: 'Solana',
        notionalUsd: transferUsd,
        actionLabel,
        actionDetail: 'Limited analysis from recent wallet interactions',
      });

      if (feed.length >= RECENT_ACTIVITY_FEED_LIMIT) {
        break;
      }
    }
  }

  const mostRecentFirst = [...feed].sort((a, b) => b.timestamp - a.timestamp);
  const compacted = compactBehaviorFeed(mostRecentFirst);
  return compacted.slice(0, RECENT_ACTIVITY_FEED_LIMIT);
}

async function estimateApproxFirstActivity(
  signatures: Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getSignaturesForAddress']>>
): Promise<{ first: number | null; last: number | null }> {
  if (signatures.length === 0) {
    return { first: null, last: null };
  }

  return {
    // Approximate first activity from oldest tx in a single limited batch.
    first: signatures[signatures.length - 1]?.blockTime ?? null,
    last: signatures[0]?.blockTime ?? null,
  };
}

function computePortfolioStructure(holdings: TokenHolding[]): { concentrationScore: number; diversity: number } {
  const positiveValueHoldings = holdings.filter((h) => h.valueUsd > 0);
  const totalValue = positiveValueHoldings.reduce((sum, h) => sum + h.valueUsd, 0);

  if (holdings.length === 0) {
    return {
      concentrationScore: 100,
      diversity: 0,
    };
  }

  // Fallback to count-based concentration when market prices are unavailable.
  if (positiveValueHoldings.length === 0 || totalValue <= 0) {
    const equalWeight = 1 / holdings.length;
    const hhi = holdings.length * equalWeight * equalWeight;
    const concentrationScore = Math.min(Math.max(hhi * 100, 0), 100);
    const diversity = Math.max(0, 100 - concentrationScore);

    return {
      concentrationScore,
      diversity,
    };
  }

  const hhi = positiveValueHoldings.reduce((sum, h) => {
    const weight = h.valueUsd / totalValue;
    return sum + weight * weight;
  }, 0);

  const concentrationScore = Math.min(Math.max(hhi * 100, 0), 100);
  const diversity = Math.max(0, 100 - concentrationScore);

  return {
    concentrationScore,
    diversity,
  };
}

function classifyActivityLevelFromRecentInteractions(recentInteractions: number): ActivityLevel {
  if (recentInteractions >= 40) return 'Very High';
  if (recentInteractions >= 16) return 'High';
  if (recentInteractions >= 5) return 'Medium';
  return 'Low';
}

function inferTradingStyleLight(
  recentInteractions: number,
  holdingCount: number,
  concentrationScore: number
): TradingStyle {
  if (recentInteractions >= 30 && concentrationScore < 45) return 'High-frequency trader';
  if (recentInteractions >= 12 && holdingCount >= 6) return 'Meme coin scalper';
  if (recentInteractions >= 6 || (concentrationScore >= 30 && concentrationScore < 75)) return 'Swing trader';
  return 'Long-term holder';
}

function buildFastAnalyticsSnapshot(
  latestSignature: string | null,
  signatures: SignatureInfo[],
  holdings: TokenHolding[],
  concentrationScore: number
): WalletAnalyticsSnapshot {
  const nowSec = Math.floor(Date.now() / 1000);
  const recentCutoff = nowSec - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60;
  const recentInteractions = signatures.filter((sig) => (sig.blockTime ?? 0) >= recentCutoff).length;

  const newest = signatures[0]?.blockTime ?? null;
  const oldest = signatures[signatures.length - 1]?.blockTime ?? null;
  const analyzedDays = newest && oldest ? Math.max((newest - oldest) / (24 * 60 * 60), 0) : 0;
  const tradingFrequency = recentInteractions / 7;
  const activityLevel = classifyActivityLevelFromRecentInteractions(recentInteractions);
  const tradingStyle = inferTradingStyleLight(recentInteractions, holdings.length, concentrationScore);
  const uniqueTokensTraded = holdings.length;

  const riskLevel: RiskLevel =
    recentInteractions >= 30 || concentrationScore >= 75
      ? 'High'
      : recentInteractions >= 10 || concentrationScore >= 45
        ? 'Medium'
        : 'Low';

  return {
    latestSignature,
    analyzedTransactions: signatures.length,
    analyzedDays,
    uniqueTokensTraded,
    activityLevel,
    tradingFrequency,
    recentTradingActivity:
      recentInteractions > 0
        ? `${recentInteractions} wallet interactions in the last 7 days`
        : 'Not enough recent activity',
    tradingStyle,
    averageEstimatedHoldDurationHours: null,
    riskLevel,
    recentActivityFeed: [],
    recentTrades: fallbackTradesFromSignatures(signatures),
    cachedAt: Date.now(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isValidSolanaAddress(address)) {
    return NextResponse.json({ success: false, error: 'Invalid Solana address' }, { status: 400 });
  }

  try {
    const conn = getSolanaConnection();
    const pubkey = new PublicKey(address);

    const [solBalanceResult, holdingsResult, signaturesResult, analyticsSignaturesResult, solPriceResult] = await Promise.allSettled([
      withTimeout(getSolBalance(address), 3000, 0),
      withTimeout(mapHoldings(address), 3000, [] as TokenHolding[]),
      withTimeout(rpcWithRetry(() => conn.getSignaturesForAddress(pubkey, { limit: FAST_SIGNATURE_FETCH_COUNT }), 1), 2500, []),
      withTimeout(
        rpcWithRetry(
          () => conn.getSignaturesForAddress(pubkey, { limit: ANALYTICS_INITIAL_SIGNATURE_FETCH_COUNT }),
          1
        ),
        2500,
        []
      ),
      withTimeout(getSolPriceUsd(), 3000, 0),
    ]);

    const solBalance = solBalanceResult.status === 'fulfilled' ? solBalanceResult.value : 0;
    const holdings = holdingsResult.status === 'fulfilled' ? holdingsResult.value : [];
    const solPriceUsd = solPriceResult.status === 'fulfilled' ? solPriceResult.value : 0;

    const signatures = signaturesResult.status === 'fulfilled' ? signaturesResult.value : [];
    const analyticsSignatures =
      analyticsSignaturesResult.status === 'fulfilled' && analyticsSignaturesResult.value.length > 0
        ? analyticsSignaturesResult.value
        : signatures;
    const approxWindow = await estimateApproxFirstActivity(signatures);
    const portfolioValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0) + solBalance * solPriceUsd;
    const { concentrationScore, diversity } = computePortfolioStructure(holdings);
    const latestSignature = analyticsSignatures[0]?.signature ?? null;
    const fastAnalytics = buildFastAnalyticsSnapshot(latestSignature, analyticsSignatures, holdings, concentrationScore);
    const analytics = await withTimeout(Promise.resolve(fastAnalytics), FAST_ANALYTICS_TIMEOUT_MS, fastAnalytics);

    const activityFeed = await buildRecentBehaviorFeed(
      conn,
      address,
      signatures,
      holdings,
      solPriceUsd
    );

    const recentTransactions =
      analytics.recentTrades.length > 0 ? analytics.recentTrades : fallbackTradesFromSignatures(signatures);

    const data: WalletAnalysis = {
      address,
      solBalance,
      lastActiveAt: approxWindow.last,
      firstTransactionAt: approxWindow.first,
      lastTransactionAt: approxWindow.last,
      portfolioValueUsd,
      analyzedTransactions: analytics.analyzedTransactions,
      analyzedDays: analytics.analyzedDays,
      analysisNote:
        analytics.analyzedTransactions > 0
          ? 'Limited analysis based on recent wallet activity'
          : 'Data unavailable for advanced analytics',
      totalTokenHoldings: holdings.length,
      portfolioDiversity: diversity,
      portfolioConcentrationScore: concentrationScore,
      activityLevel: analytics.activityLevel,
      uniqueTokensTraded: analytics.uniqueTokensTraded,
      recentTradingActivity: analytics.recentTradingActivity,
      tradingFrequency: analytics.tradingFrequency,
      tradingStyle: analytics.tradingStyle,
      averageEstimatedHoldDurationHours: analytics.averageEstimatedHoldDurationHours,
      riskLevel:
        analytics.analyzedTransactions === 0 && holdings.length === 0
          ? 'Low'
          : concentrationScore >= 70 || analytics.riskLevel === 'High'
            ? 'High'
            : concentrationScore >= 45 || analytics.riskLevel === 'Medium'
              ? 'Medium'
              : 'Low',
      recentActivityFeed: activityFeed,
      holdings,
      recentTransactions,
    };

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Wallet profile error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch wallet data' }, { status: 500 });
  }
}
