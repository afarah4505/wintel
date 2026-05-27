import fs from 'node:fs';
import path from 'node:path';
import { Connection } from '@solana/web3.js';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function normalizeSupabaseUrl(input) {
  if (!input) return '';
  const cleaned = input.trim().replace(/\/+$/, '');
  return cleaned.replace(/\/rest\/v1$/i, '');
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
    }),
  ]);
}

async function checkSolanaRpc(solanaRpcUrl) {
  const conn = new Connection(solanaRpcUrl, 'confirmed');
  const version = await withTimeout(conn.getVersion(), 10000, 'Solana RPC check');
  if (!version || !version['solana-core']) {
    throw new Error('RPC responded without solana-core version');
  }
  return version['solana-core'];
}

async function checkDexScreener(baseUrl) {
  const url = (baseUrl || 'https://api.dexscreener.com').replace(/\/+$/, '') + '/latest/dex/search?q=SOL';
  const res = await withTimeout(fetch(url), 10000, 'DexScreener check');
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' from DexScreener');
  }
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.pairs)) {
    throw new Error('Unexpected DexScreener response shape');
  }
  return payload.pairs.length;
}

async function checkSupabase(supabaseUrl, key) {
  const healthUrl = supabaseUrl.replace(/\/+$/, '') + '/auth/v1/health';
  const healthRes = await withTimeout(fetch(healthUrl), 10000, 'Supabase health check');
  if (!healthRes.ok) {
    throw new Error('Health endpoint returned HTTP ' + healthRes.status);
  }

  const restUrl = supabaseUrl.replace(/\/+$/, '') + '/rest/v1/';
  const restRes = await withTimeout(
    fetch(restUrl, {
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
      },
    }),
    10000,
    'Supabase REST check'
  );

  if (restRes.status === 401 || restRes.status === 403) {
    throw new Error('REST endpoint rejected key with HTTP ' + restRes.status);
  }

  return restRes.status;
}

async function main() {
  const root = process.cwd();
  const envLocalPath = path.join(root, '.env.local');
  const envPath = path.join(root, '.env');
  loadEnvFile(envLocalPath);
  loadEnvFile(envPath);

  const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const dexBase = process.env.NEXT_PUBLIC_DEXSCREENER_BASE_URL || 'https://api.dexscreener.com';

  const rawSupabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  let hasError = false;

  console.log('=== Free Stack Bootstrap Check ===');
  console.log('Loaded env sources:');
  console.log('- ' + envLocalPath + (fs.existsSync(envLocalPath) ? ' (found)' : ' (missing)'));
  console.log('- ' + envPath + (fs.existsSync(envPath) ? ' (found)' : ' (missing)'));
  console.log('- .env.example is not loaded automatically by this script');

  if (!rawSupabaseUrl) {
    hasError = true;
    console.error('[FAIL] Missing SUPABASE_URL');
    console.error('       Add it to .env.local or .env (you can copy from .env.example).');
  } else if (rawSupabaseUrl !== supabaseUrl) {
    console.warn('[WARN] SUPABASE_URL appears to include /rest/v1. Normalized for checks.');
    console.warn('       Recommended SUPABASE_URL format: https://<project-ref>.supabase.co');
  } else {
    console.log('[OK] SUPABASE_URL is set');
  }

  if (!supabaseKey) {
    hasError = true;
    console.error('[FAIL] Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
    console.error('       Add one of these keys to .env.local or .env.');
  } else {
    console.log('[OK] Supabase key is set');
  }

  try {
    const core = await checkSolanaRpc(solanaRpcUrl);
    console.log('[OK] Solana RPC reachable. solana-core=' + core);
  } catch (err) {
    hasError = true;
    console.error('[FAIL] Solana RPC check failed: ' + err.message);
  }

  try {
    const count = await checkDexScreener(dexBase);
    console.log('[OK] DexScreener reachable. pairs returned=' + count);
  } catch (err) {
    hasError = true;
    console.error('[FAIL] DexScreener check failed: ' + err.message);
  }

  if (!hasError) {
    try {
      const status = await checkSupabase(supabaseUrl, supabaseKey);
      console.log('[OK] Supabase reachable. REST status=' + status);
    } catch (err) {
      hasError = true;
      console.error('[FAIL] Supabase check failed: ' + err.message);
    }
  }

  if (hasError) {
    console.error('Bootstrap check failed. Fix the errors above and run again.');
    process.exit(1);
  }

  console.log('All free-stack checks passed.');
}

main().catch((err) => {
  console.error('[FAIL] Unexpected error:', err.message);
  process.exit(1);
});
