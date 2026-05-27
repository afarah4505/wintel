# Wallet Intel

A minimal Solana wallet analyzer focused on one job: analyze any wallet and optionally track it.

## Features

- Search any Solana wallet
- Wallet balance and age (first transaction)
- Current token holdings
- Estimated wallet PnL and win rate
- Recent transactions
- Top winning and losing tokens
- Track wallet to watchlist
- Supabase-backed watchlist sync with local fallback

## Stack

- Next.js + React + TypeScript
- Solana Web3.js with public Solana RPC
- DexScreener free API
- Supabase free tier (optional for watchlist sync)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

3. (Optional) Set up Supabase watchlist table using [database/SETUP.md](database/SETUP.md).

4. Start development server:

```bash
npm run dev
```

5. Open:

- http://localhost:3000

## Build and Run

Build production bundle:

```bash
npm run build
```

Run production server:

```bash
npm start
```

Verify free stack services:

```bash
npm run verify:stack
```

## API Endpoints

- `GET /api/wallet/:address` wallet analysis
- `GET /api/watchlist?clientId=:id` fetch tracked wallets
- `POST /api/watchlist` add tracked wallet
- `PATCH /api/watchlist` update tracked wallet label
- `DELETE /api/watchlist` remove tracked wallet

## Deployment (Netlify)

1. Push repository to GitHub.
2. In Netlify, create a new site from Git and select this repository.
3. Build settings:

- Build command: `npm run build`
- Publish directory: `.next`

4. Add environment variables in Netlify Site Settings > Environment Variables:

- `SOLANA_RPC_URL`
- `SUPABASE_URL` (optional)
- `SUPABASE_ANON_KEY` (optional)
- `SUPABASE_SERVICE_ROLE_KEY` (optional)

5. Deploy.

Notes:
- This repo includes `netlify.toml` with the Next.js plugin and Node 20 runtime.
- Without Supabase vars, watchlist still works locally in browser storage.
- With Supabase configured, watchlist sync is persisted server-side.
