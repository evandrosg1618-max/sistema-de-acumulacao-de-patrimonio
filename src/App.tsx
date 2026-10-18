import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import Layout from './components/Layout'
import Index from './pages/Index'
import Settings from './pages/Settings'
import Auditoria from './pages/Auditoria'
import Usuarios from './pages/Usuarios'
import ContasPage from './pages/ContasPage'
import CartoesPage from './pages/CartoesPage'
import MeiosPagamentoPage from './pages/MeiosPagamentoPage'
import CategoriasPage from './pages/CategoriasPage'
import OrcamentosPage from './pages/OrcamentosPage'
import PlaceholderPage from './pages/PlaceholderPage'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'

// Protected Route Guard
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-teal-400 gap-3">
        <div className="w-10 h-10 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-300">
          Carregando SAP — Sistema de Acumulação de Capital…
        </span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/entrar" replace />
  }

  return <>{children}</>
}

// Public Route Guard (redirects to / if logged in)
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

const AppRoutes = () => (
  <Routes>
    {/* Public Auth Routes */}
    <Route
      path="/entrar"
      element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      }
    />
    <Route
      path="/criar-conta"
      element={
        <PublicRoute>
          <Signup />
        </PublicRoute>
      }
    />
    <Route
      path="/recuperar-senha"
      element={
        <PublicRoute>
          <ForgotPassword />
        </PublicRoute>
      }
    />

    {/* Protected Application Routes wrapped in Layout */}
    <Route
      element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Index />} />
      <Route path="/configuracoes" element={<Settings />} />
      <Route path="/auditoria" element={<Auditoria />} />
      <Route path="/usuarios" element={<Usuarios />} />

      {/* Build 1: Cadastros Essenciais Reais (CRUDs completos conectados ao Supabase) */}
      <Route path="/contas" element={<ContasPage />} />
      <Route path="/cartoes" element={<CartoesPage />} />
      <Route path="/meios-pagamento" element={<MeiosPagamentoPage />} />
      <Route path="/categorias" element={<CategoriasPage />} />
      <Route path="/orcamento" element={<OrcamentosPage />} />

      {/* Rotas de transição para as próximas Builds do PRD */}
      <Route
        path="/lancamentos"
        element={
          <PlaceholderPage
            title="Lançamentos Financeiros"
            description="Registro ágil de receitas, despesas e transferências com calculadora e histórico detalhado."
            buildNumber={2}
            buildName="Lançamentos Únicos & Transferências"
            deliverables={[
              'Formulário unificado (Despesa, Receita, Transferência) conforme VIS-07 e VIS-11',
              'Calculadora integrada no valor confirmada pelo botão "="',
              'Transferências com liquidez patrimonial neutra',
              'Lista cronológica com filtros rápidos de conta e período conforme VIS-05',
            ]}
          />
        }
      />
      <Route
        path="/relatorios"
        element={
          <PlaceholderPage
            title="Relatórios & Gráficos Gerenciais"
            description="Distribuição por categorias, fluxo de caixa, evolução de patrimônio e comparativos."
            buildNumber={7}
            buildName="Relatórios & Metas"
            deliverables={[
              'Comprometimento geral da renda familiar',
              'Acumulação de Capital e Liberdade Financeira',
              'Relatórios detalhados com gráficos por período e centro de custo',
            ]}
          />
        }
      />
      <Route
        path="/fixos"
        element={
          <PlaceholderPage
            title="Lançamentos Fixos & Recorrentes"
            description="Séries recorrentes materializadas mês a mês sem antecipar faturas futuras de cartão."
            buildNumber={5}
            buildName="Fixos & Projeções"
            deliverables={[
              'Séries fixas com prazo determinado ou indeterminado',
              'Materialização idempotente por competência',
              'Escopos de alteração: Apenas este, Este e próximos, Todos',
            ]}
          />
        }
      />
    </Route>

    {/* Fallback 404 */}
    <Route path="*" element={<NotFound />} />
  </Routes>
)

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppRoutes />
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
