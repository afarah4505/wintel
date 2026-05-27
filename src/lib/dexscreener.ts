import axios from 'axios';
import type { DexScreenerPair } from '@/types';

const DS_BASE = 'https://api.dexscreener.com';
const client = axios.create({ baseURL: DS_BASE, timeout: 10000 });

export async function getTokenPairs(tokenAddress: string): Promise<DexScreenerPair[]> {
  const { data } = await client.get(`/latest/dex/tokens/${tokenAddress}`);
  return data?.pairs?.filter((p: DexScreenerPair) => p.chainId === 'solana') ?? [];
}
