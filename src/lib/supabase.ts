import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface StockHistoryPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Stock {
  id: string
  ticker: string
  name: string
  sector: string
  current_price: number
  previous_close: number
  variation: number
  pl: number
  pvp: number
  roe: number
  dividend_yield: number
  net_margin: number
  volume: string
  recommendation: 'COMPRAR' | 'MANTER' | 'VENDER'
  sentiment_score: number
  history: StockHistoryPoint[]
}

export interface WatchlistItem {
  id: string
  user_id: string
  stock_id: string
  created_at: string
  stock?: Stock
}

export interface PortfolioData {
  id?: string
  user_id: string
  invested_value: number
  available_balance: number
  daily_return: number
  daily_return_pct: number
  total_return: number
  total_return_pct: number
  history?: { date: string; value: number }[]
}

export interface AISignal {
  id: string
  user_id?: string | null
  ticker: string
  recommendation: 'COMPRAR' | 'MANTER' | 'VENDER'
  sentiment_score: number
  summary: string
  is_read: boolean
  created_at: string
}

export interface AIChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: string
  ticker?: string
  stock?: Stock
  recommendation?: 'COMPRAR' | 'MANTER' | 'VENDER'
  sentiment_score?: number
  fundamentalHighlights?: string[]
}

export interface AIConversation {
  id: string
  user_id: string
  ticker?: string
  snippet?: string
  messages: AIChatMessage[]
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  user_id: string
  full_name: string
  avatar_url?: string | null
  currency: 'BRL' | 'USD' | 'EUR'
  email_signals: boolean
  price_alerts: boolean
}

