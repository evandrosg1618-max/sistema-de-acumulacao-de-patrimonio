import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Activity, ArrowRight, Lock, Mail, User, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

export default function Signup() {
  const { signUp, signIn } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-transparent' }
    let score = 0
    if (pass.length >= 6) score++
    if (pass.length >= 8 && /[A-Z]/.test(pass)) score++
    if (/[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass)) score++

    if (score === 1) return { score: 33, label: 'Fraca', color: 'bg-[#F87171]' }
    if (score === 2) return { score: 66, label: 'Média', color: 'bg-[#FBBF24]' }
    return { score: 100, label: 'Forte', color: 'bg-[#34D399]' }
  }

  const strength = getPasswordStrength(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName || !email || !password || !confirmPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos para prosseguir.',
        variant: 'destructive',
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Senhas não coincidem',
        description: 'Certifique-se de digitar a mesma senha nos dois campos.',
        variant: 'destructive',
      })
      return
    }

    if (password.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve conter ao menos 6 caracteres.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    const res = await signUp(email, password, fullName)
    setLoading(false)

    if (res.error) {
      toast({
        title: 'Falha ao cadastrar',
        description: res.error.message || 'Verifique as informações e tente novamente.',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Conta criada com sucesso!',
        description: 'Bem-vindo ao Pulse Equity. Seu ambiente já está configurado.',
      })
      navigate('/')
    }
  }

  const handleGoogleSignup = async () => {
    setLoading(true)
    await signIn('novo.google@pulse.com.br', 'google-auth-pass')
    setLoading(false)
    toast({
      title: 'Cadastrado com Google',
      description: 'Sua conta foi criada e vinculada.',
    })
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col lg:flex-row text-[#F3F6FB]">
      {/* BRAND PANEL (Desktop Left) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#0A0F1E] via-[#0D1527] to-[#0A1628] border-r border-[#263343] p-12 flex-col justify-between overflow-hidden">
        <div className="absolute top-1/3 -left-20 w-96 h-96 bg-[#17C3B2]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-[#0EA5E9]/10 rounded-full blur-3xl pointer-events-none" />

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

        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#17C3B2]/10 border border-[#17C3B2]/20 text-[#17C3B2] text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Supabase Auth &amp; Row Level Security
          </div>
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight text-[#F3F6FB]">
            Junte-se à nova era de <br />
            <span className="brand-gradient-text">investimentos com IA</span>
          </h1>
          <p className="text-base text-[#96A3B8] leading-relaxed">
            Obtenha relatórios preditivos instantâneos, gráficos interativos K-line e acompanhamento
            em tempo real de carteira conectado a um banco seguro.
          </p>

          <div className="p-4 rounded-xl bg-[#111827]/80 border border-[#263343] space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#17C3B2]">
              Incluso no seu plano:
            </p>
            <ul className="text-xs text-[#96A3B8] space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                Acesso irrestrito a todos os tickers da B3
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                Chat conversacional com análise de valuation e múltiplos
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                Watchlist sincronizada na nuvem com isolamento por usuário
              </li>
            </ul>
          </div>
        </div>

        <div className="relative z-10 pt-8 border-t border-[#263343]/50 text-xs text-[#96A3B8] flex justify-between">
          <span>Pulse Equity SaaS Brasil</span>
          <span>Versão 1.0.0</span>
        </div>
      </div>

      {/* FORM CONTAINER (Right) */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#0A0F1E] stroke-[2.5]" />
            </div>
            <span className="font-bold text-lg text-[#F3F6FB]">
              Pulse <span className="text-[#17C3B2]">Equity</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F3F6FB] tracking-tight">
              Criar Conta
            </h2>
            <p className="text-sm text-[#96A3B8] mt-2">
              Comece agora a potencializar suas decisões no mercado financeiro.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                Nome Completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: Carlos Andrade"
                  required
                  className="w-full bg-[#111827] border border-[#263343] focus:border-[#17C3B2] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@investimentos.com.br"
                  required
                  className="w-full bg-[#111827] border border-[#263343] focus:border-[#17C3B2] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8]">
                  Senha
                </label>
                {password && (
                  <span
                    className={`text-[11px] font-semibold ${
                      strength.label === 'Forte'
                        ? 'text-[#34D399]'
                        : strength.label === 'Média'
                          ? 'text-[#FBBF24]'
                          : 'text-[#F87171]'
                    }`}
                  >
                    Força: {strength.label}
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
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

              {/* Strength Meter Bar */}
              {password && (
                <div className="w-full h-1 bg-[#1A2332] rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-1.5">
                Confirmar Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita sua senha"
                  required
                  className="w-full bg-[#111827] border border-[#263343] focus:border-[#17C3B2] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-[#17C3B2] text-[#0A0F1E] hover:bg-[#13A796] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#17C3B2]/20 disabled:opacity-50 mt-2"
            >
              {loading ? 'Criando Conta…' : 'Criar Conta'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#263343]" />
            </div>
            <span className="relative bg-[#0A0F1E] px-4 text-xs uppercase tracking-wider text-[#96A3B8]">
              ou
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignup}
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
            Já tem uma conta?{' '}
            <Link to="/entrar" className="text-[#17C3B2] font-semibold hover:underline">
              Fazer Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
