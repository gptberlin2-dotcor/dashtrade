-- DashTrade PostgreSQL schema
-- Purpose: persist trades, psychology review, checklist validation, and trade images.

-- Extension for UUID generation (PostgreSQL 13+)
create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique,
  display_name varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,

  trade_no int not null,
  trade_date date not null,
  pair varchar(30) not null,
  action varchar(10) not null check (action in ('Buy', 'Sell')),
  tf varchar(20),
  setup_type varchar(120),
  market_context text,

  entry numeric(20,8),
  sl numeric(20,8),
  tp numeric(20,8),
  rr numeric(10,4),
  leverage numeric(10,2),

  result text,
  pnl numeric(20,8) not null default 0,
  win_loss varchar(20) not null check (win_loss in ('WIN', 'LOSE', 'ON GOING')),
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_trades_user_trade_no
  on trades (user_id, trade_no);

create index if not exists idx_trades_trade_date_desc
  on trades (trade_date desc);

create index if not exists idx_trades_created_at_desc
  on trades (created_at desc);

create index if not exists idx_trades_pair
  on trades (pair);

create table if not exists trade_psychology (
  trade_id uuid primary key references trades(id) on delete cascade,
  emotion varchar(30),
  confidence int check (confidence between 1 and 10),
  discipline varchar(60)
);

create table if not exists trade_checklists (
  trade_id uuid primary key references trades(id) on delete cascade,

  rsi boolean not null default false,
  macd boolean not null default false,
  structure boolean not null default false,
  support_resistance boolean not null default false,
  liquidity boolean not null default false,
  volume boolean not null default false,

  score smallint not null default 0 check (score between 0 and 6),
  rating varchar(20) not null default 'Invalid'
    check (rating in ('Strong setup', 'Valid setup', 'Partial', 'Invalid'))
);

create table if not exists trade_images (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trades(id) on delete cascade,

  storage_provider varchar(30) not null default 's3',
  storage_bucket varchar(100) not null,
  storage_key varchar(255) not null unique,
  public_url text not null,

  mime_type varchar(100),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_trade_images_trade_id
  on trade_images (trade_id);

-- Optional trigger for updated_at consistency.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_app_users_updated_at on app_users;
create trigger trg_app_users_updated_at
before update on app_users
for each row execute function set_updated_at();

drop trigger if exists trg_trades_updated_at on trades;
create trigger trg_trades_updated_at
before update on trades
for each row execute function set_updated_at();
