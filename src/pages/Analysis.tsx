import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Send,
  Mic,
  Activity,
  Sparkles,
  Bot,
  User,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Info,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getStocks,
  getStockByTicker,
  getUserConversations,
  saveUserConversations,
  analyzeStockMessage,
} from '@/lib/stocks-service'
import { Stock, AIChatMessage, AIConversation } from '@/lib/supabase'
import { KlineChart } from '@/components/KlineChart'
import { useToast } from '@/hooks/use-toast'

export default function Analysis() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()

  const tickerParam = searchParams.get('ticker')?.toUpperCase()

  const [stocks, setStocks] = useState<Stock[]>([])
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [loading, setLoading] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const userId = user?.id || 'demo-user-100'

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  // Load stocks and existing conversation
  useEffect(() => {
    async function loadInitial() {
      setLoading(true)
      const stockList = await getStocks()
      setStocks(stockList)

      // Check url param
      if (tickerParam) {
        const found = stockList.find((s) => s.ticker === tickerParam)
        if (found) {
          setSelectedStock(found)
        }
      }

      const convs = await getUserConversations(userId)
      if (convs.length > 0 && convs[0].messages.length > 0) {
        setMessages(convs[0].messages)
        if (!tickerParam && convs[0].ticker) {
          const s = stockList.find((x) => x.ticker === convs[0].ticker)
          if (s) setSelectedStock(s)
        }
      } else {
        // Welcome initial prompt
        setMessages([
          {
            id: 'init-msg',
            sender: 'ai',
            text: 'Olá! Sou seu analista quantitativo Pulse Equity. Analiso fundamentos, múltiplos e gráficos K-line em tempo real para ativos listados na B3. Como posso te apoiar nos seus investimentos hoje?',
            timestamp: new Date().toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ])
      }

      setLoading(false)
    }

    loadInitial()
  }, [userId, tickerParam])

  // Handle send message
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputValue).trim()
    if (!query) return

    const userMsg: AIChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }

    const updatedList = [...messages, userMsg]
    setMessages(updatedList)
    setInputValue('')
    setIsTyping(true)

    // Simulate AI inference (~1.2s delay as per spec)
    setTimeout(async () => {
      const result = analyzeStockMessage(query, stocks)

      if (result.stock) {
        setSelectedStock(result.stock)
      }

      const aiMsg: AIChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: result.replyText,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        ticker: result.detectedTicker || undefined,
        stock: result.stock || undefined,
        recommendation: result.recommendation,
        sentiment_score: result.sentimentScore,
        fundamentalHighlights: result.highlights,
      }

      const finalList = [...updatedList, aiMsg]
      setMessages(finalList)
      setIsTyping(false)

      // Persist to conversations table
      const newConv: AIConversation = {
        id: `conv-${userId}`,
        user_id: userId,
        ticker: result.detectedTicker || selectedStock?.ticker || undefined,
        snippet: query,
        messages: finalList,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await saveUserConversations(userId, [newConv])
    }, 1200)
  }

  const suggestedPrompts = [
    'Analisar a PETR4',
    'Qual o momento de compra da VALE3?',
    'Comparar ITUB4 e BBDC4',
    'Riscos de curto prazo para o Ibovespa',
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[640px] animate-fade-in">
      {/* LEFT PANEL — CHAT INTERFACE (60% on desktop, span 7 or 8) */}
      <div className="lg:col-span-7 xl:col-span-7 flex flex-col bg-[#111827] border border-[#263343] rounded-2xl overflow-hidden shadow-lg h-full">
        {/* Chat Header */}
        <div className="p-4 px-6 border-b border-[#263343] bg-[#111827] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center shadow-md">
              <Bot className="w-5 h-5 text-[#0A0F1E] stroke-[2.5]" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-[#F3F6FB] flex items-center gap-2">
                Assistente de Análise Quantitativa
                <span className="w-2 h-2 rounded-full bg-[#34D399]" />
              </h2>
              <p className="text-[11px] text-[#96A3B8]">
                B3 Inteligência Preditiva • Mapeamento em Tempo Real
              </p>
            </div>
          </div>

          {selectedStock && (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1A2332] border border-[#263343] text-xs">
              <span className="text-[#96A3B8]">Ativo em Foco:</span>
              <span className="font-mono font-bold text-[#17C3B2]">{selectedStock.ticker}</span>
            </div>
          )}
        </div>

        {/* Message List */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user'

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[92%] sm:max-w-[85%] ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                } animate-fade-in`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    isUser
                      ? 'bg-[#17C3B2] text-[#0A0F1E]'
                      : 'bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] text-[#0A0F1E]'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                </div>

                {/* Bubble Container */}
                <div
                  className={`space-y-3 rounded-2xl p-4 text-sm ${
                    isUser
                      ? 'bg-[#17C3B2]/15 border border-[#17C3B2]/30 text-[#F3F6FB] rounded-tr-none'
                      : 'bg-[#1A2332] border border-[#263343] text-[#F3F6FB] rounded-tl-none shadow-sm'
                  }`}
                >
                  {/* Text */}
                  <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed">
                    {msg.text}
                  </div>

                  {/* Rich Stock Card Inside AI response if ticker matched */}
                  {msg.stock && (
                    <div className="mt-3 p-3.5 rounded-xl bg-[#111827] border border-[#263343] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-[#17C3B2]">
                            {msg.stock.ticker}
                          </span>
                          <span className="text-xs text-[#96A3B8]">{msg.stock.name}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            msg.recommendation === 'COMPRAR'
                              ? 'bg-[#34D399]/20 text-[#34D399]'
                              : msg.recommendation === 'VENDER'
                                ? 'bg-[#F87171]/20 text-[#F87171]'
                                : 'bg-[#9CA3AF]/20 text-[#9CA3AF]'
                          }`}
                        >
                          {msg.recommendation}
                        </span>
                      </div>

                      {/* K-line chart preview */}
                      <KlineChart data={msg.stock.history} height={160} ticker={msg.stock.ticker} />

                      {/* Fundamental Highlights bullets */}
                      {msg.fundamentalHighlights && msg.fundamentalHighlights.length > 0 && (
                        <div className="pt-2 border-t border-[#263343] space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#96A3B8]">
                            Destaques Fundamentalistas:
                          </span>
                          <ul className="text-xs text-[#96A3B8] space-y-1">
                            {msg.fundamentalHighlights.map((hl, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#17C3B2] mt-1 shrink-0" />
                                <span>{hl}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-[#96A3B8] text-right">{msg.timestamp}</div>
                </div>
              </div>
            )
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-3 animate-fade-in mr-auto">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] text-[#0A0F1E] flex items-center justify-center text-xs font-bold shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 px-4 rounded-2xl bg-[#1A2332] border border-[#263343] flex items-center gap-1.5 rounded-tl-none">
                <span className="w-2 h-2 rounded-full bg-[#17C3B2] typing-dot-1" />
                <span className="w-2 h-2 rounded-full bg-[#17C3B2] typing-dot-2" />
                <span className="w-2 h-2 rounded-full bg-[#17C3B2] typing-dot-3" />
                <span className="text-xs text-[#96A3B8] ml-2">Processando múltiplos B3…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area & Prompt Chips */}
        <div className="p-4 border-t border-[#263343] bg-[#111827] space-y-3 shrink-0">
          {/* Suggested Prompt Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {suggestedPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={isTyping}
                className="px-3 py-1 rounded-full bg-[#1A2332] border border-[#263343] hover:border-[#17C3B2]/50 text-xs text-[#96A3B8] hover:text-[#F3F6FB] transition-all whitespace-nowrap shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Pergunte sobre qualquer ativo da B3 (ex: Analisar PETR4)…"
                disabled={isTyping}
                className="w-full bg-[#1A2332] border border-[#263343] focus:border-[#17C3B2] rounded-xl px-4 py-3 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
              />
            </div>

            {/* Microphone button (disabled with tooltip) */}
            <button
              type="button"
              disabled
              title="Em breve: Entrada de voz com IA"
              className="p-3 rounded-xl bg-[#1A2332] border border-[#263343] text-[#96A3B8] opacity-50 cursor-not-allowed hover:bg-[#1A2332]"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send button */}
            <button
              type="submit"
              disabled={isTyping || !inputValue.trim()}
              className="p-3 rounded-xl bg-[#17C3B2] text-[#0A0F1E] font-bold hover:bg-[#13A796] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-[#17C3B2]/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT PANEL — STOCK CONTEXT (desktop only, hidden on mobile < 1025px) */}
      <div className="hidden lg:flex lg:col-span-5 xl:col-span-5 flex-col bg-[#111827] border border-[#263343] rounded-2xl p-6 shadow-lg overflow-y-auto space-y-6">
        {selectedStock ? (
          <div className="space-y-6 animate-fade-in">
            {/* Header: Ticker, Name, Price, Recommendation */}
            <div className="flex items-start justify-between pb-5 border-b border-[#263343]">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-mono font-bold text-2xl text-[#F3F6FB]">
                    {selectedStock.ticker}
                  </h3>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      selectedStock.recommendation === 'COMPRAR'
                        ? 'bg-[#34D399]/20 text-[#34D399]'
                        : selectedStock.recommendation === 'VENDER'
                          ? 'bg-[#F87171]/20 text-[#F87171]'
                          : 'bg-[#9CA3AF]/20 text-[#9CA3AF]'
                    }`}
                  >
                    {selectedStock.recommendation}
                  </span>
                </div>
                <p className="text-xs text-[#96A3B8] mt-1">{selectedStock.name}</p>
                <span className="inline-block mt-2 text-[11px] px-2 py-0.5 rounded bg-[#1A2332] text-[#96A3B8] border border-[#263343]">
                  {selectedStock.sector}
                </span>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-[#F3F6FB]">
                  R$ {selectedStock.current_price.toFixed(2)}
                </p>
                <span
                  className={`text-xs font-semibold tabular-nums inline-flex items-center justify-end ${
                    selectedStock.variation >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                  }`}
                >
                  {selectedStock.variation >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                  )}
                  {selectedStock.variation >= 0 ? '+' : ''}
                  {selectedStock.variation.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Compact K-Line Chart */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#96A3B8]">
                  Histórico de Candlestick
                </span>
              </div>
              <KlineChart data={selectedStock.history} height={190} ticker={selectedStock.ticker} />
            </div>

            {/* Key Stats Grid (P/L, P/VP, ROE, DY, Margem Líquida, Volume) */}
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#96A3B8] block mb-3">
                Indicadores Fundamentalistas Chave
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#1A2332] border border-[#263343]">
                  <p className="text-[11px] text-[#96A3B8]">P/L</p>
                  <p className="text-base font-bold tabular-nums text-[#F3F6FB] mt-0.5">
                    {selectedStock.pl.toFixed(1)}x
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#1A2332] border border-[#263343]">
                  <p className="text-[11px] text-[#96A3B8]">P/VP</p>
                  <p className="text-base font-bold tabular-nums text-[#F3F6FB] mt-0.5">
                    {selectedStock.pvp.toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#1A2332] border border-[#263343]">
                  <p className="text-[11px] text-[#96A3B8]">ROE</p>
                  <p className="text-base font-bold tabular-nums text-[#34D399] mt-0.5">
                    {selectedStock.roe.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#1A2332] border border-[#263343]">
                  <p className="text-[11px] text-[#96A3B8]">Div. Yield</p>
                  <p className="text-base font-bold tabular-nums text-[#34D399] mt-0.5">
                    {selectedStock.dividend_yield.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#1A2332] border border-[#263343]">
                  <p className="text-[11px] text-[#96A3B8]">Margem Líq.</p>
                  <p className="text-base font-bold tabular-nums text-[#F3F6FB] mt-0.5">
                    {selectedStock.net_margin.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#1A2332] border border-[#263343]">
                  <p className="text-[11px] text-[#96A3B8]">Volume</p>
                  <p className="text-base font-bold tabular-nums text-[#F3F6FB] mt-0.5">
                    {selectedStock.volume}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Recommendation Box */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#17C3B2]/10 to-transparent border border-[#17C3B2]/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#17C3B2] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Recomendação do Algoritmo
                </span>
                <span className="text-[11px] font-bold text-[#96A3B8]">
                  Score: {selectedStock.sentiment_score}/100
                </span>
              </div>
              <p className="text-xs text-[#F3F6FB] leading-relaxed">
                {selectedStock.recommendation === 'COMPRAR'
                  ? `Múltiplos com margem de segurança e geração sólida de caixa posicionam ${selectedStock.ticker} com excelente assimetria de retorno.`
                  : selectedStock.recommendation === 'VENDER'
                    ? `Pressão de curto prazo nos resultados e alavancagem justificam postura cautelosa para ${selectedStock.ticker}.`
                    : `Ativo com valuation justo frente ao setor. Recomenda-se manter posição e aguardar gatilhos de expansão.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4 text-[#96A3B8]">
            <div className="w-16 h-16 rounded-2xl bg-[#1A2332] border border-[#263343] flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-[#96A3B8]" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#F3F6FB]">Selecione um ativo na conversa</h3>
              <p className="text-xs text-[#96A3B8] max-w-xs mt-1">
                Digite uma mensagem contendo um ticker como PETR4, VALE3 ou ITUB4 para carregar os
                dados analíticos em tempo real.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
