import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { contaService } from '@/services/sap'
import { Conta, TipoConta } from '@/types/sap'
import { formatMoneyBRL } from '@/lib/formatters'
import {
  Wallet,
  Plus,
  Edit2,
  Trash2,
  Landmark,
  PiggyBank,
  TrendingUp,
  Shield,
  Sparkles,
  Layers,
  Check,
  Building,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { LOGOS_BANCOS_OFICIAIS, renderMiniaturaLogo } from '@/components/LogomarcasOficiais'
import { AlertTriangle, Archive } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

const TIPOS_CONTA: { label: string; value: TipoConta; desc: string; icon: any }[] = [
  {
    label: 'Conta Corrente / Movimento',
    value: 'movimento',
    desc: 'Conta do dia a dia para recebimentos e despesas correntes',
    icon: Landmark,
  },
  {
    label: 'Provisão',
    value: 'provisao',
    desc: 'Contas de reserva para compromissos futuros esperados',
    icon: Layers,
  },
  {
    label: 'Investimento Geral',
    value: 'investimento',
    desc: 'Contas de corretora ou aplicações patrimoniais',
    icon: TrendingUp,
  },
  {
    label: 'Reserva de Emergência',
    value: 'Reserva de Emergência',
    desc: 'Patrimônio de alta liquidez e segurança imediata',
    icon: Shield,
  },
  {
    label: 'Reserva de Investimento',
    value: 'Reserva de Investimento',
    desc: 'Aportes e ativos para liberdade e rentabilidade futura',
    icon: PiggyBank,
  },
  {
    label: 'Reserva de Sonhos',
    value: 'Reserva de Sonhos',
    desc: 'Poupança para projetos familiares, viagens e realizações',
    icon: Sparkles,
  },
]

const PALETA_CORES = [
  '#10B981', // Verde Emerald
  '#0EA5E9', // Azul Sky
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#E11D48', // Rose
  '#64748B', // Slate
]

export default function ContasPage() {
  const { currentWorkspace, user } = useAuth()
  const [contas, setContas] = useState<Conta[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingConta, setEditingConta] = useState<Conta | null>(null)
  const [saving, setSaving] = useState(false)

  // Form State
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoConta>('movimento')
  const [saldoInicial, setSaldoInicial] = useState('0,00')
  const [cor, setCor] = useState('#10B981')
  const [icone, setIcone] = useState('wallet')

  // Modal padrão de exclusão / bloqueio referencial com opção de arquivar (6.2)
  const [dialogExclusaoOpen, setDialogExclusaoOpen] = useState(false)
  const [contaParaExcluir, setContaParaExcluir] = useState<Conta | null>(null)
  const [bloqueioExclusao, setBloqueioExclusao] = useState<{
    bloqueado: boolean
    motivo?: string
  }>({ bloqueado: false })

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined
  const isAdmin = currentWorkspace?.perfil === 'Administrador'

  const carregarContas = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const data = await contaService.list(wsId, false)
      setContas(data)
    } catch (err: any) {
      toast.error('Erro ao carregar contas: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarContas()
  }, [wsId])

  const abrirNovo = () => {
    setEditingConta(null)
    setNome('')
    setTipo('movimento')
    setSaldoInicial('0,00')
    setCor('#10B981')
    setIcone('wallet')
    setModalOpen(true)
  }

  const abrirEdicao = (c: Conta) => {
    setEditingConta(c)
    setNome(c.nome)
    setTipo(c.tipo)
    setSaldoInicial(c.saldo_inicial.toString().replace('.', ','))
    setCor(c.cor || '#10B981')
    setIcone(c.icone || 'wallet')
    setModalOpen(true)
  }

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Captura tanto pelo state do React quanto diretamente pelo FormData nativo para máxima resiliência
    const formElement = e.currentTarget
    const formData = new FormData(formElement)
    const formNome = (formData.get('nome') as string)?.trim() || nome.trim()
    const formSaldo = (formData.get('saldoInicial') as string) ?? saldoInicial

    if (!formNome) {
      toast.error('Informe o nome da conta')
      return
    }

    // Garante resolução do ID do workspace atual
    const activeWsId =
      wsId ||
      currentWorkspace?.workspace_id ||
      localStorage.getItem('sap_active_workspace_id') ||
      undefined

    if (!activeWsId) {
      toast.error('Nenhum espaço familiar selecionado. Atualize a página.')
      return
    }

    setSaving(true)
    try {
      const saldoNumerico = parseFloat(String(formSaldo).replace(/\./g, '').replace(',', '.')) || 0

      if (editingConta) {
        await contaService.update(
          editingConta.id,
          activeWsId,
          {
            nome: formNome,
            tipo,
            cor,
            icone,
          },
          user?.id,
        )
        toast.success(`Conta "${formNome}" atualizada com sucesso!`)
      } else {
        await contaService.create({
          workspace_id: activeWsId,
          nome: formNome,
          tipo,
          saldo_inicial: saldoNumerico,
          cor,
          icone,
          created_by: user?.id,
        })
        toast.success(`Conta "${formNome}" cadastrada com sucesso!`)
      }

      setModalOpen(false)
      await carregarContas()
    } catch (err: any) {
      toast.error('Erro ao salvar conta: ' + (err.message || 'verifique os dados'))
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (c: Conta) => {
    if (!wsId) return
    setContaParaExcluir(c)

    // Checagem atômica no banco de dados se há movimentação efetivada
    try {
      const checagem = await contaService.verificarPodeExcluir(wsId, c.id)
      if (!checagem.pode_excluir) {
        setBloqueioExclusao({
          bloqueado: true,
          motivo:
            checagem.motivo ||
            'Esta conta possui movimentações efetivadas e não pode ser excluída para preservar o histórico. Você pode arquivá-la e depois desarquivá-la quando desejar.',
        })
      } else {
        setBloqueioExclusao({ bloqueado: false })
      }
    } catch (e) {
      console.warn('Erro na checagem prévia de exclusão:', e)
      setBloqueioExclusao({ bloqueado: false })
    }

    setDialogExclusaoOpen(true)
  }

  const confirmarExclusao = async () => {
    if (!wsId || !contaParaExcluir) return
    try {
      await contaService.softDelete(contaParaExcluir.id, wsId, user?.id)
      toast.success(`Conta "${contaParaExcluir.nome}" removida com sucesso.`)
      setDialogExclusaoOpen(false)
      setContaParaExcluir(null)
      await carregarContas()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir conta.')
    }
  }

  const handleArquivarConta = async () => {
    if (!wsId || !contaParaExcluir) return
    try {
      await contaService.arquivar(contaParaExcluir.id, wsId, true, user?.id)
      toast.success(
        `Conta "${contaParaExcluir.nome}" arquivada com sucesso. Você poderá desarquivá-la a qualquer momento.`,
      )
      setDialogExclusaoOpen(false)
      setContaParaExcluir(null)
      await carregarContas()
    } catch (err: any) {
      toast.error('Erro ao arquivar conta: ' + (err.message || 'tente novamente'))
    }
  }

  const totalSaldoGeral = contas.reduce((acc, c) => acc + (c.saldo_atual || 0), 0)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Minhas Contas
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={abrirNovo}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova Conta
          </Button>
        </div>
      </div>

      {/* Card Resumo do Saldo Consolidado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white md:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Saldo Consolidado
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              <span className={totalSaldoGeral < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                {formatMoneyBRL(totalSaldoGeral)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              Soma do saldo de {contas.length}{' '}
              {contas.length === 1 ? 'conta ativa' : 'contas ativas'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white md:col-span-2 flex flex-col justify-center p-4">
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-slate-100">
            <div>
              <div className="text-[11px] text-slate-500 font-medium">Contas Correntes</div>
              <div className="text-base font-bold text-slate-800 mt-0.5">
                {contas.filter((c) => c.tipo === 'movimento').length}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">Reservas & Provisões</div>
              <div className="text-base font-bold text-slate-800 mt-0.5">
                {contas.filter((c) => c.tipo.includes('Reserva') || c.tipo === 'provisao').length}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">Investimentos</div>
              <div className="text-base font-bold text-slate-800 mt-0.5">
                {contas.filter((c) => c.tipo === 'investimento').length}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Lista de Contas */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Contas Cadastradas
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Clique para editar ou acompanhar os saldos por categoria de conta
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Carregando contas...</div>
          ) : contas.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Wallet className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">Nenhuma conta cadastrada</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Adicione suas contas correntes (Sicoob, Bradesco, Nubank) ou reservas patrimoniais
                para ver o saldo familiar.
              </p>
              <Button
                onClick={abrirNovo}
                variant="outline"
                size="sm"
                className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs"
              >
                Cadastrar Primeira Conta
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {contas.map((conta) => {
                const tipoObj = TIPOS_CONTA.find((t) => t.value === conta.tipo)
                const IconComponent = tipoObj?.icon || Wallet
                const isNegativo = (conta.saldo_atual || 0) < 0

                return (
                  <div
                    key={conta.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-xs"
                        style={{ backgroundColor: conta.cor || '#10B981' }}
                      >
                        {conta.icone && conta.icone.startsWith('logo-') ? (
                          renderMiniaturaLogo(conta.icone, 'w-8 h-8')
                        ) : (
                          <IconComponent className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-sm md:text-base">
                            {conta.nome}
                          </span>
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                            {tipoObj?.label || conta.tipo}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Saldo inicial: {formatMoneyBRL(conta.saldo_inicial)}</span>
                          <span>•</span>
                          <span>Conta manual</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div
                          className={`font-bold text-sm md:text-base ${
                            isNegativo ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {formatMoneyBRL(conta.saldo_atual)}
                        </div>
                        <div className="text-[11px] text-slate-400">Saldo atual</div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => abrirEdicao(conta)}
                          title="Editar conta"
                          className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExcluir(conta)}
                          title="Excluir conta"
                          className="h-8 w-8 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Cadastro/Edição de Conta */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle>
                {editingConta ? 'Editar Conta' : 'Nova Conta Bancária ou Reserva'}
              </DialogTitle>
              <DialogDescription>
                Cadastre contas de movimento diário, reservas de emergência ou investimentos
                patrimoniais.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="nome" className="text-xs font-semibold text-slate-700">
                  Nome da Conta *
                </Label>
                <Input
                  id="nome"
                  name="nome"
                  placeholder="Ex: SICOOB CONTA CORRENTE, Reserva de Emergência, Bradesco"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1"
                  autoFocus
                  required
                />
              </div>

              <div>
                <Label htmlFor="tipo" className="text-xs font-semibold text-slate-700">
                  Tipo de Conta (Classificação PRD) *
                </Label>
                <Select value={tipo} onValueChange={(val: any) => setTipo(val)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTA.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <div className="flex items-center gap-2">
                          <item.icon className="w-4 h-4 text-emerald-600" />
                          <span>{item.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {TIPOS_CONTA.find((t) => t.value === tipo)?.desc}
                </p>
              </div>

              {!editingConta && (
                <div>
                  <Label htmlFor="saldoInicial" className="text-xs font-semibold text-slate-700">
                    Saldo Inicial (R$) *
                  </Label>
                  <Input
                    id="saldoInicial"
                    name="saldoInicial"
                    placeholder="0,00"
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Valores negativos podem ser digitados com sinal de menos (ex: -19.934,00).
                  </p>
                </div>
              )}

              {/* Seletor de Logomarcas Oficiais de Bancos (6.1) */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Logomarca Oficial do Banco (Opcional)
                </Label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Selecione a miniatura oficial do seu banco ou mantenha o ícone padrão.
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {LOGOS_BANCOS_OFICIAIS.map((banco) => {
                    const isSelected = icone === banco.id
                    return (
                      <button
                        key={banco.id}
                        type="button"
                        onClick={() => {
                          setIcone(isSelected ? 'wallet' : banco.id)
                          if (!isSelected) {
                            setCor(banco.corFundo)
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                        title={banco.nome}
                      >
                        {renderMiniaturaLogo(banco.id, 'w-10 h-10')}
                        <span className="text-[10px] font-medium text-slate-700 truncate w-full mt-1.5">
                          {banco.nome}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Cor da Conta</Label>
                <div className="flex items-center gap-2 mt-2">
                  {PALETA_CORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCor(c)}
                      className="w-7 h-7 rounded-full border-2 transition flex items-center justify-center text-white"
                      style={{
                        backgroundColor: c,
                        borderColor: cor === c ? '#0f172a' : 'transparent',
                      }}
                    >
                      {cor === c && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Salvando...' : editingConta ? 'Salvar Alterações' : 'Criar Conta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Caixa de diálogo padrão do sistema para Exclusão / Bloqueio com movimentação (6.2) */}
      <AlertDialog open={dialogExclusaoOpen} onOpenChange={setDialogExclusaoOpen}>
        <AlertDialogContent className="bg-white text-slate-900 border-slate-200">
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  bloqueioExclusao.bloqueado
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {bloqueioExclusao.bloqueado ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
              </div>
              <AlertDialogTitle className="text-base font-bold text-slate-900">
                {bloqueioExclusao.bloqueado
                  ? 'Conta com Movimentações Efetivadas'
                  : 'Excluir Conta Bancária'}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              {bloqueioExclusao.bloqueado ? (
                <>
                  {bloqueioExclusao.motivo}
                  <br />
                  <br />
                  Deseja <strong>arquivar</strong> a conta &ldquo;{contaParaExcluir?.nome}&rdquo;?
                  Ela deixará de aparecer na lista ativa, e você poderá desarquivá-la quando
                  desejar.
                </>
              ) : (
                `Deseja realmente desativar/excluir a conta "${contaParaExcluir?.nome}"? Ela deixará de aparecer na lista ativa.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 gap-2">
            <AlertDialogCancel
              onClick={() => {
                setDialogExclusaoOpen(false)
                setContaParaExcluir(null)
              }}
            >
              Cancelar
            </AlertDialogCancel>
            {bloqueioExclusao.bloqueado ? (
              <Button
                type="button"
                onClick={handleArquivarConta}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                Arquivar Conta
              </Button>
            ) : (
              <AlertDialogAction
                onClick={confirmarExclusao}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Confirmar Exclusão
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
