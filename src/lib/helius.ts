import { Connection, PublicKey } from '@solana/web3.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

let connection: Connection | null = null;

export function getSolanaConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connection;
}

export async function getTokenBalances(address: string) {
  const conn = getSolanaConnection();
  const owner = new PublicKey(address);
  const accounts = await conn.getParsedTokenAccountsByOwner(owner, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });
  return accounts;
}

export async function getSolBalance(address: string): Promise<number> {
  const conn = getSolanaConnection();
  const lamports = await conn.getBalance(new PublicKey(address));
  return lamports / 1e9;
}
