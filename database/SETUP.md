# Database Setup (Supabase Free Tier)

This app needs lightweight tables for watchlist sync and progressive wallet-age cache. You can still run without Supabase; in that case watchlist data remains local in browser storage and wallet age cache stays request-local only.

## 1) Create a free Supabase project

1. Create a project in Supabase.
2. Open the SQL editor.
3. Run this SQL:

```sql
create table if not exists tracked_wallets (
	id uuid primary key default gen_random_uuid(),
	client_id text not null,
	wallet_address text not null,
	label text,
	added_at timestamptz not null default now(),
	unique (client_id, wallet_address)
);

create index if not exists idx_tracked_wallets_client
	on tracked_wallets (client_id, added_at desc);

create table if not exists wallet_age_cache (
	wallet_address text primary key,
	oldest_signature text,
	oldest_block_time bigint,
	estimated_wallet_age_days numeric(12, 4),
	scan_before_signature text,
	scan_complete boolean not null default false,
	is_scanning boolean not null default false,
	scanned_pages integer not null default 0,
	scanned_signatures integer not null default 0,
	updated_at timestamptz not null default now()
);

create index if not exists idx_wallet_age_cache_updated
	on wallet_age_cache (updated_at desc);
```

## 2) Environment variables

Copy values into [.env.example](../.env.example) or your local env file:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SOLANA_RPC_URL

Quick verification command from project root:

- npm run verify:stack

Notes:
- SOLANA_RPC_URL defaults to public mainnet RPC if not set.
- Server routes use SUPABASE_SERVICE_ROLE_KEY when present.
- If SERVICE_ROLE is not set, the app falls back to SUPABASE_ANON_KEY.

## 3) Verify the integration

- Start the app and add a wallet to Track Wallet.
- Confirm records appear in `tracked_wallets`.
- If Supabase is unavailable, the app gracefully falls back to local browser storage.

## 4) Optional RLS policy guidance

If you use SUPABASE_ANON_KEY for writes, configure RLS policies accordingly.
For production, prefer SUPABASE_SERVICE_ROLE_KEY on the server only.
