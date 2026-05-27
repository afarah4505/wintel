-- ============================================================
-- SolScope — PostgreSQL Database Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT UNIQUE,
    google_id     TEXT UNIQUE,
    wallet_address TEXT UNIQUE,
    username      TEXT,
    avatar_url    TEXT,
    plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'elite')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tracked Wallets ──────────────────────────────────────────────────────────
CREATE TABLE wallets (
    address           TEXT PRIMARY KEY,
    label             TEXT,
    total_pnl         NUMERIC(20, 4) DEFAULT 0,
    realized_pnl      NUMERIC(20, 4) DEFAULT 0,
    unrealized_pnl    NUMERIC(20, 4) DEFAULT 0,
    win_rate          NUMERIC(5, 2)  DEFAULT 0,
    total_trades      INTEGER        DEFAULT 0,
    avg_hold_time     NUMERIC(10, 2) DEFAULT 0, -- minutes
    portfolio_value   NUMERIC(20, 4) DEFAULT 0,
    smart_money_score INTEGER        DEFAULT 0 CHECK (smart_money_score BETWEEN 0 AND 100),
    risk_score        INTEGER        DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    is_smart_money    BOOLEAN        DEFAULT FALSE,
    is_fresh_wallet   BOOLEAN        DEFAULT FALSE,
    first_seen_at     TIMESTAMPTZ,
    last_active_at    TIMESTAMPTZ,
    ai_summary        TEXT,
    tags              TEXT[]         DEFAULT '{}',
    indexed_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_smart_money_score ON wallets (smart_money_score DESC);
CREATE INDEX idx_wallets_total_pnl        ON wallets (total_pnl DESC);
CREATE INDEX idx_wallets_win_rate         ON wallets (win_rate DESC);
CREATE INDEX idx_wallets_tags             ON wallets USING GIN (tags);

-- ─── Watchlist ────────────────────────────────────────────────────────────────
CREATE TABLE watchlists (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    custom_label   TEXT,
    added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, wallet_address)
);

CREATE INDEX idx_watchlists_user_id ON watchlists (user_id);

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signature       TEXT UNIQUE NOT NULL,
    wallet_address  TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'swap', 'transfer')),
    token_in_mint   TEXT,
    token_in_symbol TEXT,
    token_in_amount NUMERIC(30, 10),
    token_in_price  NUMERIC(20, 10),
    token_out_mint  TEXT,
    token_out_symbol TEXT,
    token_out_amount NUMERIC(30, 10),
    token_out_price NUMERIC(20, 10),
    value_usd       NUMERIC(20, 4),
    pnl             NUMERIC(20, 4),
    pnl_percent     NUMERIC(10, 4),
    dex             TEXT,
    status          TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'failed')),
    block_time      TIMESTAMPTZ NOT NULL,
    slot            BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_wallet    ON transactions (wallet_address, block_time DESC);
CREATE INDEX idx_tx_type      ON transactions (type);
CREATE INDEX idx_tx_token_in  ON transactions (token_in_mint);
CREATE INDEX idx_tx_block_time ON transactions (block_time DESC);

-- ─── Token Holdings ───────────────────────────────────────────────────────────
CREATE TABLE token_holdings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address  TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
    mint            TEXT NOT NULL,
    symbol          TEXT,
    name            TEXT,
    logo_uri        TEXT,
    amount          NUMERIC(30, 10),
    ui_amount       NUMERIC(30, 10),
    decimals        INTEGER,
    price_usd       NUMERIC(20, 10),
    value_usd       NUMERIC(20, 4),
    price_change_24h NUMERIC(10, 4),
    unrealized_pnl  NUMERIC(20, 4),
    cost_basis      NUMERIC(20, 4),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (wallet_address, mint)
);

CREATE INDEX idx_holdings_wallet ON token_holdings (wallet_address);
CREATE INDEX idx_holdings_mint   ON token_holdings (mint);

-- ─── Token Cache ──────────────────────────────────────────────────────────────
CREATE TABLE tokens (
    address          TEXT PRIMARY KEY,
    symbol           TEXT,
    name             TEXT,
    logo_uri         TEXT,
    decimals         INTEGER DEFAULT 6,
    price_usd        NUMERIC(20, 10),
    price_change_1h  NUMERIC(10, 4),
    price_change_24h NUMERIC(10, 4),
    price_change_7d  NUMERIC(10, 4),
    volume_24h       NUMERIC(20, 4),
    market_cap       NUMERIC(20, 4),
    fdv              NUMERIC(20, 4),
    liquidity        NUMERIC(20, 4),
    holders          INTEGER,
    is_meme          BOOLEAN DEFAULT FALSE,
    is_scam          BOOLEAN DEFAULT FALSE,
    risk_level       TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'extreme')),
    created_at       TIMESTAMPTZ,
    indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_volume    ON tokens (volume_24h DESC);
CREATE INDEX idx_tokens_market_cap ON tokens (market_cap DESC);
CREATE INDEX idx_tokens_symbol    ON tokens USING GIN (symbol gin_trgm_ops);

-- ─── Alerts ───────────────────────────────────────────────────────────────────
CREATE TABLE alerts (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address     TEXT NOT NULL,
    alert_type         TEXT NOT NULL CHECK (alert_type IN (
                         'any-buy', 'any-sell', 'large-buy', 'large-sell', 'new-token', 'pnl-change'
                       )),
    threshold          NUMERIC(20, 4),
    channel            TEXT NOT NULL CHECK (channel IN ('telegram', 'discord', 'browser')),
    channel_config     JSONB DEFAULT '{}',
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered_at  TIMESTAMPTZ,
    trigger_count      INTEGER DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_id        ON alerts (user_id);
CREATE INDEX idx_alerts_wallet_address ON alerts (wallet_address);
CREATE INDEX idx_alerts_is_active      ON alerts (is_active) WHERE is_active = TRUE;

-- ─── Alert Events ─────────────────────────────────────────────────────────────
CREATE TABLE alert_events (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id       UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id),
    message        TEXT,
    delivered      BOOLEAN DEFAULT FALSE,
    error          TEXT,
    triggered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_events_alert_id ON alert_events (alert_id, triggered_at DESC);

-- ─── Leaderboard Snapshots ────────────────────────────────────────────────────
CREATE TABLE leaderboard_snapshots (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    period         TEXT NOT NULL CHECK (period IN ('7d', '30d', 'all')),
    rank           INTEGER NOT NULL,
    pnl            NUMERIC(20, 4),
    win_rate       NUMERIC(5, 2),
    total_trades   INTEGER,
    portfolio_value NUMERIC(20, 4),
    smart_money_score INTEGER,
    snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_period ON leaderboard_snapshots (period, rank);
CREATE INDEX idx_leaderboard_wallet ON leaderboard_snapshots (wallet_address, period);

-- ─── Subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan            TEXT NOT NULL CHECK (plan IN ('pro', 'elite')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due')),
    stripe_sub_id   TEXT UNIQUE,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Utility: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wallets_updated_at     BEFORE UPDATE ON wallets     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tokens_updated_at      BEFORE UPDATE ON tokens      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_holdings_updated_at    BEFORE UPDATE ON token_holdings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
