import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { ShieldCheck, Lock, Mail } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Preencha e-mail e senha')
      return
    }

    setLoading(true)
    try {
      const { error } = await signIn(email, password)
      if (error) {
        toast.error('Falha ao autenticar: ' + (error.message || 'Verifique seus dados'))
      } else {
        toast.success('Login realizado com sucesso!')
        navigate('/')
      }
    } catch (err: any) {
      toast.error('Ocorreu um erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  const handleFillSeedUser = () => {
    setEmail('evandro.s.g1618@gmail.com')
    setPassword('Skip@Pass')
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* LOGO & CABEÇALHO */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-600 text-white font-bold text-2xl shadow-md">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sistema de Acumulação de Patrimônio — SAP
          </h1>
          <p className="text-xs text-slate-500">Controle financeiro e patrimonial familiar</p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">Acessar Conta</CardTitle>
              <CardDescription className="text-xs">
                Entre com seu e-mail e senha para acessar seu espaço patrimonial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Senha
                  </Label>
                  <Link
                    to="/recuperar-senha"
                    className="text-[11px] text-teal-600 hover:text-teal-700 hover:underline"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              {/* Botão facilitador para a conta semente homologada */}
              <button
                type="button"
                onClick={handleFillSeedUser}
                className="w-full text-left p-2.5 rounded-lg border border-teal-200 bg-teal-50/50 hover:bg-teal-50 text-[11px] text-teal-900 transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">Usuário de Teste Criado:</div>
                  <div className="text-slate-600 font-mono text-[10px]">
                    evandro.s.g1618@gmail.com
                  </div>
                </div>
                <span className="text-[10px] font-medium text-teal-700 bg-white px-2 py-1 rounded shadow-xs">
                  Preencher
                </span>
              </button>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                {loading ? 'Entrando...' : 'Entrar no SAP'}
              </Button>

              <div className="text-center text-xs text-slate-500">
                Não tem uma conta?{' '}
                <Link
                  to="/criar-conta"
                  className="text-teal-600 hover:text-teal-700 font-medium hover:underline"
                >
                  Cadastre-se
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>

        <div className="text-center flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>Autenticação real via Supabase Auth com RLS</span>
        </div>
      </div>
    </div>
  )
}
