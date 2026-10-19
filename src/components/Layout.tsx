import React, { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Target,
  Repeat,
  Settings,
  History,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Wallet,
  Users,
  PlusCircle,
  Building2,
  Tag,
  Banknote,
  Bell,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { workspaceService } from '@/services/sap'
import { toast } from 'sonner'

export default function Layout() {
  const {
    user,
    profile,
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    signOut,
    refreshProfileAndWorkspaces,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [newWsDialogOpen, setNewWsDialogOpen] = useState(false)
  const [newWsNome, setNewWsNome] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/entrar')
    } catch (err: any) {
      toast.error('Erro ao sair')
    }
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWsNome.trim() || !user) return
    setCreatingWs(true)
    try {
      const ws = await workspaceService.createWorkspace(newWsNome.trim(), user.id)
      await refreshProfileAndWorkspaces()
      toast.success(`Workspace "${ws.nome}" criado com sucesso!`)
      setNewWsNome('')
      setNewWsDialogOpen(false)
    } catch (err: any) {
      toast.error('Erro ao criar workspace: ' + (err.message || 'tente novamente'))
    } finally {
      setCreatingWs(false)
    }
  }

  // Menus principais da Topbar Organizze
  const topNavTabs = [
    { label: 'visão geral', path: '/' },
    { label: 'contas', path: '/contas' },
    { label: 'cartões', path: '/cartoes' },
    { label: 'orçamento', path: '/orcamento' },
    { label: 'categorias', path: '/categorias' },
    { label: 'lançamentos', path: '/lancamentos' },
    { label: 'relatórios', path: '/relatorios', badge: 'Build 7' },
  ]

  // Subitens / Cadastros desktop: Lançamentos substitui Meios de Pagamento
  const cadastrosDesktopItems = [
    { label: 'Minhas Contas', path: '/contas', icon: Wallet },
    { label: 'Meus Cartões', path: '/cartoes', icon: CreditCard },
    { label: 'Lançamentos', path: '/lancamentos', icon: ArrowLeftRight },
    { label: 'Categorias & Subcategorias', path: '/categorias', icon: Tag },
    { label: 'Orçamento Familiar', path: '/orcamento', icon: Target },
  ]

  // Subitens do drawer mobile: mantém Meios de Pagamento E Lançamentos
  const cadastrosMobileItems = [
    { label: 'Minhas Contas', path: '/contas', icon: Wallet },
    { label: 'Meus Cartões', path: '/cartoes', icon: CreditCard },
    { label: 'Lançamentos', path: '/lancamentos', icon: ArrowLeftRight },
    { label: 'Meios de Pagamento', path: '/meios-pagamento', icon: Banknote },
    { label: 'Categorias & Subcategorias', path: '/categorias', icon: Tag },
    { label: 'Orçamento Familiar', path: '/orcamento', icon: Target },
  ]

  return (
    <div className="min-h-screen bg-[#f3f5f7] text-slate-900 flex flex-col antialiased">
      {/* TOPBAR PRINCIPAL ESTILO ORGANIZZE (VERDE COM ABAS, ÍCONES DE CONFIGURAÇÃO, NOTIFICAÇÃO E AVATAR) */}
      <header className="bg-[#1bb55c] text-white shadow-xs sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-14">
          {/* Esquerda: Logo do SAP + Abas de Navegação */}
          <div className="flex items-center gap-6 sm:gap-8">
            <Link
              to="/"
              className="flex items-center gap-2.5 font-bold tracking-tight text-white hover:opacity-95"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center font-black text-sm text-white border border-white/25 shadow-xs">
                S
              </div>
              <div className="flex flex-col">
                <span className="text-base font-extrabold tracking-tight leading-none text-white">
                  SAP
                </span>
                <span className="text-[9px] font-medium text-emerald-100 uppercase tracking-wider">
                  Patrimonial
                </span>
              </div>
            </Link>

            {/* Abas desktop (visão geral, lançamentos, relatórios, etc.) */}
            <nav className="hidden lg:flex items-center gap-1 h-14">
              {topNavTabs.map((tab) => {
                const isActive =
                  tab.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(tab.path)
                return (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    className={`h-full flex items-center px-3.5 text-xs font-semibold lowercase transition relative ${
                      isActive
                        ? 'text-white font-bold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-t-sm" />
                    )}
                  </NavLink>
                )
              })}
            </nav>
          </div>

          {/* Direita: Seletor de Workspace + Botões de Config, Notificação e Avatar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dropdown de Workspaces */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium border border-white/20 transition">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="max-w-[130px] truncate">
                    {currentWorkspace?.workspace_nome || 'Workspace'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-white/70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="text-[11px] font-semibold text-slate-500">
                  Workspaces Familiares
                </DropdownMenuLabel>
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.workspace_id}
                    onClick={() => setCurrentWorkspace(ws)}
                    className={`text-xs cursor-pointer flex items-center justify-between ${
                      currentWorkspace?.workspace_id === ws.workspace_id
                        ? 'bg-emerald-50 text-emerald-700 font-medium'
                        : ''
                    }`}
                  >
                    <span className="truncate">{ws.workspace_nome}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{ws.perfil}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setNewWsDialogOpen(true)}
                  className="text-xs text-emerald-700 font-medium cursor-pointer flex items-center gap-2"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Novo Workspace</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Menu Dropdown de Cadastros Essenciais (Build 1) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium border border-white/20 transition"
                  title="Cadastros Essenciais"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Cadastros</span>
                  <ChevronDown className="w-3 h-3 text-white/70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="text-[11px] font-semibold text-slate-500">
                  Cadastros Essenciais
                </DropdownMenuLabel>
                {cadastrosDesktopItems.map((item) => (
                  <DropdownMenuItem
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="text-xs cursor-pointer flex items-center gap-2 py-2"
                  >
                    <item.icon className="w-4 h-4 text-emerald-600" />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/auditoria')}
                  className="text-xs cursor-pointer flex items-center gap-2"
                >
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Trilha de Auditoria</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Ícone de Configuração (Engrenagem) */}
            <Link
              to="/configuracoes"
              className="p-2 rounded-full hover:bg-white/15 text-white transition"
              title="Preferências"
            >
              <Settings className="w-4 h-4" />
            </Link>

            {/* Ícone de Notificações com badge */}
            <button
              onClick={() => toast.info('Nenhuma notificação pendente no momento')}
              className="p-2 rounded-full hover:bg-white/15 text-white transition relative"
              title="Notificações"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                1
              </span>
            </button>

            {/* Avatar do Usuário com Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 focus:outline-hidden">
                  <div className="w-8 h-8 rounded-full bg-white text-emerald-800 flex items-center justify-center font-bold text-xs ring-2 ring-white/40 shadow-xs">
                    {profile?.nome
                      ? profile.nome.charAt(0).toUpperCase()
                      : user?.email?.charAt(0).toUpperCase()}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="text-xs">
                  <div className="font-semibold text-slate-900">{profile?.nome || 'Usuário'}</div>
                  <div className="text-[11px] text-slate-500 font-normal truncate">
                    {user?.email}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-medium mt-1">
                    Perfil: {currentWorkspace?.perfil || 'Administrador'}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/configuracoes')}
                  className="text-xs cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 mr-2" />
                  <span>Preferências</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/auditoria')}
                  className="text-xs cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 mr-2" />
                  <span>Trilha de Auditoria</span>
                </DropdownMenuItem>
                {currentWorkspace?.perfil === 'Administrador' && (
                  <DropdownMenuItem
                    onClick={() => navigate('/usuarios')}
                    className="text-xs cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5 mr-2" />
                    <span>Membros & Permissões</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-xs text-rose-600 cursor-pointer flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Botão Hambúrguer Mobile */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-full hover:bg-white/15 text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* SUB-BARRA DE NAVEGAÇÃO SECUNDÁRIA (CADASTROS DA BUILD 1) */}
      <div className="hidden md:block bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-10 text-xs">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-slate-400 uppercase text-[10px] tracking-wider">
              Cadastros:
            </span>
            <NavLink
              to="/contas"
              className={({ isActive }) =>
                `flex items-center gap-1.5 transition font-medium ${
                  isActive ? 'text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Minhas Contas</span>
            </NavLink>

            <NavLink
              to="/cartoes"
              className={({ isActive }) =>
                `flex items-center gap-1.5 transition font-medium ${
                  isActive ? 'text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Meus Cartões</span>
            </NavLink>

            <NavLink
              to="/lancamentos"
              className={({ isActive }) =>
                `flex items-center gap-1.5 transition font-medium ${
                  isActive ? 'text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Lançamentos</span>
            </NavLink>

            <NavLink
              to="/categorias"
              className={({ isActive }) =>
                `flex items-center gap-1.5 transition font-medium ${
                  isActive ? 'text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Categorias & Subcategorias</span>
            </NavLink>

            <NavLink
              to="/orcamento"
              className={({ isActive }) =>
                `flex items-center gap-1.5 transition font-medium ${
                  isActive ? 'text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              <Target className="w-3.5 h-3.5" />
              <span>Orçamento Familiar</span>
            </NavLink>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Workspace: <strong>{currentWorkspace?.workspace_nome}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* DRAWER MOBILE COMPLETO */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="w-80 bg-white h-full flex flex-col p-4 shadow-xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                  S
                </div>
                <div className="text-sm font-bold text-slate-900">SAP — Menu</div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Workspace Ativo
              </div>
              <div className="text-xs font-semibold text-slate-800">
                {currentWorkspace?.workspace_nome}
              </div>
              <div className="text-[10px] text-emerald-700 font-medium">
                Perfil: {currentWorkspace?.perfil}
              </div>
            </div>

            <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
              <div className="text-[10px] uppercase font-bold text-slate-400 px-3 py-1">
                Navegação Principal
              </div>
              {topNavTabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium ${
                      isActive ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600'
                    }`
                  }
                >
                  <span className="capitalize">{tab.label}</span>
                  {tab.badge && (
                    <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {tab.badge}
                    </span>
                  )}
                </NavLink>
              ))}

              <div className="text-[10px] uppercase font-bold text-slate-400 px-3 pt-3 py-1">
                Cadastros Essenciais
              </div>
              {cadastrosMobileItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium ${
                      isActive ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 text-emerald-600" />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              <div className="text-[10px] uppercase font-bold text-slate-400 px-3 pt-3 py-1">
                Segurança & Governança
              </div>
              <NavLink
                to="/auditoria"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600"
              >
                <History className="w-4 h-4 text-slate-500" />
                <span>Trilha de Auditoria</span>
              </NavLink>
              {currentWorkspace?.perfil === 'Administrador' && (
                <NavLink
                  to="/usuarios"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600"
                >
                  <Users className="w-4 h-4 text-slate-500" />
                  <span>Membros & Permissões</span>
                </NavLink>
              )}
            </nav>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-700 truncate">{user?.email}</div>
              <Button size="sm" variant="outline" onClick={handleSignOut} className="text-xs">
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 pb-16 md:pb-8">
        <Outlet />
      </main>

      {/* BOTTOM NAV MOBILE (VIS-01 UX móvel Organizze/SAP) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around py-2 z-40 shadow-lg">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Início</span>
        </NavLink>
        <NavLink
          to="/contas"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'
            }`
          }
        >
          <Wallet className="w-5 h-5" />
          <span>Contas</span>
        </NavLink>
        <NavLink
          to="/cartoes"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-indigo-700 font-bold' : 'text-slate-500'
            }`
          }
        >
          <CreditCard className="w-5 h-5" />
          <span>Cartões</span>
        </NavLink>
        <NavLink
          to="/orcamento"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'
            }`
          }
        >
          <Target className="w-5 h-5" />
          <span>Orçamento</span>
        </NavLink>
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'
            }`
          }
        >
          <Settings className="w-5 h-5" />
          <span>Ajustes</span>
        </NavLink>
      </nav>

      {/* DIALOG: NOVO WORKSPACE FAMILIAR */}
      <Dialog open={newWsDialogOpen} onOpenChange={setNewWsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateWorkspace}>
            <DialogHeader>
              <DialogTitle>Criar Novo Espaço Familiar</DialogTitle>
              <DialogDescription>
                Cada workspace agrupa o patrimônio, contas e orçamentos da sua família ou projeto.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div>
                <Label htmlFor="ws-nome" className="text-xs">
                  Nome do Workspace
                </Label>
                <Input
                  id="ws-nome"
                  placeholder="Ex: Família Silva, Projetos Pessoais"
                  value={newWsNome}
                  onChange={(e) => setNewWsNome(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewWsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={creatingWs}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creatingWs ? 'Criando...' : 'Criar Workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
