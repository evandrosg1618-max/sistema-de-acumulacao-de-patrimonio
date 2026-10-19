import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { invitationService } from '@/services/sap'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ShieldCheck,
  Users,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  UserPlus,
  LogIn,
} from 'lucide-react'

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user, refreshProfileAndWorkspaces } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [convite, setConvite] = useState<any>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aceitando, setAceitando] = useState(false)
  const [aceitoComSucesso, setAceitoComSucesso] = useState(false)

  useEffect(() => {
    if (!token) {
      setErro('Token de convite não informado.')
      setLoading(false)
      return
    }

    invitationService
      .getByToken(token)
      .then((data) => {
        if (!data || !data.encontrado) {
          setErro(data?.mensagem || 'Convite não encontrado ou inválido.')
        } else if (!data.valido) {
          setErro(data.mensagem || 'Este convite não é mais válido.')
          setConvite(data)
        } else {
          setConvite(data)
        }
      })
      .catch((err) => {
        setErro('Erro ao validar convite: ' + (err.message || ''))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  const handleAceitar = async () => {
    if (!token) return
    setAceitando(true)
    try {
      await invitationService.aceitar(token)
      toast.success('Convite aceito! Você agora faz parte do espaço familiar.')
      setAceitoComSucesso(true)
      if (convite?.workspace_id) {
        localStorage.setItem('sap_active_workspace_id', convite.workspace_id)
      }
      await refreshProfileAndWorkspaces()
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (err: any) {
      toast.error('Erro ao aceitar convite: ' + (err.message || ''))
    } finally {
      setAceitando(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-teal-400 gap-3 p-4">
        <div className="w-10 h-10 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-300">
          Verificando convite do espaço familiar SAP…
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-600 text-white font-bold text-2xl shadow-md">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Convite para Espaço Familiar
          </h1>
          <p className="text-xs text-slate-500">SAP — Sistema de Acumulação de Capital Familiar</p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600" />
              <span>Acesso Familiar</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {convite?.workspace_nome
                ? `Você foi convidado para o espaço "${convite.workspace_nome}"`
                : 'Convite de acesso'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {erro && !convite?.valido ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-rose-700 font-semibold text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Convite Inválido</span>
                </div>
                <p className="text-xs text-rose-600">{erro}</p>
                <div className="pt-2">
                  <Link to="/entrar">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      Ir para Login
                    </Button>
                  </Link>
                </div>
              </div>
            ) : aceitoComSucesso ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="font-bold text-sm text-emerald-900">Convite Aceito!</h3>
                <p className="text-xs text-emerald-700">
                  Redirecionando você para o painel da família...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Espaço Familiar:</span>
                    <span className="font-bold text-slate-800">{convite.workspace_nome}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">E-mail Convidado:</span>
                    <span className="font-mono text-slate-800">{convite.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Perfil atribuído:</span>
                    <Badge
                      variant="outline"
                      className="bg-teal-50 text-teal-800 border-teal-200 text-[10px]"
                    >
                      {convite.perfil}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Validade:</span>
                    <span className="text-[11px] text-slate-400">
                      Válido por 7 dias ({new Date(convite.expira_em).toLocaleDateString('pt-BR')})
                    </span>
                  </div>
                </div>

                {user ? (
                  <div className="space-y-3 pt-2">
                    <div className="p-2.5 bg-teal-50 border border-teal-200 rounded text-xs text-teal-900">
                      Você está conectado como <strong>{user.email}</strong>.
                    </div>
                    <Button
                      onClick={handleAceitar}
                      disabled={aceitando}
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                    >
                      {aceitando ? 'Entrando no workspace...' : 'Aceitar Convite e Entrar'}
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-slate-600">
                      Para aceitar este convite, cadastre sua conta ou entre com uma existente:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        to={`/criar-conta?invite=${token}&email=${encodeURIComponent(convite.email)}`}
                        className="w-full"
                      >
                        <Button
                          variant="default"
                          className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs"
                        >
                          <UserPlus className="w-3.5 h-3.5 mr-1" />
                          Criar Conta
                        </Button>
                      </Link>
                      <Link to={`/entrar?redirect=/convite/${token}`} className="w-full">
                        <Button variant="outline" className="w-full text-xs">
                          <LogIn className="w-3.5 h-3.5 mr-1" />
                          Fazer Login
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-center border-t border-slate-100 pt-3">
            <div className="text-center flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>Controle financeiro seguro com RLS por família</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
