import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Bot,
  ChevronRight,
  Activity,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useAuth } from '@/contexts/AuthContext'
import {
  getUserPortfolio,
  getUserWatchlist,
  getAISignals,
  getUserConversations,
  getStocks,
} from '@/lib/stocks-service'
import { PortfolioData, Stock, AISignal, AIConversation } from '@/lib/supabase'
import { Sparkline } from '@/components/Sparkline'
import { SentimentGauge } from '@/components/SentimentGauge'

export default function Index() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [watchlist, setWatchlist] = useState<Stock[]>([])
  const [signals, setSignals] = useState<AISignal[]>([])
  const [conversations, setConversations] = useState<AIConversation[]>([])
  const [period, setPeriod] = useState<'7D' | '30D' | '3M' | '1A'>('30D')

  const userId = user?.id || 'demo-user-100'

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [port, wl, sigs, convs] = await Promise.all([
          getUserPortfolio(userId),
          getUserWatchlist(userId),
          getAISignals(userId),
          getUserConversations(userId),
        ])
        setPortfolio(port)
        setWatchlist(wl)
        setSignals(sigs)
        setConversations(convs)
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [userId])

  // Chart datasets based on period
  const getChartData = () => {
    if (period === '7D') {
      return [
        { date: '06 Jun', value: 140100 },
        { date: '07 Jun', value: 140650 },
        { date: '08 Jun', value: 140400 },
        { date: '09 Jun', value: 141200 },
        { date: '10 Jun', value: 141850 },
        { date: '11 Jun', value: 142100 },
        { date: '12 Jun', value: 142580 },
      ]
    }
    if (period === '30D') {
      return [
        { date: '14 Mai', value: 133500 },
        { date: '18 Mai', value: 135200 },
        { date: '22 Mai', value: 134100 },
        { date: '26 Mai', value: 137400 },
        { date: '30 Mai', value: 138900 },
        { date: '04 Jun', value: 141100 },
        { date: '08 Jun', value: 140800 },
        { date: '12 Jun', value: 142580 },
      ]
    }
    if (period === '3M') {
      return [
        { date: 'Mar', value: 122000 },
        { date: 'Abr', value: 128500 },
        { date: 'Mai', value: 136200 },
        { date: 'Jun', value: 142580 },
      ]
    }
    return [
      { date: 'Jul 24', value: 112000 },
      { date: 'Out 24', value: 119500 },
      { date: 'Jan 25', value: 126400 },
      { date: 'Abr 25', value: 135100 },
      { date: 'Jun 25', value: 142580 },
    ]
  }

  // Date formatter pt-BR
  const formattedToday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Investidor'

  // Format currency
  const formatBRL = (val?: number) => {
    if (val === undefined || isNaN(val)) return 'R$ 0,00'
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val)
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* 1. WELCOME HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F3F6FB] flex items-center gap-2">
            Olá, {firstName} <span className="inline-block animate-wave">👋</span>
          </h1>
          <p className="text-sm text-[#96A3B8] mt-1 capitalize">
            Aqui está o resumo dos seus ativos hoje • {formattedToday}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analise')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#17C3B2] to-[#0EA5E9] text-[#0A0F1E] font-semibold text-xs flex items-center gap-2 hover:opacity-95 shadow-lg shadow-[#17C3B2]/20 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4" />
            Nova Análise com IA
          </button>
        </div>
      </div>

      {/* 2. PORTFOLIO SUMMARY STAT CARDS (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Valor Investido */}
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#263343] hover:border-[#38485c] hover:-translate-y-0.5 transition-all shadow-md group">
          <div className="flex items-center justify-between text-[#96A3B8] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Valor Investido</span>
            <div className="w-9 h-9 rounded-xl bg-[#17C3B2]/10 flex items-center justify-center text-[#17C3B2]">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-2xl xl:text-3xl font-extrabold tracking-tight text-[#F3F6FB] tabular-nums">
              {formatBRL(portfolio?.invested_value ?? 142580)}
            </p>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#34D399]/15 text-[#34D399]">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +2.8%
              </span>
              <span className="text-[#96A3B8] text-[11px]">vs. mês anterior</span>
            </div>
          </div>
        </div>

        {/* Card 2: Saldo Disponível */}
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#263343] hover:border-[#38485c] hover:-translate-y-0.5 transition-all shadow-md group">
          <div className="flex items-center justify-between text-[#96A3B8] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Saldo Disponível</span>
            <div className="w-9 h-9 rounded-xl bg-[#0EA5E9]/10 flex items-center justify-center text-[#0EA5E9]">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-2xl xl:text-3xl font-extrabold tracking-tight text-[#F3F6FB] tabular-nums">
              {formatBRL(portfolio?.available_balance ?? 18420.5)}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-[#96A3B8]">
              <span className="text-[11px]">Liquidez imediata B3</span>
            </div>
          </div>
        </div>

        {/* Card 3: Retorno Hoje */}
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#263343] hover:border-[#38485c] hover:-translate-y-0.5 transition-all shadow-md group">
          <div className="flex items-center justify-between text-[#96A3B8] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Retorno Hoje</span>
            <div className="w-9 h-9 rounded-xl bg-[#34D399]/10 flex items-center justify-center text-[#34D399]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-2xl xl:text-3xl font-extrabold tracking-tight text-[#34D399] tabular-nums">
              +{formatBRL(portfolio?.daily_return ?? 2150.4)}
            </p>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#34D399]/15 text-[#34D399]">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +{portfolio?.daily_return_pct ?? 1.53}%
              </span>
              <span className="text-[#96A3B8] text-[11px]">no pregão</span>
            </div>
          </div>
        </div>

        {/* Card 4: Retorno Total */}
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#263343] hover:border-[#38485c] hover:-translate-y-0.5 transition-all shadow-md group">
          <div className="flex items-center justify-between text-[#96A3B8] mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Retorno Total</span>
            <div className="w-9 h-9 rounded-xl bg-[#17C3B2]/10 flex items-center justify-center text-[#17C3B2]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-2xl xl:text-3xl font-extrabold tracking-tight text-[#34D399] tabular-nums">
              +{formatBRL(portfolio?.total_return ?? 38450.0)}
            </p>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#34D399]/15 text-[#34D399]">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +{portfolio?.total_return_pct ?? 26.98}%
              </span>
              <span className="text-[#96A3B8] text-[11px]">acumulado</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ROW: MAIN CHART (8 cols) + AI SENTIMENT PANEL (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* MAIN CHART (Span 8) */}
        <div className="lg:col-span-8 bg-[#111827] border border-[#263343] rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#F3F6FB]">Desempenho da Carteira</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#17C3B2]/15 text-[#17C3B2] rounded-md">
                  Ao Vivo
                </span>
              </div>
              <p className="text-xs text-[#96A3B8] mt-0.5">
                Evolução patrimonial consolidada das posições B3
              </p>
            </div>

            {/* Segmented Period Buttons */}
            <div className="flex items-center bg-[#1A2332] p-1 rounded-xl border border-[#263343] self-start sm:self-auto">
              {(['7D', '30D', '3M', '1A'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    period === p
                      ? 'bg-[#17C3B2] text-[#0A0F1E] shadow-sm'
                      : 'text-[#96A3B8] hover:text-[#F3F6FB]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Area Chart with Teal Gradient */}
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={getChartData()}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="equityTealGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#17C3B2" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#17C3B2" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#263343" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#96A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#263343' }}
                />
                <YAxis
                  stroke="#96A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#1A2332] border border-[#263343] p-3 rounded-xl shadow-xl text-xs space-y-1">
                          <p className="text-[#96A3B8] font-medium">{label}</p>
                          <p className="text-[#34D399] font-bold text-sm">
                            {formatBRL(payload[0].value as number)}
                          </p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#17C3B2"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#equityTealGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI SENTIMENT PANEL (Span 4) */}
        <div className="lg:col-span-4 bg-[#111827] border border-[#263343] rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#F3F6FB] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#17C3B2]" /> Sentimento do Mercado
              </h2>
              <span className="text-[11px] font-semibold text-[#96A3B8]">Ibovespa</span>
            </div>

            {/* Radial Sentiment Gauge */}
            <div className="py-2">
              <SentimentGauge score={74} size={180} />
            </div>

            <p className="text-xs text-[#96A3B8] text-center px-2 mt-2 leading-relaxed">
              O fluxo de investidores institucionais e o alívio na curva de juros sustentam viés
              predominantemente otimista para ativos de valor e dividendos na B3.
            </p>
          </div>

          {/* Sinais de Destaque */}
          <div className="mt-6 pt-5 border-t border-[#263343] space-y-2.5">
            <span className="text-[11px] font-semibold text-[#96A3B8] uppercase tracking-wider block mb-2">
              Sinais de Destaque Hoje
            </span>

            {signals.slice(0, 3).map((sig) => (
              <div
                key={sig.id}
                onClick={() => navigate(`/analise?ticker=${sig.ticker}`)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#1A2332] hover:bg-[#202c3f] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-xs text-[#F3F6FB] bg-[#111827] px-2 py-1 rounded border border-[#263343]">
                    {sig.ticker}
                  </span>
                  <span className="text-xs text-[#96A3B8] truncate max-w-[130px]">
                    Score: {sig.sentiment_score}/100
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    sig.recommendation === 'COMPRAR'
                      ? 'bg-[#34D399]/20 text-[#34D399]'
                      : sig.recommendation === 'VENDER'
                        ? 'bg-[#F87171]/20 text-[#F87171]'
                        : 'bg-[#9CA3AF]/20 text-[#9CA3AF]'
                  }`}
                >
                  {sig.recommendation}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. ROW: WATCHLIST PREVIEW (8 cols) + RECENT AI ANALYSIS (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* WATCHLIST PREVIEW (Span 8) */}
        <div className="lg:col-span-8 bg-[#111827] border border-[#263343] rounded-2xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-[#F3F6FB]">Minha Watchlist</h2>
              <p className="text-xs text-[#96A3B8]">Acompanhamento prioritário de papéis</p>
            </div>
            <Link
              to="/watchlist"
              className="text-xs font-semibold text-[#17C3B2] hover:underline flex items-center gap-1"
            >
              Ver todos <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watchlist.slice(0, 4).map((stock) => {
              const sparklinePoints = stock.history?.map((h) => h.close) || [30, 32, 31, 33, 35]
              const isPositive = stock.variation >= 0

              return (
                <div
                  key={stock.id}
                  onClick={() => navigate(`/analise?ticker=${stock.ticker}`)}
                  className="p-4 rounded-xl bg-[#1A2332] border border-[#263343] hover:border-[#17C3B2]/50 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#F3F6FB]">
                          {stock.ticker}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            stock.recommendation === 'COMPRAR'
                              ? 'bg-[#34D399]/20 text-[#34D399]'
                              : stock.recommendation === 'VENDER'
                                ? 'bg-[#F87171]/20 text-[#F87171]'
                                : 'bg-[#9CA3AF]/20 text-[#9CA3AF]'
                          }`}
                        >
                          {stock.recommendation}
                        </span>
                      </div>
                      <p className="text-xs text-[#96A3B8] truncate max-w-[160px]">{stock.name}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-[#F3F6FB]">
                        R$ {stock.current_price.toFixed(2)}
                      </p>
                      <span
                        className={`text-xs font-semibold tabular-nums flex items-center justify-end ${
                          isPositive ? 'text-[#34D399]' : 'text-[#F87171]'
                        }`}
                      >
                        {isPositive ? (
                          <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                        )}
                        {isPositive ? '+' : ''}
                        {stock.variation.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#263343]/60">
                    <span className="text-[11px] text-[#96A3B8]">Tendência 7D</span>
                    <Sparkline
                      data={sparklinePoints}
                      isPositive={isPositive}
                      width={90}
                      height={28}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* RECENT AI ANALYSIS CARD (Span 4) */}
        <div className="lg:col-span-4 bg-[#111827] border border-[#263343] rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#F3F6FB] flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#17C3B2]" /> Análises Recentes IA
              </h2>
            </div>
            <p className="text-xs text-[#96A3B8] mb-4">
              Suas últimas perguntas e diagnósticos de inteligência preditiva.
            </p>

            <div className="space-y-3">
              {conversations.slice(0, 3).map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => navigate(`/analise?ticker=${conv.ticker || 'PETR4'}`)}
                  className="p-3 rounded-xl bg-[#1A2332] border border-[#263343] hover:border-[#17C3B2]/50 cursor-pointer transition-all space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-[#17C3B2] bg-[#111827] px-2 py-0.5 rounded border border-[#263343]">
                      {conv.ticker || 'B3'}
                    </span>
                    <span className="text-[10px] text-[#96A3B8]">
                      {new Date(conv.updated_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[#F3F6FB] line-clamp-2 font-medium">
                    {conv.snippet || conv.messages[0]?.text || 'Análise de mercado'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate('/analise')}
            className="w-full mt-5 py-2.5 px-4 rounded-xl border border-[#263343] bg-[#1A2332] hover:bg-[#202c3f] text-xs font-semibold text-[#17C3B2] flex items-center justify-center gap-2 transition-colors"
          >
            Continuar análise no chat <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
