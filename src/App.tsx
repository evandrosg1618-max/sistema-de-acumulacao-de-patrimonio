/* Main App Component - Handles routing, auth provider and layout */
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from './components/Layout'
import Index from './pages/Index'
import Analysis from './pages/Analysis'
import Watchlist from './pages/Watchlist'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'

// Protected Route Guard
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center text-[#17C3B2] gap-3">
        <div className="w-10 h-10 border-2 border-[#17C3B2] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-[#96A3B8]">Carregando Pulse Equity…</span>
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
      <Route path="/analise" element={<Analysis />} />
      <Route path="/watchlist" element={<Watchlist />} />
      <Route path="/configuracoes" element={<Settings />} />
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
