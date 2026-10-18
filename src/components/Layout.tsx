import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Target,
  Repeat,
  Settings,
  Shield,
  History,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Wallet,
  Users,
  PlusCircle,
  Building2,
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

  const navItems = [
    { label: 'Visão Geral', path: '/', icon: LayoutDashboard },
    { label: 'Lançamentos', path: '/lancamentos', icon: ArrowLeftRight, badge: 'Build 2' },
    { label: 'Contas & Cartões', path: '/contas', icon: Wallet, badge: 'Build 1' },
    { label: 'Orçamento', path: '/orcamento', icon: Target, badge: 'Build 6' },
    { label: 'Fixos & Parcelados', path: '/fixos', icon: Repeat, badge: 'Build 5' },
    { label: 'Auditoria', path: '/auditoria', icon: History },
    { label: 'Preferências', path: '/configuracoes', icon: Settings },
  ]

  if (currentWorkspace?.perfil === 'Administrador') {
    navItems.push({
      label: 'Usuários & Permissões',
      path: '/usuarios',
      icon: Users,
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        {/* Brand & Workspace Selector */}
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              S
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight text-slate-900">SAP</div>
              <div className="text-[11px] text-slate-500 font-medium">Controle Patrimonial</div>
            </div>
          </div>

          {/* Workspace dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 hover:bg-slate-100 text-left border border-slate-200 text-xs transition">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="font-medium text-slate-700 truncate">
                    {currentWorkspace?.workspace_nome || 'Selecionar espaço'}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel className="text-[11px] font-semibold text-slate-500">
                Workspaces Familiares
              </DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.workspace_id}
                  onClick={() => setCurrentWorkspace(ws)}
                  className={`text-xs cursor-pointer flex items-center justify-between ${
                    currentWorkspace?.workspace_id === ws.workspace_id
                      ? 'bg-teal-50 text-teal-700 font-medium'
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
                className="text-xs text-teal-700 font-medium cursor-pointer flex items-center gap-2"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Novo Workspace Familiar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Perfil badge */}
          {currentWorkspace && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded">
              <span>Seu Perfil:</span>
              <span className="font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded text-[10px]">
                {currentWorkspace.perfil}
              </span>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-teal-50 text-teal-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer User Info */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
              {profile?.nome
                ? profile.nome.charAt(0).toUpperCase()
                : user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <div className="text-xs font-medium text-slate-800 truncate">
                {profile?.nome || 'Usuário'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sair da conta"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* TOPBAR MOBILE */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm">
            S
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">SAP</div>
            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
              {currentWorkspace?.workspace_nome || 'Sem workspace'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="w-72 bg-white h-full flex flex-col p-4 shadow-xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-900">Menu SAP</div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase mb-2">
                Workspace Ativo
              </div>
              <div className="text-xs font-semibold text-slate-800">
                {currentWorkspace?.workspace_nome}
              </div>
              <div className="text-[10px] text-teal-700 font-medium">
                Perfil: {currentWorkspace?.perfil}
              </div>
            </div>

            <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium ${
                        isActive ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-slate-600'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                )
              })}
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

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto min-h-0 pb-16 md:pb-6">
        <Outlet />
      </main>

      {/* MOBILE BOTTOM NAVIGATION (VIS-01 UX móvel até 5 destinos) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around py-1.5 z-40">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-teal-700 font-semibold' : 'text-slate-500'
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
              isActive ? 'text-teal-700 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Wallet className="w-5 h-5" />
          <span>Contas</span>
        </NavLink>
        <NavLink
          to="/auditoria"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-teal-700 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <History className="w-5 h-5" />
          <span>Auditoria</span>
        </NavLink>
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium ${
              isActive ? 'text-teal-700 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Settings className="w-5 h-5" />
          <span>Preferências</span>
        </NavLink>
      </nav>

      {/* DIALOG: NOVO WORKSPACE FAMILIAR */}
      <Dialog open={newWsDialogOpen} onOpenChange={setNewWsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateWorkspace}>
            <DialogHeader>
              <DialogTitle>Criar Novo Espaço Familiar</DialogTitle>
              <DialogDescription>
                Cada workspace agrupa o patrimônio, contas e orçamentos da sua família ou projeto
                financeiro.
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
                className="bg-teal-600 hover:bg-teal-700 text-white"
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
