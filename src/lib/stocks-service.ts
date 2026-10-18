import {
  supabase,
  isSupabaseConfigured,
  Stock,
  SEED_STOCKS,
  WatchlistItem,
  PortfolioData,
  AISignal,
  SEED_SIGNALS,
  AIConversation,
  AIChatMessage,
  UserProfile,
} from './supabase'

const LOCAL_STORAGE_WATCHLIST_KEY = 'pulse_equity_watchlist_v1'
const LOCAL_STORAGE_CONVERSATIONS_KEY = 'pulse_equity_conversations_v1'
const LOCAL_STORAGE_PORTFOLIO_KEY = 'pulse_equity_portfolio_v1'
const LOCAL_STORAGE_PROFILE_KEY = 'pulse_equity_profile_v1'

// Helper for local mock storage
function getLocalItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setLocalItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

// -----------------------------------------------------------------------------
// Stocks API
// -----------------------------------------------------------------------------
export async function getStocks(): Promise<Stock[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('stocks')
        .select('*')
        .order('ticker', { ascending: true })

      if (!error && data && data.length > 0) {
        return data as Stock[]
      }
    } catch (err) {
      console.warn('Supabase stocks fetch failed, falling back to seed stocks', err)
    }
  }
  return SEED_STOCKS
}

export async function getStockByTicker(ticker: string): Promise<Stock | null> {
  const normalized = ticker.toUpperCase().trim()
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('stocks')
        .select('*')
        .eq('ticker', normalized)
        .maybeSingle()

      if (!error && data) {
        return data as Stock
      }
    } catch {
      // fallback
    }
  }
  return SEED_STOCKS.find((s) => s.ticker === normalized) || null
}

// -----------------------------------------------------------------------------
// Watchlist API
// -----------------------------------------------------------------------------
export async function getUserWatchlist(userId: string): Promise<Stock[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select(`
          id,
          user_id,
          stock_id,
          stocks (*)
        `)
        .eq('user_id', userId)

      if (!error && data) {
        const stocks: Stock[] = []
        for (const row of data as any[]) {
          if (row.stocks) {
            stocks.push(row.stocks as Stock)
          }
        }
        return stocks
      }
    } catch (err) {
      console.warn('Supabase watchlist fetch failed, using local storage', err)
    }
  }

  // Local fallback
  const userKey = `${LOCAL_STORAGE_WATCHLIST_KEY}_${userId}`
  const savedTickerIds = getLocalItem<string[]>(userKey, ['PETR4', 'VALE3', 'ITUB4', 'WEGE3'])
  const allStocks = SEED_STOCKS
  return allStocks.filter((s) => savedTickerIds.includes(s.ticker))
}

export async function addToWatchlist(userId: string, stock: Stock): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('watchlist').insert({
        user_id: userId,
        stock_id: stock.id,
      })
      if (!error) return true
    } catch {
      // fallback
    }
  }

  const userKey = `${LOCAL_STORAGE_WATCHLIST_KEY}_${userId}`
  const current = getLocalItem<string[]>(userKey, ['PETR4', 'VALE3', 'ITUB4', 'WEGE3'])
  if (!current.includes(stock.ticker)) {
    setLocalItem(userKey, [...current, stock.ticker])
  }
  return true
}

export async function removeFromWatchlist(userId: string, ticker: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const targetStock = await getStockByTicker(ticker)
      if (targetStock) {
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', userId)
          .eq('stock_id', targetStock.id)
        if (!error) return true
      }
    } catch {
      // fallback
    }
  }

  const userKey = `${LOCAL_STORAGE_WATCHLIST_KEY}_${userId}`
  const current = getLocalItem<string[]>(userKey, ['PETR4', 'VALE3', 'ITUB4', 'WEGE3'])
  setLocalItem(
    userKey,
    current.filter((t) => t !== ticker),
  )
  return true
}

