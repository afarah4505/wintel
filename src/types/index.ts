export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  logo?: string;
  uiAmount: number;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  priceChange24h: number;
  estimatedPnl24h: number;
}

export interface Trade {
  signature: string;
  timestamp: number;
  solChange: number;
  feeSol: number;
  valueUsd: number;
  status: 'confirmed' | 'failed';
}

export type ActivityLevel = 'Low' | 'Medium' | 'High' | 'Very High';
export type TradingStyle = 'Long-term holder' | 'Swing trader' | 'Meme coin scalper' | 'High-frequency trader';
export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface WalletInsight {
  label: string;
  detail: string;
}

export interface WalletBehaviorSignal {
  label: string;
  value: string;
}

export interface WalletActivityFeedItem {
  type: 'buy' | 'sell' | 'large' | 'new-token';
  signature: string;
  timestamp: number;
  mint: string;
  tokenSymbol: string;
  tokenName: string;
  notionalUsd: number;
  actionLabel: string;
  actionDetail?: string;
}

export interface WalletAnalysis {
  address: string;
  solBalance: number;
  lastActiveAt: number | null;
  firstTransactionAt: number | null;
  lastTransactionAt: number | null;
  portfolioValueUsd: number;
  analyzedTransactions: number;
  analyzedDays: number;
  analysisNote: string;
  totalTokenHoldings: number;
  portfolioDiversity: number;
  portfolioConcentrationScore: number;
  activityLevel: ActivityLevel;
  uniqueTokensTraded: number;
  recentTradingActivity: string;
  tradingFrequency: number;
  tradingStyle: TradingStyle;
  averageEstimatedHoldDurationHours: number | null;
  riskLevel: RiskLevel;
  walletInsights: WalletInsight[];
  activitySummary: string;
  behaviorSignals: WalletBehaviorSignal[];
  holdings: TokenHolding[];
  recentTransactions: Trade[];
}

// ─── DexScreener Types ────────────────────────────────────────────────────────
export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns: { m5: TxnCount; h1: TxnCount; h6: TxnCount; h24: TxnCount };
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
}

interface TxnCount {
  buys: number;
  sells: number;
}

// ─── API Response Types ───────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}
