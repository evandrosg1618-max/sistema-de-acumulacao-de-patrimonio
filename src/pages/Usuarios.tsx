import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { workspaceService, permissionsService, invitationService } from '@/services/sap'
import { WorkspaceMember, Permission } from '@/types/sap'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Users,
  UserPlus,
  ShieldAlert,
  CheckCircle,
  ShieldCheck,
  Copy,
  Clock,
  Trash2,
  XCircle,
  Link,
} from 'lucide-react'
import { toast } from 'sonner'

export default function UsuariosPage() {
  const { currentWorkspace, user } = useAuth()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePerfil, setInvitePerfil] = useState<'Administrador' | 'Cliente' | 'Colaborador'>(
    'Colaborador',
  )
  const [ultimoLinkGerado, setUltimoLinkGerado] = useState<string | null>(null)
  const [salvandoConvite, setSalvandoConvite] = useState(false)

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarDados = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const [membrosData, permsData, invitesData] = await Promise.all([
        workspaceService.getMembers(wsId),
        permissionsService.getPermissions(),
        invitationService.list(wsId),
      ])
      setMembers(membrosData)
      setPermissions(permsData)
      setInvitations(invitesData)
    } catch (err: any) {
      toast.error('Erro ao carregar usuários: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [wsId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsId) return
    const emailLimpo = inviteEmail.trim().toLowerCase()
    if (!emailLimpo || !emailLimpo.includes('@')) {
      toast.error('Informe um e-mail válido')
      return
    }

    setSalvandoConvite(true)
    try {
      const convite = await invitationService.create({
        workspace_id: wsId,
        email: emailLimpo,
        perfil: invitePerfil,
        userId: user?.id,
      })

      const linkConvite = `${window.location.origin}/signup?invite=${convite.token_hash}&email=${encodeURIComponent(
        emailLimpo,
      )}`
      setUltimoLinkGerado(linkConvite)
      toast.success(`Convite gerado para ${emailLimpo}! Copie o link abaixo para enviar.`)
      setInviteEmail('')
      await carregarDados()
    } catch (err: any) {
      toast.error('Erro ao criar convite: ' + (err.message || ''))
    } finally {
      setSalvandoConvite(false)
    }
  }

  const copiarLink = (link: string) => {
    navigator.clipboard.writeText(link)
    toast.success('Link copiado com sucesso!')
  }

  const handleCancelarConvite = async (inviteId: string) => {
    if (!wsId) return
    try {
      await invitationService.cancelar(inviteId, wsId, user?.id)
      toast.success('Convite cancelado.')
      await carregarDados()
    } catch (err: any) {
      toast.error('Erro ao cancelar convite: ' + (err.message || ''))
    }
  }

  const handleAlterarPerfil = async (
    memberId: string,
    novoPerfil: 'Administrador' | 'Cliente' | 'Colaborador',
  ) => {
    if (!wsId) return
    try {
      await workspaceService.updateMemberPerfil(memberId, wsId, novoPerfil, user?.id)
      toast.success(`Perfil atualizado para ${novoPerfil}!`)
      await carregarDados()
    } catch (err: any) {
      toast.error('Erro ao alterar perfil: ' + (err.message || ''))
    }
  }

  const handleRemoverMembro = async (memberId: string, nomeMembro: string) => {
    if (!wsId) return
    const confirmou = window.confirm(
      `Deseja realmente remover o membro "${nomeMembro}" da família?`,
    )
    if (!confirmou) return

    try {
      await workspaceService.removeMember(memberId, wsId, user?.id)
      toast.success(`Membro "${nomeMembro}" removido com sucesso.`)
      await carregarDados()
    } catch (err: any) {
      toast.error('Erro ao remover membro: ' + (err.message || ''))
    }
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
                    {isAdmin && member.user_id !== user?.id ? (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={member.perfil}
                          onValueChange={(val: any) => handleAlterarPerfil(member.id, val)}
                        >
                          <SelectTrigger className="h-7 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Administrador">Administrador</SelectItem>
                            <SelectItem value="Colaborador">Colaborador</SelectItem>
                            <SelectItem value="Cliente">Cliente</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleRemoverMembro(member.id, member.user_nome || 'Usuário')
                          }
                          className="h-7 w-7 text-slate-400 hover:text-rose-600"
                          title="Remover membro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
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
                    )}

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

      {/* CONVITES GERADOS */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Convites Gerados para a Família (
            {invitations.filter((i) => i.status === 'pendente').length})
          </CardTitle>
          <CardDescription className="text-xs">
            Links de acesso criados para novos membros (copie e envie por WhatsApp ou mensagem).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Nenhum convite pendente registrado.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {invitations.map((inv) => {
                const link = `${window.location.origin}/signup?invite=${inv.token_hash}&email=${encodeURIComponent(
                  inv.email,
                )}`
                const isPendente = inv.status === 'pendente'

                return (
                  <div
                    key={inv.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{inv.email}</span>
                        <Badge
                          variant="outline"
                          className={
                            isPendente
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }
                        >
                          {inv.status}
                        </Badge>
                        <span className="text-[11px] text-slate-500">
                          Perfil: <strong>{inv.perfil}</strong>
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Criado em {new Date(inv.created_at).toLocaleDateString('pt-BR')} • Válido
                        por 7 dias
                      </div>
                    </div>

                    {isPendente && (
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copiarLink(link)}
                          className="h-7 text-xs flex items-center gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Link</span>
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelarConvite(inv.id)}
                            className="h-7 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Cancelar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
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
                  E-mail do Convidado *
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
                  Perfil de Acesso *
                </Label>
                <select
                  id="inv-perfil"
                  value={invitePerfil}
                  onChange={(e: any) => setInvitePerfil(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="Colaborador">
                    Colaborador (registra receitas/despesas e consultas)
                  </option>
                  <option value="Cliente">Cliente (acesso operacional padrão)</option>
                  <option value="Administrador">
                    Administrador (acesso total, gestão de membros)
                  </option>
                </select>
              </div>

              {ultimoLinkGerado && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1.5 text-xs">
                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                    <span>Link gerado:</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copiarLink(ultimoLinkGerado)}
                      className="h-6 text-xs text-emerald-800"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <p className="font-mono text-[11px] text-emerald-800 break-all bg-white p-1.5 rounded border border-emerald-200">
                    {ultimoLinkGerado}
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    Envie este link para a pessoa. Ao se cadastrar, ela será vinculada com o perfil
                    escolhido.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>
                Fechar
              </Button>
              <Button
                type="submit"
                disabled={salvandoConvite}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
              >
                {salvandoConvite ? 'Gerando...' : 'Gerar Convite por Link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
