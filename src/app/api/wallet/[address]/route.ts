import { NextRequest, NextResponse } from 'next/server';
import { getSolanaConnection, getSolBalance, getTokenBalances } from '@/lib/helius';
import { PublicKey } from '@solana/web3.js';
import { getTokenPairs } from '@/lib/dexscreener';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isValidSolanaAddress } from '@/lib/utils';
import type { TokenHolding, Trade, WalletAnalysis } from '@/types';

const MAX_TX_COUNT = 10;
const SIGNATURE_FETCH_COUNT = 1000;
const TX_METRIC_FETCH_COUNT = 20;
const AGE_SCAN_MAX_PAGES = 100;
const AGE_SCAN_PAGES_PER_RUN = 4;
const MAX_HOLDINGS = 10;
const MIN_WIN_RATE_SAMPLE = 3;
const MIN_HOLDING_PRICE_CHANGE = 0.2;
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const WALLET_AGE_CACHE_TABLE = 'wallet_age_cache';

const metadataCache = new Map<string, Promise<{ name: string; symbol: string } | null>>();
const activeAgeScans = new Set<string>();
let walletAgeCacheTableReady: boolean | null = null;

type WalletAgeCache = {
  walletAddress: string;
  oldestSignature: string | null;
  oldestBlockTime: number | null;
  estimatedWalletAgeDays: number | null;
  scanBeforeSignature: string | null;
  scanComplete: boolean;
  isScanning: boolean;
  scannedPages: number;
  scannedSignatures: number;
  updatedAt: string | null;
};

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

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeWalletAgeCache(row: Record<string, unknown>): WalletAgeCache {
  return {
    walletAddress: String(row.wallet_address ?? ''),
    oldestSignature: row.oldest_signature ? String(row.oldest_signature) : null,
    oldestBlockTime: parseNumber(row.oldest_block_time),
    estimatedWalletAgeDays: parseNumber(row.estimated_wallet_age_days),
    scanBeforeSignature: row.scan_before_signature ? String(row.scan_before_signature) : null,
    scanComplete: Boolean(row.scan_complete),
    isScanning: Boolean(row.is_scanning),
    scannedPages: parseNumber(row.scanned_pages) ?? 0,
    scannedSignatures: parseNumber(row.scanned_signatures) ?? 0,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

async function loadWalletAgeCache(address: string): Promise<WalletAgeCache | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(WALLET_AGE_CACHE_TABLE)
    .select('*')
    .eq('wallet_address', address)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeWalletAgeCache(data as Record<string, unknown>);
}

async function canUseWalletAgeCache(): Promise<boolean> {
  if (walletAgeCacheTableReady != null) return walletAgeCacheTableReady;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    walletAgeCacheTableReady = false;
    return false;
  }

  const { error } = await supabase
    .from(WALLET_AGE_CACHE_TABLE)
    .select('wallet_address')
    .limit(1);

  walletAgeCacheTableReady = !error;
  return walletAgeCacheTableReady;
}

