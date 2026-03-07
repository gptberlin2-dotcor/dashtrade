-- Runtime schema for DashTrade cloud sync API
-- Compatible with PostgreSQL 13+

CREATE TABLE IF NOT EXISTS trade_records (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_records_no
  ON trade_records (((payload->>'no')::int));