// -----------------------------------------------------------------------------
// Portfolio API
// -----------------------------------------------------------------------------
export async function getUserPortfolio(userId: string): Promise<PortfolioData> {
  const defaultPortfolio: PortfolioData = {
    user_id: userId,
    invested_value: 142580.0,
    available_balance: 18420.5,
    daily_return: 2150.4,
    daily_return_pct: 1.53,
    total_return: 38450.0,
    total_return_pct: 26.98,
    history: [
      { date: '10 Mai', value: 132400 },
      { date: '15 Mai', value: 134100 },
      { date: '20 Mai', value: 133200 },
      { date: '25 Mai', value: 137800 },
      { date: '30 Mai', value: 139500 },
      { date: '05 Jun', value: 141200 },
      { date: '12 Jun', value: 142580 },
    ],
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('portfolio')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (!error && data) {
        return {
          ...defaultPortfolio,
          ...data,
        }
      }
    } catch {
      // fallback
    }
  }

  const userKey = `${LOCAL_STORAGE_PORTFOLIO_KEY}_${userId}`
  return getLocalItem<PortfolioData>(userKey, defaultPortfolio)
}

// -----------------------------------------------------------------------------
// Signals API
// -----------------------------------------------------------------------------
export async function getAISignals(userId?: string): Promise<AISignal[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('ai_signals').select('*').order('created_at', { ascending: false })
      if (userId) {
        query = query.or(`user_id.is.null,user_id.eq.${userId}`)
      }
      const { data, error } = await query
      if (!error && data && data.length > 0) {
        return data as AISignal[]
      }
    } catch {
      // fallback
    }
  }
  return SEED_SIGNALS
}

// -----------------------------------------------------------------------------
// AI Chat Engine & History
// -----------------------------------------------------------------------------
export function analyzeStockMessage(
  userText: string,
  stocks: Stock[],
): {
  detectedTicker: string | null
  stock: Stock | null
  replyText: string
  recommendation: 'COMPRAR' | 'MANTER' | 'VENDER'
  sentimentScore: number
  highlights: string[]
} {
  // Regex pattern for B3 tickers: 4 capital letters followed by 1-2 numbers
  const match = userText.toUpperCase().match(/\b([A-Z]{4}[0-9]{1,2})\b/)
  const ticker = match ? match[1] : null

  if (ticker) {
    const stock = stocks.find((s) => s.ticker === ticker) || null
    if (stock) {
      const rec = stock.recommendation
      const sent = stock.sentiment_score
      const plText =
        stock.pl > 0
          ? `P/L de ${stock.pl.toFixed(1)}x projeta valuation ${stock.pl < 12 ? 'descontado em relação à média histórica' : 'justo pelo patamar de crescimento'}`
          : `P/L negativo reflete compressão recente de resultados contábeis`
      const dyText = `Dividend Yield em ${stock.dividend_yield.toFixed(1)}% nos últimos 12 meses`
      const roeText = `Retorno sobre patrimônio (ROE) de ${stock.roe.toFixed(1)}% demonstra resiliência operacional`

      const highlights = [plText, dyText, roeText]

      const reply = `Análise quantitativa e fundamentalista consolidada para **${stock.ticker} (${stock.name})**:\n\nO ativo encerrou negociado a **R$ ${stock.current_price.toFixed(2)}** (${stock.variation >= 0 ? '+' : ''}${stock.variation.toFixed(2)}%). A leitura algorítmica de fluxo e múltiplos sugere recomendação de **${rec}**, com pontuação de sentimento calculada em **${sent}/100**.`

      return {
        detectedTicker: stock.ticker,
        stock,
        replyText: reply,
        recommendation: rec,
        sentimentScore: sent,
        highlights,
      }
    }
  }

  // Generic market response
  return {
    detectedTicker: null,
    stock: null,
    replyText:
      'Identifiquei seu interesse nas tendências gerais do mercado. O Ibovespa consolida momento técnico com suporte forte e apetite moderado ao risco. Para uma análise minuciosa com múltiplos e K-line, cite qualquer ticker da B3 como PETR4, VALE3, ITUB4, WEGE3 ou BBAS3.',
    recommendation: 'MANTER',
    sentimentScore: 65,
    highlights: [
      'Fluxo de capital institucional positivo no fechamento semanal',
      'Curva de juros futuros apresenta acomodação favorável aos múltiplos de bolsa',
      'Setores bancário e de commodities continuam como âncoras de liquidez',
    ],
  }
}

