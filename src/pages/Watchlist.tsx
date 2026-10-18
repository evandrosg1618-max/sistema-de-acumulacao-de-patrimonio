import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Star,
  Plus,
  Search,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  LineChart,
  AlertCircle,
  X,
  Check,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getUserWatchlist,
  getStocks,
  addToWatchlist,
  removeFromWatchlist,
} from '@/lib/stocks-service'
import { Stock } from '@/lib/supabase'
import { Sparkline } from '@/components/Sparkline'
import { useToast } from '@/hooks/use-toast'

export default function Watchlist() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const userId = user?.id || 'demo-user-100'

  const [watchlist, setWatchlist] = useState<Stock[]>([])
  const [allStocks, setAllStocks] = useState<Stock[]>([])
  const [searchFilter, setSearchFilter] = useState('')
  const [loading, setLoading] = useState(true)

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [stockToDelete, setStockToDelete] = useState<Stock | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [wl, stocks] = await Promise.all([getUserWatchlist(userId), getStocks()])
        setWatchlist(wl)
        setAllStocks(stocks)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [userId])

  // Filter user's existing watchlist locally
  const filteredWatchlist = watchlist.filter((s) => {
    const q = searchFilter.toUpperCase().trim()
    return !q || s.ticker.includes(q) || s.name.toUpperCase().includes(q)
  })

  // Stocks available to add (not already in watchlist)
  const availableToAdd = allStocks.filter((s) => {
    const alreadyIn = watchlist.some((w) => w.ticker === s.ticker)
    if (alreadyIn) return false
    const q = modalSearch.toUpperCase().trim()
    return !q || s.ticker.includes(q) || s.name.toUpperCase().includes(q)
  })

  const handleAddStock = async (stock: Stock) => {
    await addToWatchlist(userId, stock)
    setWatchlist((prev) => [...prev, stock])
    setIsAddModalOpen(false)
    setModalSearch('')
    toast({
      title: 'Ativo adicionado',
      description: `${stock.ticker} (${stock.name}) foi inserido na sua watchlist.`,
    })
  }

  const handleConfirmDelete = async () => {
    if (!stockToDelete) return
    await removeFromWatchlist(userId, stockToDelete.ticker)
    setWatchlist((prev) => prev.filter((s) => s.ticker !== stockToDelete.ticker))
    const removedTicker = stockToDelete.ticker
    setStockToDelete(null)
    toast({
      title: 'Ativo removido',
      description: `${removedTicker} foi excluído da sua watchlist.`,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F3F6FB] flex items-center gap-2.5">
            <Star className="w-6 h-6 text-[#17C3B2] fill-[#17C3B2]/20" /> Minha Watchlist
          </h1>
          <p className="text-xs sm:text-sm text-[#96A3B8] mt-1">
            Monitore cotações, variações diárias e recomendações algorítmicas da B3
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search box to filter current list */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar por ticker ou nome…"
              className="w-full bg-[#111827] border border-[#263343] focus:border-[#17C3B2] text-xs text-[#F3F6FB] placeholder-[#96A3B8] rounded-xl pl-9 pr-3 py-2.5 outline-none transition-colors"
            />
          </div>

          {/* Add asset button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#17C3B2] text-[#0A0F1E] font-semibold text-xs flex items-center justify-center gap-2 hover:bg-[#13A796] shadow-lg shadow-[#17C3B2]/20 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Adicionar Ativo
          </button>
        </div>
      </div>

      {/* WATCHLIST CONTENT */}
      {filteredWatchlist.length === 0 ? (
        /* EMPTY STATE */
        <div className="bg-[#111827] border border-[#263343] rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1A2332] border border-[#263343] flex items-center justify-center text-[#17C3B2]">
            <Star className="w-8 h-8 stroke-[1.5]" />
          </div>
          <div className="max-w-md">
            <h3 className="text-lg font-bold text-[#F3F6FB]">Sua watchlist está vazia</h3>
            <p className="text-xs text-[#96A3B8] mt-1 leading-relaxed">
              Adicione ativos para acompanhar seus investimentos de perto com sinais e gráficos
              K-line em tempo real.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-[#17C3B2] text-[#0A0F1E] font-semibold text-xs hover:bg-[#13A796] transition-all flex items-center gap-2 shadow-md shadow-[#17C3B2]/20"
          >
            <Plus className="w-4 h-4" /> Adicionar Primeiro Ativo
          </button>
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE (≥ 1025px) */}
          <div className="hidden lg:block bg-[#111827] border border-[#263343] rounded-2xl overflow-hidden shadow-md">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1A2332]/60 text-[11px] uppercase tracking-wider text-[#96A3B8] border-b border-[#263343]">
                <tr>
                  <th className="py-4 px-6 font-semibold">Ativo B3</th>
                  <th className="py-4 px-6 font-semibold text-right">Preço Atual</th>
                  <th className="py-4 px-6 font-semibold text-right">Variação Dia</th>
                  <th className="py-4 px-6 font-semibold text-center">Tendência (7D)</th>
                  <th className="py-4 px-6 font-semibold text-center">Recomendação IA</th>
                  <th className="py-4 px-6 font-semibold text-center">Múltiplo P/L</th>
                  <th className="py-4 px-6 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263343]/50">
                {filteredWatchlist.map((stock) => {
                  const sparklinePoints = stock.history?.map((h) => h.close) || [30, 32, 31, 33, 35]
                  const isPositive = stock.variation >= 0

                  return (
                    <tr
                      key={stock.id}
                      className="hover:bg-[#1A2332]/50 transition-colors group cursor-pointer"
                      onClick={() => navigate(`/analise?ticker=${stock.ticker}`)}
                    >
                      {/* Ativo */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#1A2332] border border-[#263343] flex items-center justify-center font-mono font-bold text-xs text-[#17C3B2]">
                            {stock.ticker.slice(0, 4)}
                          </div>
                          <div>
                            <span className="font-mono font-bold text-[#F3F6FB] block">
                              {stock.ticker}
                            </span>
                            <span className="text-xs text-[#96A3B8]">{stock.name}</span>
                          </div>
                        </div>
                      </td>

                      {/* Preço */}
                      <td className="py-4 px-6 text-right font-semibold tabular-nums text-[#F3F6FB]">
                        R$ {stock.current_price.toFixed(2)}
                      </td>

                      {/* Variação */}
                      <td className="py-4 px-6 text-right">
                        <span
                          className={`inline-flex items-center text-xs font-semibold tabular-nums ${
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
                      </td>

                      {/* Sparkline */}
                      <td className="py-4 px-6 text-center">
                        <div className="flex justify-center">
                          <Sparkline
                            data={sparklinePoints}
                            isPositive={isPositive}
                            width={90}
                            height={28}
                          />
                        </div>
                      </td>

                      {/* Recomendação */}
                      <td className="py-4 px-6 text-center">
                        <span
                          className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            stock.recommendation === 'COMPRAR'
                              ? 'bg-[#34D399]/20 text-[#34D399]'
                              : stock.recommendation === 'VENDER'
                                ? 'bg-[#F87171]/20 text-[#F87171]'
                                : 'bg-[#9CA3AF]/20 text-[#9CA3AF]'
                          }`}
                        >
                          {stock.recommendation}
                        </span>
                      </td>

                      {/* P/L */}
                      <td className="py-4 px-6 text-center text-xs font-medium tabular-nums text-[#96A3B8]">
                        {stock.pl.toFixed(1)}x
                      </td>

                      {/* Ações */}
                      <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/analise?ticker=${stock.ticker}`)}
                            title="Analisar no chat"
                            className="p-1.5 rounded-lg text-[#96A3B8] hover:text-[#17C3B2] hover:bg-[#1A2332] transition-colors"
                          >
                            <LineChart className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setStockToDelete(stock)}
                            title="Remover da watchlist"
                            className="p-1.5 rounded-lg text-[#96A3B8] hover:text-[#F87171] hover:bg-[#1A2332] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE/TABLET CARD LIST (< 1025px) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
            {filteredWatchlist.map((stock) => {
              const sparklinePoints = stock.history?.map((h) => h.close) || [30, 32, 31, 33, 35]
              const isPositive = stock.variation >= 0

              return (
                <div
                  key={stock.id}
                  onClick={() => navigate(`/analise?ticker=${stock.ticker}`)}
                  className="p-4 rounded-xl bg-[#111827] border border-[#263343] hover:border-[#17C3B2]/50 transition-all cursor-pointer flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1A2332] border border-[#263343] flex items-center justify-center font-mono font-bold text-xs text-[#17C3B2]">
                        {stock.ticker.slice(0, 4)}
                      </div>
                      <div>
                        <span className="font-mono font-bold text-base text-[#F3F6FB] block">
                          {stock.ticker}
                        </span>
                        <span className="text-xs text-[#96A3B8] line-clamp-1">{stock.name}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-base font-bold tabular-nums text-[#F3F6FB]">
                        R$ {stock.current_price.toFixed(2)}
                      </p>
                      <span
                        className={`text-xs font-semibold tabular-nums flex items-center justify-end ${
                          isPositive ? 'text-[#34D399]' : 'text-[#F87171]'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {stock.variation.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#263343]/60">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stock.recommendation === 'COMPRAR'
                          ? 'bg-[#34D399]/20 text-[#34D399]'
                          : stock.recommendation === 'VENDER'
                            ? 'bg-[#F87171]/20 text-[#F87171]'
                            : 'bg-[#9CA3AF]/20 text-[#9CA3AF]'
                      }`}
                    >
                      {stock.recommendation}
                    </span>

                    <div className="flex items-center gap-3">
                      <Sparkline
                        data={sparklinePoints}
                        isPositive={isPositive}
                        width={80}
                        height={24}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setStockToDelete(stock)
                        }}
                        className="p-1.5 rounded-lg text-[#96A3B8] hover:text-[#F87171]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ADD ASSET MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsAddModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-[#111827] border border-[#263343] rounded-2xl shadow-2xl p-6 z-10 animate-fade-in space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#263343]">
              <div>
                <h3 className="font-bold text-base text-[#F3F6FB]">Adicionar Ativo à Watchlist</h3>
                <p className="text-xs text-[#96A3B8] mt-0.5">
                  Consulte os papéis cadastrados na base B3
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-[#96A3B8] hover:text-[#F3F6FB] hover:bg-[#1A2332]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Buscar por código ou nome (ex: WEGE3, B3SA3)…"
                autoFocus
                className="w-full bg-[#1A2332] border border-[#263343] focus:border-[#17C3B2] text-xs text-[#F3F6FB] placeholder-[#96A3B8] rounded-xl pl-9 pr-3 py-2.5 outline-none transition-colors"
              />
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#263343]/50 pr-1 space-y-1">
              {availableToAdd.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#96A3B8]">
                  Nenhum ativo encontrado ou todos já adicionados à sua lista.
                </div>
              ) : (
                availableToAdd.map((stock) => (
                  <div
                    key={stock.id}
                    onClick={() => handleAddStock(stock)}
                    className="p-3 hover:bg-[#1A2332] rounded-xl cursor-pointer flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1A2332] border border-[#263343] group-hover:border-[#17C3B2] flex items-center justify-center font-mono font-bold text-xs text-[#17C3B2]">
                        {stock.ticker.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-[#F3F6FB]">
                            {stock.ticker}
                          </span>
                          <span className="text-xs text-[#96A3B8]">{stock.name}</span>
                        </div>
                        <span className="text-[11px] text-[#96A3B8]">{stock.sector}</span>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="text-xs font-semibold tabular-nums text-[#F3F6FB]">
                          R$ {stock.current_price.toFixed(2)}
                        </p>
                        <span
                          className={`text-[10px] font-semibold tabular-nums ${
                            stock.variation >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                          }`}
                        >
                          {stock.variation >= 0 ? '+' : ''}
                          {stock.variation.toFixed(2)}%
                        </span>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-[#17C3B2]/10 group-hover:bg-[#17C3B2] text-[#17C3B2] group-hover:text-[#0A0F1E] flex items-center justify-center transition-all">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {stockToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setStockToDelete(null)}
          />
          <div className="relative w-full max-w-sm bg-[#111827] border border-[#263343] rounded-2xl shadow-2xl p-6 z-10 animate-fade-in space-y-4">
            <div className="w-11 h-11 rounded-full bg-[#F87171]/20 text-[#F87171] flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-base text-[#F3F6FB]">Remover da Watchlist?</h3>
              <p className="text-xs text-[#96A3B8] mt-1 leading-relaxed">
                Tem certeza que deseja remover <strong>{stockToDelete.ticker}</strong> da sua lista
                de acompanhamento?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStockToDelete(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#1A2332] hover:bg-[#202c3f] text-xs font-semibold text-[#F3F6FB] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#F87171] hover:bg-[#ef4444] text-xs font-semibold text-[#0A0F1E] transition-colors"
              >
                Confirmar Remoção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
