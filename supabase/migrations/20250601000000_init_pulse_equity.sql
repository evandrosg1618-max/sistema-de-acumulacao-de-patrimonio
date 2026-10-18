-- ============================================================================
-- Pulse Equity - Supabase Database Schema, Row-Level Security and Initial Seeds
-- ============================================================================

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text default null,
  currency text not null default 'BRL',
  email_signals boolean not null default true,
  price_alerts boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Stocks master catalog (B3 stocks with historical pricing & metrics)
create table if not exists public.stocks (
  id uuid primary key default uuid_generate_v4(),
  ticker varchar(10) unique not null,
  name text not null,
  sector text not null,
  current_price numeric(12, 2) not null,
  previous_close numeric(12, 2) not null,
  variation numeric(6, 2) not null default 0.0,
  pl numeric(8, 2) not null default 0.0,
  pvp numeric(8, 2) not null default 0.0,
  roe numeric(8, 2) not null default 0.0,
  dividend_yield numeric(8, 2) not null default 0.0,
  net_margin numeric(8, 2) not null default 0.0,
  volume text not null default 'R$ 0M',
  recommendation text not null check (recommendation in ('COMPRAR', 'MANTER', 'VENDER')),
  sentiment_score integer not null default 50 check (sentiment_score between 0 and 100),
  history jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. User Watchlist
create table if not exists public.watchlist (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, stock_id)
);

