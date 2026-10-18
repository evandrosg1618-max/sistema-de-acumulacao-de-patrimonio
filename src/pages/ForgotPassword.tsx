import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast({
        title: 'E-mail obrigatório',
        description: 'Digite seu e-mail cadastrado.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    const res = await resetPassword(email)
    setLoading(false)

    if (res.error) {
      toast({
        title: 'Erro no envio',
        description: res.error.message || 'Não foi possível enviar as instruções.',
        variant: 'destructive',
      })
    } else {
      setSent(true)
      toast({
        title: 'Instruções enviadas',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-6 text-[#F3F6FB]">
      <div className="w-full max-w-md bg-[#111827] border border-[#263343] rounded-2xl p-8 shadow-2xl relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#17C3B2] to-[#0EA5E9] flex items-center justify-center">
            <Activity className="w-5 h-5 text-[#0A0F1E] stroke-[2.5]" />
          </div>
          <span className="font-bold text-lg text-[#F3F6FB]">
            Pulse <span className="text-[#17C3B2]">Equity</span>
          </span>
        </div>

        {sent ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 bg-[#34D399]/20 text-[#34D399] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">Verifique seu e-mail</h2>
            <p className="text-xs text-[#96A3B8] leading-relaxed">
              Enviamos um link de recuperação para <strong>{email}</strong>. Siga as instruções para
              cadastrar sua nova senha.
            </p>
            <Link
              to="/entrar"
              className="inline-flex items-center gap-2 text-xs text-[#17C3B2] hover:underline pt-4 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao Login
            </Link>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold text-[#F3F6FB] tracking-tight">Recuperar Senha</h2>
            <p className="text-xs text-[#96A3B8] mt-2 mb-6">
              Informe seu e-mail cadastrado e enviaremos um link para criar uma nova senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#96A3B8] mb-2">
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#96A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com.br"
                    required
                    className="w-full bg-[#1A2332] border border-[#263343] focus:border-[#17C3B2] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#F3F6FB] placeholder-[#96A3B8] outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-[#17C3B2] text-[#0A0F1E] hover:bg-[#13A796] transition-all disabled:opacity-50"
              >
                {loading ? 'Enviando…' : 'Enviar Link de Redefinição'}
              </button>
            </form>

            <div className="pt-6 mt-6 border-t border-[#263343] text-center">
              <Link
                to="/entrar"
                className="inline-flex items-center gap-2 text-xs text-[#96A3B8] hover:text-[#F3F6FB] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar para o login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
