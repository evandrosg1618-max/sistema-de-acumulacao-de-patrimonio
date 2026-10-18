import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { workspaceService, permissionsService } from '@/services/sap'
import { WorkspaceMember, Permission } from '@/types/sap'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Users, UserPlus, ShieldAlert, CheckCircle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

export default function UsuariosPage() {
  const { currentWorkspace, user } = useAuth()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePerfil, setInvitePerfil] = useState<'Administrador' | 'Cliente' | 'Colaborador'>(
    'Cliente',
  )

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarDados = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const [membrosData, permsData] = await Promise.all([
        workspaceService.getMembers(wsId),
        permissionsService.getPermissions(),
      ])
      setMembers(membrosData)
      setPermissions(permsData)
    } catch (err: any) {
      toast.error('Erro ao carregar usuários: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [wsId])

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    toast.info(
      'Convite por e-mail registrado para o workspace familiar. (Build 1 aprofunda o envio com tokens).',
    )
    setInviteModalOpen(false)
    setInviteEmail('')
  }

  const isAdmin = currentWorkspace?.perfil === 'Administrador'

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Administração de Usuários e Permissões
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Controle de acessos, perfis (Administrador, Cliente, Colaborador) e permissões
            granulares no workspace.
          </p>
        </div>

        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setInviteModalOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs flex items-center gap-1.5 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            Convidar Membro
          </Button>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800 text-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            Você está visualizando esta tela no modo consulta. Somente usuários com perfil de
            Administrador podem gerenciar perfis e convites.
          </span>
        </div>
      )}

      {/* LISTA DE MEMBROS */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Membros do Workspace</CardTitle>
          <CardDescription className="text-xs">
            Usuários com acesso concedido ao patrimônio deste espaço familiar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">Carregando membros...</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                      {member.user_nome?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                        <span>{member.user_nome}</span>
                        {member.user_id === user?.id && (
                          <Badge variant="outline" className="text-[9px] py-0">
                            Você
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">{member.user_email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge
                      className={`text-xs ${
                        member.perfil === 'Administrador'
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : member.perfil === 'Cliente'
                            ? 'bg-teal-100 text-teal-800 border-teal-200'
                            : 'bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                      variant="outline"
                    >
                      {member.perfil}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        member.status === 'ativo'
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-slate-500'
                      }`}
                    >
                      {member.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MATRIZ DE PERMISSÕES DO PRD */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            Permissões Granulares do Sistema (14 Códigos do PRD)
          </CardTitle>
          <CardDescription className="text-xs">
            Estrutura de segurança validada no backend para Colaboradores e Clientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {permissions.map((p) => (
              <div
                key={p.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-teal-800">{p.codigo}</span>
                  <Badge variant="outline" className="text-[10px] uppercase text-slate-500">
                    {p.modulo}
                  </Badge>
                </div>
                <div className="text-xs font-medium text-slate-800">{p.descricao}</div>
                <div className="text-[10px] text-slate-400">Ação: {p.acao}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* DIALOG DE CONVITE */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Convidar Membro para o Workspace</DialogTitle>
              <DialogDescription>
                O usuário receberá acesso ao espaço familiar conforme o perfil selecionado.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div>
                <Label htmlFor="inv-email" className="text-xs">
                  E-mail do Convidado
                </Label>
                <Input
                  id="inv-email"
                  type="email"
                  placeholder="exemplo@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div>
                <Label htmlFor="inv-perfil" className="text-xs">
                  Perfil de Acesso
                </Label>
                <select
                  id="inv-perfil"
                  value={invitePerfil}
                  onChange={(e: any) => setInvitePerfil(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="Administrador">
                    Administrador (acesso total, gestão de membros)
                  </option>
                  <option value="Cliente">Cliente (acesso operacional ao patrimônio)</option>
                  <option value="Colaborador">Colaborador (acesso restrito por escopo)</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white">
                Enviar Convite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