// Fallback seed data in case Supabase environment credentials are not populated yet
export const SEED_STOCKS: Stock[] = [
  {
    id: 'stock-petr4',
    ticker: 'PETR4',
    name: 'Petrobras PN',
    sector: 'Petróleo, Gás e Biocombustíveis',
    current_price: 38.45,
    previous_close: 37.75,
    variation: 1.85,
    pl: 4.32,
    pvp: 1.08,
    roe: 25.4,
    dividend_yield: 14.2,
    net_margin: 24.1,
    volume: 'R$ 1.85B',
    recommendation: 'COMPRAR',
    sentiment_score: 82,
    history: [
      { date: '01/05', open: 35.8, high: 36.4, low: 35.5, close: 36.1, volume: 1400000 },
      { date: '08/05', open: 36.1, high: 37.2, low: 35.9, close: 36.85, volume: 1650000 },
      { date: '15/05', open: 36.85, high: 37.5, low: 36.4, close: 37.1, volume: 1500000 },
      { date: '22/05', open: 37.1, high: 38.0, low: 36.9, close: 37.6, volume: 1800000 },
      { date: '29/05', open: 37.6, high: 38.2, low: 37.3, close: 37.75, volume: 1600000 },
      { date: '05/06', open: 37.75, high: 38.9, low: 37.7, close: 38.45, volume: 2100000 },
    ],
  },
  {
    id: 'stock-vale3',
    ticker: 'VALE3',
    name: 'Vale S.A. ON',
    sector: 'Mineração e Metais',
    current_price: 62.15,
    previous_close: 63.1,
    variation: -1.5,
    pl: 6.1,
    pvp: 1.22,
    roe: 19.8,
    dividend_yield: 7.8,
    net_margin: 21.5,
    volume: 'R$ 1.42B',
    recommendation: 'MANTER',
    sentiment_score: 54,
    history: [
      { date: '01/05', open: 64.5, high: 65.2, low: 63.8, close: 64.1, volume: 1200000 },
      { date: '08/05', open: 64.1, high: 64.8, low: 63.1, close: 63.5, volume: 1100000 },
      { date: '15/05', open: 63.5, high: 64.0, low: 62.7, close: 63.2, volume: 980000 },
      { date: '22/05', open: 63.2, high: 63.9, low: 62.4, close: 62.8, volume: 1050000 },
      { date: '29/05', open: 62.8, high: 63.4, low: 62.3, close: 63.1, volume: 1150000 },
      { date: '05/06', open: 63.1, high: 63.3, low: 61.8, close: 62.15, volume: 1320000 },
    ],
  },
  {
    id: 'stock-itub4',
    ticker: 'ITUB4',
    name: 'Itaú Unibanco PN',
    sector: 'Serviços Financeiros / Bancos',
    current_price: 35.2,
    previous_close: 34.6,
    variation: 1.73,
    pl: 8.4,
    pvp: 1.65,
    roe: 21.2,
    dividend_yield: 6.4,
    net_margin: 18.9,
    volume: 'R$ 980M',
    recommendation: 'COMPRAR',
    sentiment_score: 78,
    history: [
      { date: '01/05', open: 33.1, high: 33.8, low: 32.9, close: 33.5, volume: 950000 },
      { date: '08/05', open: 33.5, high: 34.2, low: 33.4, close: 33.9, volume: 870000 },
      { date: '15/05', open: 33.9, high: 34.4, low: 33.7, close: 34.15, volume: 890000 },
      { date: '22/05', open: 34.15, high: 34.7, low: 33.9, close: 34.3, volume: 920000 },
      { date: '29/05', open: 34.3, high: 34.9, low: 34.2, close: 34.6, volume: 940000 },
      { date: '05/06', open: 34.6, high: 35.4, low: 34.5, close: 35.2, volume: 1120000 },
    ],
  },
  {
    id: 'stock-bbdc4',
    ticker: 'BBDC4',
    name: 'Banco Bradesco PN',
    sector: 'Serviços Financeiros / Bancos',
    current_price: 14.85,
    previous_close: 14.7,
    variation: 1.02,
    pl: 9.2,
    pvp: 0.98,
    roe: 11.5,
    dividend_yield: 5.9,
    net_margin: 12.4,
    volume: 'R$ 620M',
    recommendation: 'MANTER',
    sentiment_score: 58,
    history: [
      { date: '01/05', open: 14.2, high: 14.5, low: 14.1, close: 14.3, volume: 600000 },
      { date: '08/05', open: 14.3, high: 14.65, low: 14.25, close: 14.45, volume: 580000 },
      { date: '15/05', open: 14.45, high: 14.7, low: 14.35, close: 14.55, volume: 610000 },
      { date: '22/05', open: 14.55, high: 14.8, low: 14.5, close: 14.65, volume: 640000 },
      { date: '29/05', open: 14.65, high: 14.85, low: 14.6, close: 14.7, volume: 590000 },
      { date: '05/06', open: 14.7, high: 15.0, low: 14.65, close: 14.85, volume: 720000 },
    ],
  },
  {
    id: 'stock-wege3',
    ticker: 'WEGE3',
    name: 'WEG S.A. ON',
    sector: 'Bens Industriais / Máquinas',
    current_price: 51.4,
    previous_close: 50.2,
    variation: 2.39,
    pl: 28.5,
    pvp: 7.4,
    roe: 28.9,
    dividend_yield: 1.9,
    net_margin: 17.2,
    volume: 'R$ 510M',
    recommendation: 'COMPRAR',
    sentiment_score: 86,
    history: [
      { date: '01/05', open: 47.8, high: 48.6, low: 47.5, close: 48.2, volume: 450000 },
      { date: '08/05', open: 48.2, high: 49.3, low: 48.1, close: 48.9, volume: 490000 },
      { date: '15/05', open: 48.9, high: 49.8, low: 48.7, close: 49.4, volume: 520000 },
      { date: '22/05', open: 49.4, high: 50.1, low: 49.2, close: 49.8, volume: 510000 },
      { date: '29/05', open: 49.8, high: 50.6, low: 49.7, close: 50.2, volume: 530000 },
      { date: '05/06', open: 50.2, high: 51.9, low: 50.1, close: 51.4, volume: 680000 },
    ],
  },
  {
    id: 'stock-bbas3',
    ticker: 'BBAS3',
    name: 'Banco do Brasil ON',
    sector: 'Serviços Financeiros / Bancos',
    current_price: 28.9,
    previous_close: 28.5,
    variation: 1.4,
    pl: 4.5,
    pvp: 0.88,
    roe: 21.8,
    dividend_yield: 9.6,
    net_margin: 16.4,
    volume: 'R$ 740M',
    recommendation: 'COMPRAR',
    sentiment_score: 80,
    history: [
      { date: '01/05', open: 27.2, high: 27.8, low: 26.9, close: 27.5, volume: 680000 },
      { date: '08/05', open: 27.5, high: 28.1, low: 27.4, close: 27.9, volume: 710000 },
      { date: '15/05', open: 27.9, high: 28.4, low: 27.7, close: 28.1, volume: 690000 },
      { date: '22/05', open: 28.1, high: 28.6, low: 27.95, close: 28.3, volume: 720000 },
      { date: '29/05', open: 28.3, high: 28.75, low: 28.2, close: 28.5, volume: 740000 },
      { date: '05/06', open: 28.5, high: 29.1, low: 28.4, close: 28.9, volume: 890000 },
    ],
  },
  {
    id: 'stock-abev3',
    ticker: 'ABEV3',
    name: 'Ambev S.A. ON',
    sector: 'Consumo Não Cíclico / Bebidas',
    current_price: 12.3,
    previous_close: 12.45,
    variation: -1.2,
    pl: 13.4,
    pvp: 2.1,
    roe: 16.2,
    dividend_yield: 5.4,
    net_margin: 17.8,
    volume: 'R$ 410M',
    recommendation: 'MANTER',
    sentiment_score: 49,
    history: [
      { date: '01/05', open: 12.8, high: 12.95, low: 12.6, close: 12.7, volume: 430000 },
      { date: '08/05', open: 12.7, high: 12.8, low: 12.5, close: 12.6, volume: 390000 },
      { date: '15/05', open: 12.6, high: 12.75, low: 12.45, close: 12.55, volume: 405000 },
      { date: '22/05', open: 12.55, high: 12.65, low: 12.4, close: 12.5, volume: 380000 },
      { date: '29/05', open: 12.5, high: 12.6, low: 12.35, close: 12.45, volume: 410000 },
      { date: '05/06', open: 12.45, high: 12.55, low: 12.2, close: 12.3, volume: 490000 },
    ],
  },
  {
    id: 'stock-mglu3',
    ticker: 'MGLU3',
    name: 'Magazine Luiza ON',
    sector: 'Consumo Cíclico / Comércio Varejista',
    current_price: 10.15,
    previous_close: 10.7,
    variation: -5.14,
    pl: -18.2,
    pvp: 0.92,
    roe: -4.8,
    dividend_yield: 0.0,
    net_margin: -1.5,
    volume: 'R$ 380M',
    recommendation: 'VENDER',
    sentiment_score: 28,
    history: [
      { date: '01/05', open: 11.8, high: 12.1, low: 11.5, close: 11.6, volume: 520000 },
      { date: '08/05', open: 11.6, high: 11.75, low: 11.2, close: 11.35, volume: 480000 },
      { date: '15/05', open: 11.35, high: 11.5, low: 10.9, close: 11.1, volume: 510000 },
      { date: '22/05', open: 11.1, high: 11.3, low: 10.8, close: 10.95, volume: 490000 },
      { date: '29/05', open: 10.95, high: 11.05, low: 10.5, close: 10.7, volume: 550000 },
      { date: '05/06', open: 10.7, high: 10.75, low: 10.0, close: 10.15, volume: 670000 },
    ],
  },
  {
    id: 'stock-b3sa3',
    ticker: 'B3SA3',
    name: 'B3 S.A. ON',
    sector: 'Serviços Financeiros / Bolsa',
    current_price: 11.9,
    previous_close: 11.75,
    variation: 1.28,
    pl: 14.2,
    pvp: 2.85,
    roe: 20.4,
    dividend_yield: 6.1,
    net_margin: 42.5,
    volume: 'R$ 490M',
    recommendation: 'MANTER',
    sentiment_score: 64,
    history: [
      { date: '01/05', open: 11.4, high: 11.7, low: 11.3, close: 11.55, volume: 430000 },
      { date: '08/05', open: 11.55, high: 11.8, low: 11.45, close: 11.65, volume: 410000 },
      { date: '15/05', open: 11.65, high: 11.85, low: 11.5, close: 11.7, volume: 425000 },
      { date: '22/05', open: 11.7, high: 11.9, low: 11.6, close: 11.72, volume: 405000 },
      { date: '29/05', open: 11.72, high: 11.85, low: 11.65, close: 11.75, volume: 440000 },
      { date: '05/06', open: 11.75, high: 12.05, low: 11.7, close: 11.9, volume: 520000 },
    ],
  },
  {
    id: 'stock-itsa4',
    ticker: 'ITSA4',
    name: 'Itaúsa PN',
    sector: 'Holdings Financeiras',
    current_price: 10.45,
    previous_close: 10.35,
    variation: 0.97,
    pl: 6.8,
    pvp: 1.15,
    roe: 18.5,
    dividend_yield: 8.3,
    net_margin: 35.2,
    volume: 'R$ 310M',
    recommendation: 'COMPRAR',
    sentiment_score: 75,
    history: [
      { date: '01/05', open: 10.05, high: 10.25, low: 9.95, close: 10.15, volume: 290000 },
      { date: '08/05', open: 10.15, high: 10.3, low: 10.1, close: 10.22, volume: 275000 },
      { date: '15/05', open: 10.22, high: 10.35, low: 10.15, close: 10.28, volume: 285000 },
      { date: '22/05', open: 10.28, high: 10.4, low: 10.2, close: 10.32, volume: 300000 },
      { date: '29/05', open: 10.32, high: 10.42, low: 10.25, close: 10.35, volume: 310000 },
      { date: '05/06', open: 10.35, high: 10.55, low: 10.3, close: 10.45, volume: 360000 },
    ],
  },
]

export const SEED_SIGNALS: AISignal[] = [
  {
    id: 'sig-1',
    ticker: 'PETR4',
    recommendation: 'COMPRAR',
    sentiment_score: 82,
    summary:
      'Fluxo estrangeiro consistente e dividend yield atrativo de 14.2% a.a. sustentam viés de alta.',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: 'sig-2',
    ticker: 'WEGE3',
    recommendation: 'COMPRAR',
    sentiment_score: 86,
    summary:
      'Receitas externas e demanda por transição energética aceleram crescimento acima do consenso.',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 'sig-3',
    ticker: 'MGLU3',
    recommendation: 'VENDER',
    sentiment_score: 28,
    summary:
      'Pressão de juros futuros e compressão de margens de varejo mantêm risco elevado no curto prazo.',
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
  },
]

// Supabase client instance
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-pulse-equity.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key'

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('mock-pulse-equity'),
)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
