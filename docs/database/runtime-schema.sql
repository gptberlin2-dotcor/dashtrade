-- Runtime schema for DashTrade cloud sync API
-- Compatible with PostgreSQL 13+

CREATE TABLE IF NOT EXISTS trade_records (
  user_id TEXT NOT NULL DEFAULT 'default',
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE trade_records
  ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trade_records_pkey'
      AND conrelid = 'trade_records'::regclass
  ) THEN
    ALTER TABLE trade_records DROP CONSTRAINT trade_records_pkey;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE trade_records
  ADD CONSTRAINT trade_records_pkey PRIMARY KEY (user_id, id);

CREATE INDEX IF NOT EXISTS idx_trade_records_user_no
  ON trade_records (user_id, ((payload->>'no')::int));