-- 5. User Portfolio
create table if not exists public.portfolio (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  invested_value numeric(14, 2) not null default 124580.00,
  available_balance numeric(14, 2) not null default 18420.50,
  daily_return numeric(10, 2) not null default 1845.20,
  daily_return_pct numeric(6, 2) not null default 1.32,
  total_return numeric(12, 2) not null default 32890.40,
  total_return_pct numeric(6, 2) not null default 26.40,
  history jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. AI Signals (market & stock signals)
create table if not exists public.ai_signals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  ticker varchar(10) not null,
  recommendation text not null check (recommendation in ('COMPRAR', 'MANTER', 'VENDER')),
  sentiment_score integer not null check (sentiment_score between 0 and 100),
  summary text not null,
  is_read boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. AI Conversations
create table if not exists public.ai_conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  ticker varchar(10) default null,
  snippet text default null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.stocks enable row level security;
alter table public.watchlist enable row level security;
alter table public.portfolio enable row level security;
alter table public.ai_signals enable row level security;
alter table public.ai_conversations enable row level security;

-- PROFILES policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

-- STOCKS policies (read public/authenticated, write admin only)
create policy "Anyone authenticated can view stocks"
  on public.stocks for select
  using (true);

-- WATCHLIST policies
create policy "Users can view their own watchlist"
  on public.watchlist for select
  using (auth.uid() = user_id);

create policy "Users can add to their own watchlist"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

create policy "Users can delete from their own watchlist"
  on public.watchlist for delete
  using (auth.uid() = user_id);

-- PORTFOLIO policies
create policy "Users can view their own portfolio"
  on public.portfolio for select
  using (auth.uid() = user_id);

create policy "Users can insert their own portfolio"
  on public.portfolio for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own portfolio"
  on public.portfolio for update
  using (auth.uid() = user_id);

-- AI SIGNALS policies
create policy "Users can view their own signals or global signals"
  on public.ai_signals for select
  using (user_id is null or auth.uid() = user_id);

create policy "Users can update their own signals (mark read)"
  on public.ai_signals for update
  using (auth.uid() = user_id);

-- AI CONVERSATIONS policies
create policy "Users can view their own conversations"
  on public.ai_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on public.ai_conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on public.ai_conversations for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- Profile Creation Trigger on Auth Signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Investidor Pulse'),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.portfolio (user_id, invested_value, available_balance, daily_return, daily_return_pct, total_return, total_return_pct)
  values (new.id, 142500.00, 18240.00, 2150.40, 1.53, 38450.00, 26.98);

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Seed Stocks Data (Top B3 Tickers with Historical K-Line and Fundamentals)
-- ============================================================================
insert into public.stocks (ticker, name, sector, current_price, previous_close, variation, pl, pvp, roe, dividend_yield, net_margin, volume, recommendation, sentiment_score, history)
values
(
  'PETR4',
  'Petrobras PN',
  'Petróleo, Gás e Biocombustíveis',
  38.45,
  37.75,
  1.85,
  4.32,
  1.08,
  25.40,
  14.20,
  24.10,
  'R$ 1.85B',
  'COMPRAR',
  82,
  '[
    {"date": "2025-05-01", "open": 35.80, "high": 36.40, "low": 35.50, "close": 36.10, "volume": 1400000},
    {"date": "2025-05-08", "open": 36.10, "high": 37.20, "low": 35.90, "close": 36.85, "volume": 1650000},
    {"date": "2025-05-15", "open": 36.85, "high": 37.50, "low": 36.40, "close": 37.10, "volume": 1500000},
    {"date": "2025-05-22", "open": 37.10, "high": 38.00, "low": 36.90, "close": 37.60, "volume": 1800000},
    {"date": "2025-05-29", "open": 37.60, "high": 38.20, "low": 37.30, "close": 37.75, "volume": 1600000},
    {"date": "2025-06-05", "open": 37.75, "high": 38.90, "low": 37.70, "close": 38.45, "volume": 2100000}
  ]'::jsonb
),
(
  'VALE3',
  'Vale S.A. ON',
  'Mineração e Metais',
  62.15,
  63.10,
  -1.50,
  6.10,
  1.22,
  19.80,
  7.80,
  21.50,
  'R$ 1.42B',
  'MANTER',
  54,
  '[
    {"date": "2025-05-01", "open": 64.50, "high": 65.20, "low": 63.80, "close": 64.10, "volume": 1200000},
    {"date": "2025-05-08", "open": 64.10, "high": 64.80, "low": 63.10, "close": 63.50, "volume": 1100000},
    {"date": "2025-05-15", "open": 63.50, "high": 64.00, "low": 62.70, "close": 63.20, "volume": 980000},
    {"date": "2025-05-22", "open": 63.20, "high": 63.90, "low": 62.40, "close": 62.80, "volume": 1050000},
    {"date": "2025-05-29", "open": 62.80, "high": 63.40, "low": 62.30, "close": 63.10, "volume": 1150000},
    {"date": "2025-06-05", "open": 63.10, "high": 63.30, "low": 61.80, "close": 62.15, "volume": 1320000}
  ]'::jsonb
),
(
  'ITUB4',
  'Itaú Unibanco PN',
  'Serviços Financeiros / Bancos',
  35.20,
  34.60,
  1.73,
  8.40,
  1.65,
  21.20,
  6.40,
  18.90,
  'R$ 980M',
  'COMPRAR',
  78,
  '[
    {"date": "2025-05-01", "open": 33.10, "high": 33.80, "low": 32.90, "close": 33.50, "volume": 950000},
    {"date": "2025-05-08", "open": 33.50, "high": 34.20, "low": 33.40, "close": 33.90, "volume": 870000},
    {"date": "2025-05-15", "open": 33.90, "high": 34.40, "low": 33.70, "close": 34.15, "volume": 890000},
    {"date": "2025-05-22", "open": 34.15, "high": 34.70, "low": 33.90, "close": 34.30, "volume": 920000},
    {"date": "2025-05-29", "open": 34.30, "high": 34.90, "low": 34.20, "close": 34.60, "volume": 940000},
    {"date": "2025-06-05", "open": 34.60, "high": 35.40, "low": 34.50, "close": 35.20, "volume": 1120000}
  ]'::jsonb
),
(
  'BBDC4',
  'Banco Bradesco PN',
  'Serviços Financeiros / Bancos',
  14.85,
  14.70,
  1.02,
  9.20,
  0.98,
  11.50,
  5.90,
  12.40,
  'R$ 620M',
  'MANTER',
  58,
  '[
    {"date": "2025-05-01", "open": 14.20, "high": 14.50, "low": 14.10, "close": 14.30, "volume": 600000},
    {"date": "2025-05-08", "open": 14.30, "high": 14.65, "low": 14.25, "close": 14.45, "volume": 580000},
    {"date": "2025-05-15", "open": 14.45, "high": 14.70, "low": 14.35, "close": 14.55, "volume": 610000},
    {"date": "2025-05-22", "open": 14.55, "high": 14.80, "low": 14.50, "close": 14.65, "volume": 640000},
    {"date": "2025-05-29", "open": 14.65, "high": 14.85, "low": 14.60, "close": 14.70, "volume": 590000},
    {"date": "2025-06-05", "open": 14.70, "high": 15.00, "low": 14.65, "close": 14.85, "volume": 720000}
  ]'::jsonb
),
(
  'WEGE3',
  'WEG S.A. ON',
  'Bens Industriais / Máquinas',
  51.40,
  50.20,
  2.39,
  28.50,
  7.40,
  28.90,
  1.90,
  17.20,
  'R$ 510M',
  'COMPRAR',
  86,
  '[
    {"date": "2025-05-01", "open": 47.80, "high": 48.60, "low": 47.50, "close": 48.20, "volume": 450000},
    {"date": "2025-05-08", "open": 48.20, "high": 49.30, "low": 48.10, "close": 48.90, "volume": 490000},
    {"date": "2025-05-15", "open": 48.90, "high": 49.80, "low": 48.70, "close": 49.40, "volume": 520000},
    {"date": "2025-05-22", "open": 49.40, "high": 50.10, "low": 49.20, "close": 49.80, "volume": 510000},
    {"date": "2025-05-29", "open": 49.80, "high": 50.60, "low": 49.70, "close": 50.20, "volume": 530000},
    {"date": "2025-06-05", "open": 50.20, "high": 51.90, "low": 50.10, "close": 51.40, "volume": 680000}
  ]'::jsonb
),
(
  'BBAS3',
  'Banco do Brasil ON',
  'Serviços Financeiros / Bancos',
  28.90,
  28.50,
  1.40,
  4.50,
  0.88,
  21.80,
  9.60,
  16.40,
  'R$ 740M',
  'COMPRAR',
  80,
  '[
    {"date": "2025-05-01", "open": 27.20, "high": 27.80, "low": 26.90, "close": 27.50, "volume": 680000},
    {"date": "2025-05-08", "open": 27.50, "high": 28.10, "low": 27.40, "close": 27.90, "volume": 710000},
    {"date": "2025-05-15", "open": 27.90, "high": 28.40, "low": 27.70, "close": 28.10, "volume": 690000},
    {"date": "2025-05-22", "open": 28.10, "high": 28.60, "low": 27.95, "close": 28.30, "volume": 720000},
    {"date": "2025-05-29", "open": 28.30, "high": 28.75, "low": 28.20, "close": 28.50, "volume": 740000},
    {"date": "2025-06-05", "open": 28.50, "high": 29.10, "low": 28.40, "close": 28.90, "volume": 890000}
  ]'::jsonb
),
(
  'ABEV3',
  'Ambev S.A. ON',
  'Consumo Não Cíclico / Bebidas',
  12.30,
  12.45,
  -1.20,
  13.40,
  2.10,
  16.20,
  5.40,
  17.80,
  'R$ 410M',
  'MANTER',
  49,
  '[
    {"date": "2025-05-01", "open": 12.80, "high": 12.95, "low": 12.60, "close": 12.70, "volume": 430000},
    {"date": "2025-05-08", "open": 12.70, "high": 12.80, "low": 12.50, "close": 12.60, "volume": 390000},
    {"date": "2025-05-15", "open": 12.60, "high": 12.75, "low": 12.45, "close": 12.55, "volume": 405000},
    {"date": "2025-05-22", "open": 12.55, "high": 12.65, "low": 12.40, "close": 12.50, "volume": 380000},
    {"date": "2025-05-29", "open": 12.50, "high": 12.60, "low": 12.35, "close": 12.45, "volume": 410000},
    {"date": "2025-06-05", "open": 12.45, "high": 12.55, "low": 12.20, "close": 12.30, "volume": 490000}
  ]'::jsonb
),
(
  'MGLU3',
  'Magazine Luiza ON',
  'Consumo Cíclico / Comércio Varejista',
  10.15,
  10.70,
  -5.14,
  -18.20,
  0.92,
  -4.80,
  0.00,
  -1.50,
  'R$ 380M',
  'VENDER',
  28,
  '[
    {"date": "2025-05-01", "open": 11.80, "high": 12.10, "low": 11.50, "close": 11.60, "volume": 520000},
    {"date": "2025-05-08", "open": 11.60, "high": 11.75, "low": 11.20, "close": 11.35, "volume": 480000},
    {"date": "2025-05-15", "open": 11.35, "high": 11.50, "low": 10.90, "close": 11.10, "volume": 510000},
    {"date": "2025-05-22", "open": 11.10, "high": 11.30, "low": 10.80, "close": 10.95, "volume": 490000},
    {"date": "2025-05-29", "open": 10.95, "high": 11.05, "low": 10.50, "close": 10.70, "volume": 550000},
    {"date": "2025-06-05", "open": 10.70, "high": 10.75, "low": 10.00, "close": 10.15, "volume": 670000}
  ]'::jsonb
),
(
  'B3SA3',
  'B3 S.A. ON',
  'Serviços Financeiros / Bolsa',
  11.90,
  11.75,
  1.28,
  14.20,
  2.85,
  20.40,
  6.10,
  42.50,
  'R$ 490M',
  'MANTER',
  64,
  '[
    {"date": "2025-05-01", "open": 11.40, "high": 11.70, "low": 11.30, "close": 11.55, "volume": 430000},
    {"date": "2025-05-08", "open": 11.55, "high": 11.80, "low": 11.45, "close": 11.65, "volume": 410000},
    {"date": "2025-05-15", "open": 11.65, "high": 11.85, "low": 11.50, "close": 11.70, "volume": 425000},
    {"date": "2025-05-22", "open": 11.70, "high": 11.90, "low": 11.60, "close": 11.72, "volume": 405000},
    {"date": "2025-05-29", "open": 11.72, "high": 11.85, "low": 11.65, "close": 11.75, "volume": 440000},
    {"date": "2025-06-05", "open": 11.75, "high": 12.05, "low": 11.70, "close": 11.90, "volume": 520000}
  ]'::jsonb
),
(
  'ITSA4',
  'Itaúsa PN',
  'Holdings Financeiras',
  10.45,
  10.35,
  0.97,
  6.80,
  1.15,
  18.50,
  8.30,
  35.20,
  'R$ 310M',
  'COMPRAR',
  75,
  '[
    {"date": "2025-05-01", "open": 10.05, "high": 10.25, "low": 9.95, "close": 10.15, "volume": 290000},
    {"date": "2025-05-08", "open": 10.15, "high": 10.30, "low": 10.10, "close": 10.22, "volume": 275000},
    {"date": "2025-05-15", "open": 10.22, "high": 10.35, "low": 10.15, "close": 10.28, "volume": 285000},
    {"date": "2025-05-22", "open": 10.28, "high": 10.40, "low": 10.20, "close": 10.32, "volume": 300000},
    {"date": "2025-05-29", "open": 10.32, "high": 10.42, "low": 10.25, "close": 10.35, "volume": 310000},
    {"date": "2025-06-05", "open": 10.35, "high": 10.55, "low": 10.30, "close": 10.45, "volume": 360000}
  ]'::jsonb
)
on conflict (ticker) do update set
  current_price = excluded.current_price,
  previous_close = excluded.previous_close,
  variation = excluded.variation,
  pl = excluded.pl,
  pvp = excluded.pvp,
  roe = excluded.roe,
  dividend_yield = excluded.dividend_yield,
  net_margin = excluded.net_margin,
  volume = excluded.volume,
  recommendation = excluded.recommendation,
  sentiment_score = excluded.sentiment_score,
  history = excluded.history;
