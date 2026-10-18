import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { profileService, auditoriaService } from '@/services/sap'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Settings, Shield, User, Globe, Clock, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const { user, profile, currentWorkspace, refreshProfileAndWorkspaces } = useAuth()
  const [nome, setNome] = useState('')
  const [moeda, setMoeda] = useState('BRL')
  const [timezone, setTimezone] = useState('America/Porto_Velho')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setNome(profile.nome || '')
      setMoeda(profile.moeda || 'BRL')
      setTimezone(profile.timezone || 'America/Porto_Velho')
    }
  }, [profile])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      const updated = await profileService.updateProfile(user.id, {
        nome: nome.trim(),
        moeda,
        timezone,
      })

      if (currentWorkspace?.workspace_id) {
        await auditoriaService.registrar({
          workspace_id: currentWorkspace.workspace_id,
          entidade: 'profiles',
          entidade_id: user.id,
          acao: 'update_preferences',
          estado_anterior: profile,
          estado_posterior: updated,
          created_by: user.id,
        })
      }

      await refreshProfileAndWorkspaces()
      toast.success('Preferências salvas com sucesso!')
    } catch (err: any) {
      toast.error('Erro ao salvar preferências: ' + (err.message || 'tente novamente'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* HEADER VIS-18 */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-teal-600" />
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Preferências e Configurações
          </h1>
        </div>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Gerencie suas preferências de perfil, localização e parâmetros do sistema patrimonial.
        </p>
      </div>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="geral" className="text-xs">
            Geral & Perfil
          </TabsTrigger>
          <TabsTrigger value="localizacao" className="text-xs">
            Moeda & Fuso Horário
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="text-xs">
            Segurança & RLS
          </TabsTrigger>
        </TabsList>

        {/* ABA GERAL */}
        <TabsContent value="geral">
          <Card className="border-slate-200 shadow-sm">
            <form onSubmit={handleSaveProfile}>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Dados Pessoais</CardTitle>
                <CardDescription className="text-xs">
                  Informações de identificação associadas à sua conta.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="bg-slate-50 text-slate-500 text-xs cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-400">
                    O e-mail é gerenciado pela autenticação segura.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nome" className="text-xs">
                    Nome de Exibição
                  </Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                    className="text-xs"
                    required
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                  >
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </TabsContent>

        {/* ABA LOCALIZAÇÃO */}
        <TabsContent value="localizacao">
          <Card className="border-slate-200 shadow-sm">
            <form onSubmit={handleSaveProfile}>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Moeda e Fuso Horário</CardTitle>
                <CardDescription className="text-xs">
                  Configurações de formatação e competência financeira conforme o PRD SAP.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="moeda" className="text-xs flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      Moeda Padrão
                    </Label>
                    <select
                      id="moeda"
                      value={moeda}
                      onChange={(e) => setMoeda(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="BRL">Real Brasileiro (BRL - R$)</option>
                      <option value="USD">Dólar Americano (USD - $)</option>
                      <option value="EUR">Euro (EUR - €)</option>
                    </select>
                    <span className="text-[10px] text-slate-400">
                      Padrão obrigatório do PRD: BRL (numeric 14,2)
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="timezone" className="text-xs flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Timezone Financeiro
                    </Label>
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="America/Porto_Velho">America/Porto_Velho (UTC-4 - PRD)</option>
                      <option value="America/Sao_Paulo">
                        America/Sao_Paulo (UTC-3 - Brasília)
                      </option>
                      <option value="America/Manaus">America/Manaus (UTC-4)</option>
                      <option value="America/Belem">America/Belem (UTC-3)</option>
                      <option value="America/Fortaleza">America/Fortaleza (UTC-3)</option>
                    </select>
                    <span className="text-[10px] text-slate-400">
                      Fuso padrão do PRD: America/Porto_Velho
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                  >
                    {saving ? 'Salvando...' : 'Salvar Localização'}
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </TabsContent>

        {/* ABA SEGURANÇA */}
        <TabsContent value="seguranca">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal-600" />
                Segurança do Workspace e RLS
              </CardTitle>
              <CardDescription className="text-xs">
                Auditoria das camadas de segurança ativas no backend Supabase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-emerald-900">
                    Row-Level Security (RLS) Ativo em Todas as Tabelas
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Nenhum dado é compartilhado entre famílias ou workspaces diferentes. Todas as
                    consultas e modificações validam rigorosamente a membership ativa e o perfil do
                    usuário logado.
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-2 pt-2">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="font-medium">Identificador de Usuário (UUID)</span>
                  <span className="font-mono text-[11px] text-slate-500">{user?.id}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="font-medium">Workspace Ativo</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {currentWorkspace?.workspace_id}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="font-medium">Perfil Concedido</span>
                  <Badge variant="outline" className="text-teal-700 border-teal-300">
                    {currentWorkspace?.perfil}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
