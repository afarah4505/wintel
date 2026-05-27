import { NextRequest, NextResponse } from 'next/server';
import { getSolanaConnection, getSolBalance, getTokenBalances } from '@/lib/helius';
import { PublicKey } from '@solana/web3.js';
import { getTokenPairs } from '@/lib/dexscreener';
import { isValidSolanaAddress } from '@/lib/utils';
import type { TokenHolding, Trade, WalletAnalysis } from '@/types';

const MAX_TX_COUNT = 10;
const TX_METRIC_FETCH_COUNT = 12;
const TX_WINDOW_SCAN_COUNT = 200;
const MAX_HOLDINGS = 10;
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const metadataCache = new Map<string, Promise<{ name: string; symbol: string } | null>>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    if (solChange > 0) totalWins += 1;
    if (solChange < 0) totalLosses += 1;
    estimatedPnlUsd += valueUsd;

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
  const estimatedWinRate = decisions === 0 ? 0 : (totalWins / decisions) * 100;

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

async function estimateWalletAge(
  conn: ReturnType<typeof getSolanaConnection>,
  pubkey: PublicKey,
  latestSignatures: Awaited<ReturnType<ReturnType<typeof getSolanaConnection>['getSignaturesForAddress']>>
): Promise<{ first: number | null; last: number | null }> {
  try {
    if (latestSignatures.length === 0) {
      return { first: null, last: null };
    }

    const latest = latestSignatures[0]?.blockTime ?? null;
    let earliest = latestSignatures[latestSignatures.length - 1]?.blockTime ?? null;
    let before = latestSignatures[latestSignatures.length - 1]?.signature;

    for (let page = 0; page < 2 && before; page += 1) {
      const olderSignatures = await rpcWithRetry(
        () => conn.getSignaturesForAddress(pubkey, { limit: TX_WINDOW_SCAN_COUNT, before }),
        1
      );

      if (olderSignatures.length === 0) break;

      const oldestInPage = olderSignatures[olderSignatures.length - 1];
      earliest = oldestInPage.blockTime ?? earliest;
      before = oldestInPage.signature;

      if (olderSignatures.length < TX_WINDOW_SCAN_COUNT) break;
    }

    return { first: earliest, last: latest };
  } catch {
    const fallbackFirst = latestSignatures[latestSignatures.length - 1]?.blockTime ?? null;
    const fallbackLast = latestSignatures[0]?.blockTime ?? null;
    return { first: fallbackFirst, last: fallbackLast };
  }
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

    const [solBalanceResult, holdingsResult, signaturesResult, solPriceResult] = await Promise.allSettled([
      getSolBalance(address),
      mapHoldings(address),
      rpcWithRetry(() => conn.getSignaturesForAddress(pubkey, { limit: MAX_TX_COUNT }), 1),
      getSolPriceUsd(),
    ]);

    const solBalance = solBalanceResult.status === 'fulfilled' ? solBalanceResult.value : 0;
    const holdings = holdingsResult.status === 'fulfilled' ? holdingsResult.value : [];
    const solPriceUsd = solPriceResult.status === 'fulfilled' ? solPriceResult.value : 0;

    const signatures = signaturesResult.status === 'fulfilled' ? signaturesResult.value : [];
    const txWindow = await estimateWalletAge(conn, pubkey, signatures);

    let parsedTransactions: Awaited<ReturnType<typeof conn.getParsedTransactions>> = [];
    if (signatures.length) {
      try {
        parsedTransactions = await rpcWithRetry(
          () =>
            conn.getParsedTransactions(
              signatures.slice(0, TX_METRIC_FETCH_COUNT).map((s) => s.signature),
              { maxSupportedTransactionVersion: 0 }
            ),
          1
        );
      } catch (txErr) {
        // Public RPC often rate-limits transaction history requests; keep holdings/profile available.
        console.warn('Wallet transaction fetch throttled or failed, continuing without tx metrics:', txErr);
      }
    }

    const txMetrics = computeTxMetrics(parsedTransactions, address, solPriceUsd);
    const portfolioValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0) + solBalance * solPriceUsd;

    const pricedHoldings = holdings.filter((h) => h.priceUsd > 0);
    const holdingsEstimatedPnlUsd = holdings.reduce((sum, h) => sum + h.estimatedPnl24h, 0);
    const holdingsWinRate =
      pricedHoldings.length > 0
        ? (pricedHoldings.filter((h) => h.estimatedPnl24h > 0).length / pricedHoldings.length) * 100
        : 0;

    const estimatedPnlUsd = txMetrics.decisions > 0 ? txMetrics.estimatedPnlUsd : holdingsEstimatedPnlUsd;
    const estimatedWinRate = pricedHoldings.length >= 3
      ? holdingsWinRate
      : null;

    const rankedByPnl = [...holdings].sort((a, b) => b.estimatedPnl24h - a.estimatedPnl24h);
    const topWinners = rankedByPnl.filter((h) => h.estimatedPnl24h > 0).slice(0, 5);
    const topLosers = [...rankedByPnl]
      .reverse()
      .filter((h) => h.estimatedPnl24h < 0)
      .slice(0, 5);

    const walletAgeDays = txWindow.first
      ? (Date.now() - txWindow.first * 1000) / (1000 * 60 * 60 * 24)
      : null;

    const recentTransactions =
      txMetrics.trades.length > 0 ? txMetrics.trades : fallbackTradesFromSignatures(signatures);

    const data: WalletAnalysis = {
      address,
      solBalance,
      walletAgeDays,
      firstTransactionAt: txWindow.first,
      lastTransactionAt: txWindow.last,
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
