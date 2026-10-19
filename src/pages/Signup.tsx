import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { invitationService } from '@/services/sap'
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
import { ShieldCheck, User, Lock, Mail, Users } from 'lucide-react'

export default function Signup() {
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const emailParam = searchParams.get('email')

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState(emailParam || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp, refreshProfileAndWorkspaces } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !nome) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    if (password.length < 8) {
      toast.error('A senha deve conter no mínimo 8 caracteres')
      return
    }

    setLoading(true)
    try {
      const { error } = await signUp(email, password, nome)
      if (error) {
        toast.error('Erro ao cadastrar: ' + (error.message || 'Verifique seus dados'))
      } else {
        // Se houver inviteToken, redireciona para a rota do convite para aceitá-lo automaticamente
        if (inviteToken) {
          try {
            await invitationService.aceitar(inviteToken)
            toast.success('Cadastro realizado e convite aceito com sucesso!')
            await refreshProfileAndWorkspaces()
            navigate('/')
            return
          } catch (invErr) {
            console.warn('Auto-aceite falhou, direcionando para tela de convite:', invErr)
            navigate(`/convite/${inviteToken}`)
            return
          }
        }

        toast.success('Cadastro realizado! Seu espaço familiar foi gerado.')
        navigate('/')
      }
    } catch (err: any) {
      toast.error('Ocorreu um erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-600 text-white font-bold text-2xl shadow-md">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Criar Espaço Familiar no SAP
          </h1>
          <p className="text-xs text-slate-500">
            Comece a organizar e acumular o patrimônio da sua família
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Novo Cadastro</span>
                {inviteToken && (
                  <span className="text-[11px] font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    Com Convite
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {inviteToken
                  ? 'Cadastre-se para aceitar o convite e acessar o espaço familiar compartilhado.'
                  : 'Ao se cadastrar, seu perfil e seu primeiro workspace familiar são provisionados automaticamente.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Nome Completo
                </Label>
                <Input
                  id="nome"
                  type="text"
                  placeholder="Ex: Carlos Oliveira"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

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
                <Label htmlFor="password" className="text-xs flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Senha (mínimo 8 dígitos)
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                {loading ? 'Cadastrando...' : 'Criar Conta e Iniciar'}
              </Button>

              <div className="text-center text-xs text-slate-500">
                Já possui uma conta?{' '}
                <Link
                  to="/entrar"
                  className="text-teal-600 hover:text-teal-700 font-medium hover:underline"
                >
                  Fazer login
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>

        <div className="text-center flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>Isolamento total por Workspace e Row-Level Security</span>
        </div>
      </div>
    </div>
  )
}
