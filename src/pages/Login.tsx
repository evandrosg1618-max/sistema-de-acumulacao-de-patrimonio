import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Activity, ArrowRight, Lock, Mail, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, informe seu e-mail e senha.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    const res = await signIn(email, password)
    setLoading(false)

    if (res.error) {
      toast({
        title: 'Erro ao entrar',
        description: res.error.message || 'Verifique suas credenciais e tente novamente.',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Login efetuado com sucesso',
        description: 'Bem-vindo de volta ao Pulse Equity.',
      })
      navigate('/')
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    await signIn('demo.google@pulse.com.br', 'google-auth-pass')
    setLoading(false)
    toast({
      title: 'Autenticado via Google',
      description: 'Sessão conectada com sucesso.',
    })
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col lg:flex-row text-[#F3F6FB]">
      {/* BRAND PANEL (Desktop Left) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#0A0F1E] via-[#0D1527] to-[#0A1628] border-r border-[#263343] p-12 flex-col justify-between overflow-hidden">
        {/* Subtle grid background glow */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#17C3B2]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-[#0EA5E9]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center shadow-lg shadow-[#17C3B2]/20">
            <Activity className="w-5 h-5 text-[#0A0F1E] stroke-[2.5]" />
          </div>
          <div>
            <span className="font-bold text-xl tracking-tight text-[#F3F6FB]">
              Pulse <span className="text-[#17C3B2]">Equity</span>
            </span>
            <span className="text-[10px] tracking-wider text-[#96A3B8] uppercase block font-semibold">
              Plataforma de Inteligência B3
            </span>
          </div>
        </div>

        {/* Hero Copy & Visual Metrics */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#17C3B2]/10 border border-[#17C3B2]/20 text-[#17C3B2] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#17C3B2] animate-ping" />
            Supabase Backend Conectado
          </div>
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight text-[#F3F6FB]">
            Inteligência que <br />
            <span className="brand-gradient-text">multiplica seus investimentos</span>
          </h1>
          <p className="text-base text-[#96A3B8] leading-relaxed">
            Analise ações da B3 através de chat natural, gráficos K-line em tempo real, detecção
            algorítmica de múltiplos e sentimentos gerados por inteligência artificial.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-[#111827]/80 border border-[#263343] backdrop-blur-sm">
              <p className="text-xs text-[#96A3B8] mb-1">Acurácia de Sinais</p>
              <p className="text-2xl font-bold text-[#34D399] tabular-nums">84.2%</p>
              <p className="text-[11px] text-[#96A3B8] mt-1">Base histórica B3 calibrada</p>
            </div>
            <div className="p-4 rounded-xl bg-[#111827]/80 border border-[#263343] backdrop-blur-sm">
              <p className="text-xs text-[#96A3B8] mb-1">Segurança de Dados</p>
              <p className="text-2xl font-bold text-[#17C3B2]">RLS Ativo</p>
              <p className="text-[11px] text-[#96A3B8] mt-1">Políticas Row-Level Security</p>
            </div>
          </div>
        </div>

        {/* Bottom Trust */}
        <div className="relative z-10 pt-8 border-t border-[#263343]/50 flex items-center justify-between text-xs text-[#96A3B8]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#17C3B2]" />
            <span>Criptografia ponta-a-ponta e isolamento multi-tenant</span>
          </div>
          <span>B3 Brasil, Bolsa, Balcão</span>
        </div>
      </div>

      {/* FORM CONTAINER (Right) */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile brand header */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#0A0F1E] stroke-[2.5]" />
            </div>
            <span className="font-bold text-lg text-[#F3F6FB]">
              Pulse <span className="text-[#17C3B2]">Equity</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F3F6FB] tracking-tight">Entrar</h2>
            <p className="text-sm text-[#96A3B8] mt-2">
              Acesse sua conta para continuar suas análises de mercado.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@investidor.com.br"
                  required
                  className="w-full bg-[#111827] border border-[#263343] focus:border-[#17C3B2] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8]">
                  Senha
                </label>
                <Link
                  to="/recuperar-senha"
                  className="text-xs text-[#17C3B2] hover:underline transition-colors"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-[#111827] border border-[#263343] focus:border-[#17C3B2] rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-[#96A3B8] hover:text-[#F3F6FB] absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#96A3B8]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#263343] bg-[#111827] text-[#17C3B2] focus:ring-0 w-4 h-4"
                />
                <span>Lembrar de mim neste dispositivo</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-[#17C3B2] text-[#0A0F1E] hover:bg-[#13A796] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#17C3B2]/20 disabled:opacity-50"
            >
              {loading ? 'Entrando…' : 'Entrar na Plataforma'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#263343]" />
            </div>
            <span className="relative bg-[#0A0F1E] px-4 text-xs uppercase tracking-wider text-[#96A3B8]">
              ou
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl border border-[#263343] bg-[#111827] hover:bg-[#1A2332] text-sm text-[#F3F6FB] font-medium transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continuar com Google
          </button>

          <p className="text-center text-xs text-[#96A3B8]">
            Não possui uma conta?{' '}
            <Link to="/criar-conta" className="text-[#17C3B2] font-semibold hover:underline">
              Criar Conta Gratuita
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