async function upsertWalletAgeCache(
  address: string,
  patch: Partial<WalletAgeCache> & { oldestBlockTime?: number | null; oldestSignature?: string | null }
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const estimatedWalletAgeDays =
    patch.oldestBlockTime == null ? null : (Date.now() - patch.oldestBlockTime * 1000) / (1000 * 60 * 60 * 24);

  const { error } = await supabase.from(WALLET_AGE_CACHE_TABLE).upsert(
    {
      wallet_address: address,
      oldest_signature: patch.oldestSignature ?? null,
      oldest_block_time: patch.oldestBlockTime ?? null,
      estimated_wallet_age_days: patch.estimatedWalletAgeDays ?? estimatedWalletAgeDays,
      scan_before_signature: patch.scanBeforeSignature ?? null,
      scan_complete: patch.scanComplete ?? false,
      is_scanning: patch.isScanning ?? false,
      scanned_pages: patch.scannedPages ?? 0,
      scanned_signatures: patch.scannedSignatures ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );

  if (error) {
    walletAgeCacheTableReady = false;
    return false;
  }

  return true;
}

async function runBackgroundWalletAgeScan(
  address: string,
  conn: ReturnType<typeof getSolanaConnection>,
  pubkey: PublicKey,
  seed: {
    oldestSignature: string | null;
    oldestBlockTime: number | null;
    scanBeforeSignature: string | null;
    scannedPages: number;
    scannedSignatures: number;
    scanComplete: boolean;
  }
) {
  if (seed.scanComplete || !seed.scanBeforeSignature || activeAgeScans.has(address)) return;

  activeAgeScans.add(address);
  const started = await upsertWalletAgeCache(address, {
    oldestSignature: seed.oldestSignature,
    oldestBlockTime: seed.oldestBlockTime,
    scanBeforeSignature: seed.scanBeforeSignature,
    scanComplete: seed.scanComplete,
    isScanning: true,
    scannedPages: seed.scannedPages,
    scannedSignatures: seed.scannedSignatures,
  });
  if (!started) {
    activeAgeScans.delete(address);
    return;
  }

  void (async () => {
    let oldestSignature = seed.oldestSignature;
    let oldestBlockTime = seed.oldestBlockTime;
    let before = seed.scanBeforeSignature;
    let scannedPages = seed.scannedPages;
    let scannedSignatures = seed.scannedSignatures;
    let scanComplete = seed.scanComplete;

    try {
      for (let i = 0; i < AGE_SCAN_PAGES_PER_RUN && before && !scanComplete; i += 1) {
        if (scannedPages >= AGE_SCAN_MAX_PAGES) {
          scanComplete = true;
          break;
        }

        const olderSigs = await withTimeout(
          rpcWithRetry(() => conn.getSignaturesForAddress(pubkey, { limit: SIGNATURE_FETCH_COUNT, before }), 1),
          4500,
          [] as Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getSignaturesForAddress']>>
        );

        if (olderSigs.length === 0) {
          scanComplete = true;
          before = null;
          break;
        }

        scannedPages += 1;
        scannedSignatures += olderSigs.length;

        const oldestInPage = olderSigs[olderSigs.length - 1];
        if (oldestInPage) {
          oldestSignature = oldestInPage.signature;
          oldestBlockTime = oldestInPage.blockTime ?? oldestBlockTime;
          before = oldestInPage.signature;
        }

        if (olderSigs.length < SIGNATURE_FETCH_COUNT) {
          scanComplete = true;
          before = null;
          break;
        }
      }
    } catch {
      // Keep current best snapshot and stop this run gracefully.
    } finally {
      await upsertWalletAgeCache(address, {
        oldestSignature,
        oldestBlockTime,
        scanBeforeSignature: before,
        scanComplete,
        isScanning: false,
        scannedPages,
        scannedSignatures,
      });
      activeAgeScans.delete(address);
    }
  })();
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

function computeTxMetrics(
  parsedTxs: Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getParsedTransactions']>>,
  address: string,
  solPriceUsd: number
) {
  const trades: Trade[] = [];
  let totalWins = 0;
  let totalLosses = 0;
  let estimatedPnlUsd = 0;

  for (const tx of parsedTxs) {
    if (!tx) continue;

    const accountKeys = tx.transaction.message.accountKeys.map((k) =>
      typeof k === 'string' ? k : k.pubkey.toBase58()
    );
    const ownerIndex = accountKeys.findIndex((k) => k === address);
    const preBalance = ownerIndex >= 0 ? Number(tx.meta?.preBalances?.[ownerIndex] ?? 0) / 1e9 : 0;
    const postBalance = ownerIndex >= 0 ? Number(tx.meta?.postBalances?.[ownerIndex] ?? 0) / 1e9 : 0;
    const feeSol = Number(tx.meta?.fee ?? 0) / 1e9;
    const solChange = postBalance - preBalance;
    const valueUsd = solChange * solPriceUsd;
    const tokenBalances = [
      ...(tx.meta?.preTokenBalances ?? []),
      ...(tx.meta?.postTokenBalances ?? []),
    ];
    const hasOwnerTokenActivity = tokenBalances.some((balance) => balance.owner === address);
    const hasAnyTokenActivity = tokenBalances.length > 0;
    const meaningfulSolMove = Math.abs(solChange) > Math.max(feeSol * 3, 0.0002);
    const looksLikeTrade = !tx.meta?.err && meaningfulSolMove && (hasOwnerTokenActivity || hasAnyTokenActivity);

    if (looksLikeTrade) {
      if (solChange > 0) totalWins += 1;
      if (solChange < 0) totalLosses += 1;
      estimatedPnlUsd += valueUsd;
    }

    trades.push({
      signature: tx.transaction.signatures[0],
      timestamp: tx.blockTime ?? 0,
      solChange,
      feeSol,
      valueUsd,
      status: tx.meta?.err ? 'failed' : 'confirmed',
    });
  }

  const decisions = totalWins + totalLosses;
  const estimatedWinRate = decisions >= MIN_WIN_RATE_SAMPLE ? (totalWins / decisions) * 100 : null;

  return {
    trades: trades.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_TX_COUNT),
    estimatedPnlUsd,
    estimatedWinRate,
    decisions,
  };
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

async function fetchParsedTransactionsFallback(
  conn: ReturnType<typeof getSolanaConnection>,
  signatures: string[]
): Promise<Awaited<ReturnType<typeof conn.getParsedTransactions>>> {
  const parsed: NonNullable<Awaited<ReturnType<typeof conn.getParsedTransactions>>> = [];

  for (const signature of signatures.slice(0, 4)) {
    try {
      const tx = await withTimeout(
        rpcWithRetry(() => conn.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 }), 1),
        1200,
        null
      );
      if (tx) parsed.push(tx);
    } catch {
      // Continue; public RPC can fail per-signature under load.
    }
  }

  return parsed;
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isValidSolanaAddress(address)) {
    return NextResponse.json({ success: false, error: 'Invalid Solana address' }, { status: 400 });
  }

  try {
    const conn = getSolanaConnection();
    const pubkey = new PublicKey(address);
    const cacheBackendAvailable = await canUseWalletAgeCache();

    const [solBalanceResult, holdingsResult, signaturesResult, solPriceResult] = await Promise.allSettled([
      withTimeout(getSolBalance(address), 5000, 0),
      withTimeout(mapHoldings(address), 9000, [] as TokenHolding[]),
      withTimeout(rpcWithRetry(() => conn.getSignaturesForAddress(pubkey, { limit: SIGNATURE_FETCH_COUNT }), 1), 5000, []),
      withTimeout(getSolPriceUsd(), 3000, 0),
    ]);

    const solBalance = solBalanceResult.status === 'fulfilled' ? solBalanceResult.value : 0;
    const holdings = holdingsResult.status === 'fulfilled' ? holdingsResult.value : [];
    const solPriceUsd = solPriceResult.status === 'fulfilled' ? solPriceResult.value : 0;

    const signatures = signaturesResult.status === 'fulfilled' ? signaturesResult.value : [];
    const approxWindow = await estimateApproxFirstActivity(signatures);
    const cache = await loadWalletAgeCache(address);

    const cachedFirst = cache?.oldestBlockTime ?? null;
    const txWindowFirst =
      approxWindow.first == null
        ? cachedFirst
        : cachedFirst == null
          ? approxWindow.first
          : Math.min(approxWindow.first, cachedFirst);

    const shouldDeepScan = cacheBackendAvailable && signatures.length === SIGNATURE_FETCH_COUNT;
    const scanComplete = cache?.scanComplete ?? !shouldDeepScan;
    const scanInProgress = cacheBackendAvailable && ((cache?.isScanning ?? false) || (shouldDeepScan && !scanComplete));

    if (cacheBackendAvailable && !cache) {
      await upsertWalletAgeCache(address, {
        oldestSignature: signatures[signatures.length - 1]?.signature ?? null,
        oldestBlockTime: approxWindow.first,
        scanBeforeSignature: signatures[signatures.length - 1]?.signature ?? null,
        scanComplete: !shouldDeepScan,
        isScanning: false,
        scannedPages: shouldDeepScan ? 1 : 0,
        scannedSignatures: signatures.length,
      });
    }

    if (cacheBackendAvailable && shouldDeepScan && !scanComplete) {
      await runBackgroundWalletAgeScan(address, conn, pubkey, {
        oldestSignature: cache?.oldestSignature ?? signatures[signatures.length - 1]?.signature ?? null,
        oldestBlockTime: txWindowFirst,
        scanBeforeSignature: cache?.scanBeforeSignature ?? signatures[signatures.length - 1]?.signature ?? null,
        scannedPages: Math.max(cache?.scannedPages ?? 0, 1),
        scannedSignatures: Math.max(cache?.scannedSignatures ?? 0, signatures.length),
        scanComplete,
      });
    }


    let parsedTransactions: Awaited<ReturnType<typeof conn.getParsedTransactions>> = [];
    if (signatures.length) {
      try {
        parsedTransactions = await withTimeout(
          rpcWithRetry(
            () =>
              conn.getParsedTransactions(
                signatures.slice(0, TX_METRIC_FETCH_COUNT).map((s) => s.signature),
                { maxSupportedTransactionVersion: 0 }
              ),
            1
          ),
          7000,
          []
        );
      } catch (txErr) {
        // Public RPC often rate-limits transaction history requests; keep holdings/profile available.
        console.warn('Wallet transaction fetch throttled or failed, continuing without tx metrics:', txErr);
      }

      const hasParsedTx = parsedTransactions.some((tx) => Boolean(tx));
      if (!hasParsedTx) {
        parsedTransactions = await withTimeout(
          fetchParsedTransactionsFallback(
            conn,
            signatures.slice(0, Math.min(TX_METRIC_FETCH_COUNT, 8)).map((s) => s.signature)
          ),
          5000,
          []
        );
      }
    }

    const txMetrics = computeTxMetrics(parsedTransactions, address, solPriceUsd);
    const portfolioValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0) + solBalance * solPriceUsd;

    const pricedHoldings = holdings.filter((h) => h.priceUsd > 0);
    const actionableHoldings = pricedHoldings.filter((h) => Math.abs(h.priceChange24h) >= MIN_HOLDING_PRICE_CHANGE);
    const holdingsEstimatedPnlUsd = holdings.reduce((sum, h) => sum + h.estimatedPnl24h, 0);
    const holdingsWinRate =
      actionableHoldings.length > 0
        ? (actionableHoldings.filter((h) => h.estimatedPnl24h > 0).length / actionableHoldings.length) * 100
        : 0;
    const hasReliableHoldingsSample = actionableHoldings.length >= MIN_WIN_RATE_SAMPLE;

    const estimatedPnlUsd = txMetrics.decisions > 0 ? txMetrics.estimatedPnlUsd : holdingsEstimatedPnlUsd;
    const estimatedWinRate =
      txMetrics.estimatedWinRate ?? (hasReliableHoldingsSample ? holdingsWinRate : null);

    const rankedByPnl = [...holdings].sort((a, b) => b.estimatedPnl24h - a.estimatedPnl24h);
    const topWinners = rankedByPnl.filter((h) => h.estimatedPnl24h > 0).slice(0, 5);
    const topLosers = [...rankedByPnl]
      .reverse()
      .filter((h) => h.estimatedPnl24h < 0)
      .slice(0, 5);

    const walletAgeDays = txWindowFirst
      ? (Date.now() - txWindowFirst * 1000) / (1000 * 60 * 60 * 24)
      : null;

    const recentTransactions =
      txMetrics.trades.length > 0 ? txMetrics.trades : fallbackTradesFromSignatures(signatures);

    const data: WalletAnalysis = {
      address,
      solBalance,
      walletAgeDays,
      firstTransactionAt: txWindowFirst,
      lastTransactionAt: approxWindow.last,
      ageScanInProgress: scanInProgress,
      portfolioValueUsd,
      estimatedPnlUsd,
      estimatedWinRate,
      holdings,
      recentTransactions,
      topWinners,
      topLosers,
    };

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Wallet profile error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch wallet data' }, { status: 500 });
  }
}
