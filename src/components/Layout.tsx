import React, { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  LineChart,
  Star,
  Settings,
  LogOut,
  Search,
  Bell,
  Menu,
  X,
  TrendingUp,
  Activity,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getStocks } from '@/lib/stocks-service'
import { Stock } from '@/lib/supabase'

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Stock[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [stocksList, setStocksList] = useState<Stock[]>([])
  const [unreadCount, setUnreadCount] = useState(2)
  const [showNotifications, setShowNotifications] = useState(false)

  const searchContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getStocks().then(setStocksList)
  }, [])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Handle outside click for search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchQuery(val)
    if (val.trim().length > 0) {
      const q = val.toUpperCase().trim()
      const filtered = stocksList.filter(
        (s) => s.ticker.includes(q) || s.name.toUpperCase().includes(q),
      )
      setSearchResults(filtered)
      setIsSearchOpen(true)
    } else {
      setSearchResults([])
      setIsSearchOpen(false)
    }
  }

  const handleSelectStock = (ticker: string) => {
    setIsSearchOpen(false)
    setSearchQuery('')
    navigate(`/analise?ticker=${ticker}`)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/entrar')
  }

  const navItems = [
    { to: '/', label: 'Visão Geral', icon: LayoutDashboard },
    { to: '/analise', label: 'Análise', icon: LineChart },
    { to: '/watchlist', label: 'Minha Watchlist', icon: Star },
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ]

  const userInitials = (profile?.full_name || user?.email || 'Investidor')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Investidor'
  const displayEmail = user?.email || 'usuario@pulse.com.br'

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-[#F3F6FB] flex flex-col antialiased">
      <div className="flex flex-1">
        {/* DESKTOP SIDEBAR (left-fixed 264px) */}
        <aside className="hidden lg:flex flex-col w-[264px] border-r border-[#263343] bg-[#0A0F1E] sticky top-0 h-screen select-none z-30">
          {/* Logo Header */}
          <div className="p-6 border-b border-[#263343]/60 flex items-center justify-between">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => navigate('/')}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center shadow-lg shadow-[#17C3B2]/20 transition-transform group-hover:scale-105">
                <Activity className="w-5 h-5 text-[#0A0F1E] stroke-[2.5]" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-[#F3F6FB] flex items-center gap-1.5">
                  Pulse <span className="text-[#17C3B2]">Equity</span>
                </span>
                <span className="text-[10px] font-semibold tracking-wider text-[#96A3B8] uppercase block">
                  Fintech B3 AI
                </span>
              </div>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 relative group ${
                    isActive
                      ? 'bg-[#17C3B2]/10 text-[#17C3B2] shadow-sm font-semibold'
                      : 'text-[#96A3B8] hover:text-[#F3F6FB] hover:bg-[#111827]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-[#17C3B2] rounded-r-full" />
                  )}
                  <Icon
                    className={`w-5 h-5 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-[#17C3B2]' : 'text-[#96A3B8]'
                    }`}
                  />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* User Card & Logout */}
          <div className="p-4 border-t border-[#263343]/70 bg-[#0A0F1E]/50">
            <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[#111827] border border-[#263343]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#17C3B2] to-[#0EA5E9] text-[#0A0F1E] font-bold text-xs flex items-center justify-center shrink-0">
                  {userInitials || 'PE'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#F3F6FB] truncate">{displayName}</p>
                  <p className="text-[11px] text-[#96A3B8] truncate">{displayEmail}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sair da conta"
                className="p-1.5 rounded-lg text-[#96A3B8] hover:text-[#F87171] hover:bg-[#1A2332] transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* MOBILE DRAWER */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <div className="relative flex flex-col w-[280px] max-w-[85%] bg-[#0A0F1E] border-r border-[#263343] p-6 z-10 animate-slide-right">
              <div className="flex items-center justify-between pb-6 border-b border-[#263343]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center">
                    <Activity className="w-4 h-4 text-[#0A0F1E]" />
                  </div>
                  <span className="font-bold text-base text-[#F3F6FB]">
                    Pulse <span className="text-[#17C3B2]">Equity</span>
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-[#96A3B8] hover:bg-[#111827]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 py-6 space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.to === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.to)

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#17C3B2]/15 text-[#17C3B2] font-semibold'
                          : 'text-[#96A3B8] hover:text-[#F3F6FB] hover:bg-[#111827]'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </nav>

              <div className="pt-4 border-t border-[#263343]">
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#111827] border border-[#263343]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#17C3B2] text-[#0A0F1E] font-bold text-xs flex items-center justify-center shrink-0">
                      {userInitials || 'PE'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F3F6FB] truncate">{displayName}</p>
                      <p className="text-[10px] text-[#96A3B8] truncate">{displayEmail}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-[#96A3B8] hover:text-[#F87171]"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* STICKY TOP BAR */}
          <header className="sticky top-0 z-20 bg-[#0A0F1E]/90 backdrop-blur-md border-b border-[#263343] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
            {/* Hamburger button (visible on mobile/tablet < 1025px) */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl text-[#96A3B8] hover:text-[#F3F6FB] hover:bg-[#111827] border border-[#263343]"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="lg:hidden flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-[#F3F6FB]">
                  Pulse <span className="text-[#17C3B2]">Equity</span>
                </span>
              </div>
            </div>

            {/* Global Search Bar */}
            <div className="flex-1 max-w-xl relative" ref={searchContainerRef}>
              <div className="relative">
                <Search className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => searchQuery.trim() && setIsSearchOpen(true)}
                  placeholder="Buscar ativo ou ticker (ex: PETR4, VALE3, WEGE3)…"
                  className="w-full bg-[#111827] border border-[#263343] hover:border-[#38485c] focus:border-[#17C3B2] text-sm text-[#F3F6FB] placeholder-[#96A3B8] rounded-xl pl-10 pr-4 py-2 transition-all outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setIsSearchOpen(false)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#96A3B8] hover:text-[#F3F6FB]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {isSearchOpen && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-[#111827] border border-[#263343] rounded-xl shadow-2xl overflow-hidden z-40 max-h-80 overflow-y-auto">
                  <div className="p-2 border-b border-[#263343] text-[11px] font-semibold text-[#96A3B8] uppercase tracking-wider flex justify-between">
                    <span>Ações B3 encontradas</span>
                    <span>{searchResults.length} ativos</span>
                  </div>
                  <div className="divide-y divide-[#263343]/50">
                    {searchResults.map((stock) => (
                      <div
                        key={stock.id}
                        onClick={() => handleSelectStock(stock.ticker)}
                        className="p-3 hover:bg-[#1A2332] cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#1A2332] border border-[#263343] flex items-center justify-center font-mono font-bold text-xs text-[#17C3B2]">
                            {stock.ticker.slice(0, 4)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-[#F3F6FB]">
                                {stock.ticker}
                              </span>
                              <span className="text-xs text-[#96A3B8] truncate max-w-[150px] sm:max-w-[200px]">
                                {stock.name}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#96A3B8]">{stock.sector}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-[#F3F6FB]">
                            R$ {stock.current_price.toFixed(2)}
                          </p>
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${
                              stock.variation >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                            }`}
                          >
                            {stock.variation >= 0 ? '+' : ''}
                            {stock.variation.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications & Quick Info */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => {
                    setShowNotifications(!showNotifications)
                    if (unreadCount > 0) setUnreadCount(0)
                  }}
                  className="p-2 rounded-xl text-[#96A3B8] hover:text-[#F3F6FB] hover:bg-[#111827] border border-[#263343] relative transition-colors"
                  aria-label="Sinais IA e Notificações"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F87171] text-[#0A0F1E] font-bold text-[10px] rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications popover */}
                {showNotifications && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-[#111827] border border-[#263343] rounded-xl shadow-2xl p-3 z-40 animate-fade-in">
                    <div className="flex items-center justify-between pb-2 border-b border-[#263343] mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#96A3B8]">
                        Sinais de Inteligência B3
                      </span>
                      <span
                        className="text-[11px] text-[#17C3B2] cursor-pointer"
                        onClick={() => setShowNotifications(false)}
                      >
                        Fechar
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div
                        onClick={() => {
                          setShowNotifications(false)
                          navigate('/analise?ticker=PETR4')
                        }}
                        className="p-2 rounded-lg bg-[#1A2332] hover:bg-[#202c3f] cursor-pointer transition-colors"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono font-bold text-[#17C3B2]">PETR4</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#34D399]/20 text-[#34D399] font-semibold">
                            COMPRAR
                          </span>
                        </div>
                        <p className="text-[#96A3B8] text-[11px]">
                          Fluxo institucional elevado e dividendo atrativo de 14.2%.
                        </p>
                      </div>
                      <div
                        onClick={() => {
                          setShowNotifications(false)
                          navigate('/analise?ticker=WEGE3')
                        }}
                        className="p-2 rounded-lg bg-[#1A2332] hover:bg-[#202c3f] cursor-pointer transition-colors"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono font-bold text-[#17C3B2]">WEGE3</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#34D399]/20 text-[#34D399] font-semibold">
                            COMPRAR
                          </span>
                        </div>
                        <p className="text-[#96A3B8] text-[11px]">
                          Crescimento acima do consenso em transição energética.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* MAIN PAGE OUTLET (Max width 1440px with 32px padding) */}
          <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 sm:p-8">
            <Outlet />
          </main>

          {/* FOOTER */}
          <footer className="border-t border-[#263343]/60 py-6 px-4 sm:px-8 text-xs text-[#96A3B8] flex flex-col sm:flex-row items-center justify-between gap-3 mt-auto">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#F3F6FB]">Pulse Equity</span>
              <span>&copy; {new Date().getFullYear()} Todos os direitos reservados.</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-[#17C3B2] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Supabase RLS Protegido
              </span>
              <span className="hover:text-[#F3F6FB] cursor-pointer">Termos &amp; Privacidade</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
