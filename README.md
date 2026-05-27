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

## Deployment

Deploy on Vercel:

1. Push repository to GitHub.
2. Import project in Vercel.
3. Set environment variables from `.env.example`.
4. Deploy.

Notes:
- Without Supabase vars, watchlist still works locally in browser storage.
- With Supabase configured, watchlist sync is persisted server-side.