export async function getUserConversations(userId: string): Promise<AIConversation[]> {
  const defaultConv: AIConversation = {
    id: 'conv-init-1',
    user_id: userId,
    ticker: 'PETR4',
    snippet: 'Análise completa de PETR4 e momento de entrada',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    messages: [
      {
        id: 'msg-1',
        sender: 'user',
        text: 'Qual o momento de compra da PETR4?',
        timestamp: '14:20',
      },
      {
        id: 'msg-2',
        sender: 'ai',
        text: 'Análise quantitativa consolidada para **PETR4 (Petrobras PN)**:\n\nO ativo encerrou negociado a **R$ 38.45** (+1.85%). A leitura algorítmica de fluxo e múltiplos sugere recomendação de **COMPRAR**, com pontuação de sentimento calculada em **82/100**.',
        timestamp: '14:21',
        ticker: 'PETR4',
        stock: SEED_STOCKS[0],
        recommendation: 'COMPRAR',
        sentiment_score: 82,
        fundamentalHighlights: [
          'P/L de 4.3x projeta valuation extremamente atrativo',
          'Dividend Yield consistente em 14.2% ao ano',
          'Geração de caixa livre resiliente mesmo com volatilidade do Brent',
        ],
      },
    ],
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (!error && data && data.length > 0) {
        return data as AIConversation[]
      }
    } catch {
      // fallback
    }
  }

  const userKey = `${LOCAL_STORAGE_CONVERSATIONS_KEY}_${userId}`
  return getLocalItem<AIConversation[]>(userKey, [defaultConv])
}

export async function saveUserConversations(
  userId: string,
  conversations: AIConversation[],
): Promise<void> {
  if (isSupabaseConfigured && conversations.length > 0) {
    try {
      const latest = conversations[0]
      await supabase.from('ai_conversations').upsert({
        id: latest.id.startsWith('conv-') ? undefined : latest.id,
        user_id: userId,
        ticker: latest.ticker,
        snippet: latest.snippet,
        messages: latest.messages,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // ignore
    }
  }

  const userKey = `${LOCAL_STORAGE_CONVERSATIONS_KEY}_${userId}`
  setLocalItem(userKey, conversations)
}

// -----------------------------------------------------------------------------
// User Profile API
// -----------------------------------------------------------------------------
export async function getUserProfile(userId: string, userEmail: string): Promise<UserProfile> {
  const defaultProfile: UserProfile = {
    id: `prof-${userId}`,
    user_id: userId,
    full_name: 'Investidor Pulse',
    avatar_url: null,
    currency: 'BRL',
    email_signals: true,
    price_alerts: true,
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (!error && data) {
        return {
          ...defaultProfile,
          ...data,
        }
      }
    } catch {
      // fallback
    }
  }

  const userKey = `${LOCAL_STORAGE_PROFILE_KEY}_${userId}`
  return getLocalItem<UserProfile>(userKey, defaultProfile)
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>,
): Promise<UserProfile> {
  const current = await getUserProfile(userId, '')
  const updated = { ...current, ...updates }

  if (isSupabaseConfigured) {
    try {
      await supabase.from('profiles').upsert({
        user_id: userId,
        ...updated,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // fallback
    }
  }

  const userKey = `${LOCAL_STORAGE_PROFILE_KEY}_${userId}`
  setLocalItem(userKey, updated)
  return updated
}
