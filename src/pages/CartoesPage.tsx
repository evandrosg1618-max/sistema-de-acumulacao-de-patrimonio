import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { cartaoService, faturaService, contaService, lancamentoService } from '@/services/sap'
import { Cartao, Fatura, Conta, Lancamento } from '@/types/sap'
import { formatMoneyBRL, getCurrentAnoMes } from '@/lib/formatters'
import {
  CreditCard,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  AlertCircle,
  Check,
  ShieldCheck,
  Sparkles,
  Receipt,
  CheckCircle2,
  Clock,
  RotateCcw,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { ModalPagamentoFatura } from '@/components/ModalPagamentoFatura'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

const BANDEIRAS = ['Mastercard', 'Visa', 'Elo', 'American Express', 'Hipercard', 'Outro']

const PALETA_CORES = [
  '#4F46E5', // Indigo
  '#2563EB', // Blue
  '#9333EA', // Purple
  '#DB2777', // Pink
  '#E11D48', // Rose
  '#D97706', // Amber
  '#059669', // Emerald
  '#0891B2', // Cyan
  '#1E293B', // Slate Escuro
]

export default function CartoesPage() {
  const { currentWorkspace, user } = useAuth()
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [faturasMap, setFaturasMap] = useState<Record<string, Fatura[]>>({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCartao, setEditingCartao] = useState<Cartao | null>(null)
  const [saving, setSaving] = useState(false)

  // Gestão de faturas
  const [cartaoExpandido, setCartaoExpandido] = useState<string | null>(null)
  const [faturaParaPagar, setFaturaParaPagar] = useState<Fatura | null>(null)
  const [cartaoFaturaPagar, setCartaoFaturaPagar] = useState<Cartao | null>(null)
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false)
  const [lancamentosFatura, setLancamentosFatura] = useState<Record<string, Lancamento[]>>({})
  const [carregandoDetalheFatura, setCarregandoDetalheFatura] = useState<string | null>(null)

  // Form
  const [nome, setNome] = useState('')
  const [bandeira, setBandeira] = useState('Mastercard')
  const [diaFechamento, setDiaFechamento] = useState('10')
  const [diaVencimento, setDiaVencimento] = useState('20')
  const [limite, setLimite] = useState('5.000,00')
  const [cor, setCor] = useState('#4F46E5')

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarCartoes = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const [data, contasList] = await Promise.all([
        cartaoService.list(wsId, false),
        contaService.list(wsId, false),
      ])
      setCartoes(data)
      setContas(contasList)

      // Carregar histórico de faturas para cada cartão
      const faturasTemp: Record<string, Fatura[]> = {}
      for (const c of data) {
        const fats = await faturaService.listFaturasCartao(wsId, c.id)
        faturasTemp[c.id] = fats
      }
      setFaturasMap(faturasTemp)
    } catch (err: any) {
      toast.error('Erro ao carregar cartões: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  const verLancamentosDaFatura = async (cartaoId: string, faturaId: string, comp: string) => {
    if (!wsId) return
    if (lancamentosFatura[faturaId]) {
      // Toggle
      const copy = { ...lancamentosFatura }
      delete copy[faturaId]
      setLancamentosFatura(copy)
      return
    }

    setCarregandoDetalheFatura(faturaId)
    try {
      const lancs = await lancamentoService.list(wsId, {
        cartaoId: cartaoId,
        competencia: comp,
      })
      setLancamentosFatura((prev) => ({ ...prev, [faturaId]: lancs }))
    } catch (err: any) {
      toast.error('Erro ao carregar compras da fatura')
    } finally {
      setCarregandoDetalheFatura(null)
    }
  }

  const abrirModalPagarFatura = (fatura: Fatura, cartao: Cartao) => {
    setFaturaParaPagar(fatura)
    setCartaoFaturaPagar(cartao)
    setModalPagamentoOpen(true)
  }

  const handlePagarFatura = async (dados: {
    faturaId: string
    contaId: string
    valor: number
    dataPagamento: string
  }) => {
    if (!wsId) return
    try {
      await faturaService.pagarFatura({
        workspace_id: wsId,
        fatura_id: dados.faturaId,
        conta_id: dados.contaId,
        valor: dados.valor,
        data_pagamento: dados.dataPagamento,
        userId: user?.id,
      })
      toast.success('Fatura quitada com sucesso! Saldo bancário baixado.')
      await carregarCartoes()
    } catch (err: any) {
      toast.error('Erro ao pagar fatura: ' + (err.message || ''))
      throw err
    }
  }

  const handleEstornarFatura = async (faturaId: string) => {
    if (!wsId) return
    const confirma = window.confirm(
      'Deseja reabrir esta fatura? O pagamento será estornado e o saldo bancário recomposto.',
    )
    if (!confirma) return

    try {
      await faturaService.estornarPagamentoFatura(faturaId, wsId, user?.id)
      toast.success('Pagamento estornado e fatura reaberta.')
      await carregarCartoes()
    } catch (err: any) {
      toast.error('Erro ao reabrir fatura: ' + (err.message || ''))
    }
  }

  useEffect(() => {
    carregarCartoes()
  }, [wsId])

  const abrirNovo = () => {
    setEditingCartao(null)
    setNome('')
    setBandeira('Mastercard')
    setDiaFechamento('10')
    setDiaVencimento('20')
    setLimite('5.000,00')
    setCor('#4F46E5')
    setModalOpen(true)
  }

  const abrirEdicao = (c: Cartao) => {
    setEditingCartao(c)
    setNome(c.nome)
    setBandeira(c.bandeira || 'Outro')
    setDiaFechamento(c.dia_fechamento.toString())
    setDiaVencimento(c.dia_vencimento.toString())
    setLimite(c.limite.toString().replace('.', ','))
    setCor(c.cor || '#4F46E5')
    setModalOpen(true)
  }

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formElement = e.currentTarget
    const formData = new FormData(formElement)
    const formNome = (formData.get('nome') as string)?.trim() || nome.trim()
    const formLimite = (formData.get('limite') as string) ?? limite
    const formFechamento = (formData.get('fechamento') as string) ?? diaFechamento
    const formVencimento = (formData.get('vencimento') as string) ?? diaVencimento

    if (!formNome) {
      toast.error('Informe o nome do cartão')
      return
    }

    const activeWsId =
      wsId ||
      currentWorkspace?.workspace_id ||
      localStorage.getItem('sap_active_workspace_id') ||
      undefined

    if (!activeWsId) {
      toast.error('Nenhum espaço familiar selecionado. Atualize a página.')
      return
    }

    const df = parseInt(String(formFechamento), 10)
    const dv = parseInt(String(formVencimento), 10)
    if (isNaN(df) || df < 1 || df > 31 || isNaN(dv) || dv < 1 || dv > 31) {
      toast.error('Dias de fechamento e vencimento devem estar entre 1 e 31')
      return
    }

    const limiteNum = parseFloat(String(formLimite).replace(/\./g, '').replace(',', '.')) || 0

    setSaving(true)
    try {
      if (editingCartao) {
        await cartaoService.update(
          editingCartao.id,
          activeWsId,
          {
            nome: formNome,
            bandeira,
            dia_fechamento: df,
            dia_vencimento: dv,
            limite: limiteNum,
            cor,
          },
          user?.id,
        )
        toast.success(`Cartão "${formNome}" atualizado com sucesso!`)
      } else {
        await cartaoService.create({
          workspace_id: activeWsId,
          nome: formNome,
          bandeira,
          dia_fechamento: df,
          dia_vencimento: dv,
          limite: limiteNum,
          cor,
          created_by: user?.id,
        })
        toast.success(`Cartão "${formNome}" cadastrado com sucesso!`)
      }

      setModalOpen(false)
      await carregarCartoes()
    } catch (err: any) {
      toast.error('Erro ao salvar cartão: ' + (err.message || 'verifique os dados'))
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (c: Cartao) => {
    if (!wsId) return
    const confirma = window.confirm(
      `Deseja realmente desativar o cartão "${c.nome}"? Ele deixará de aparecer na lista ativa.`,
    )
    if (!confirma) return

    try {
      await cartaoService.softDelete(c.id, wsId, user?.id)
      toast.success(`Cartão "${c.nome}" desativado.`)
      await carregarCartoes()
    } catch (err: any) {
      toast.error('Erro ao excluir cartão: ' + (err.message || 'tente novamente'))
    }
  }

  const limiteTotal = cartoes.reduce((acc, c) => acc + (c.limite || 0), 0)
  const faturaTotal = cartoes.reduce((acc, c) => acc + (c.fatura_atual || 0), 0)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Meus Cartões de Crédito
            </h1>
            <Badge
              variant="outline"
              className="text-indigo-700 bg-indigo-50 border-indigo-200 text-xs"
            >
              Build 1
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Cadastre cartões com dia de fechamento, vencimento e limite de crédito para faturamento
            familiar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={abrirNovo}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Cartão
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Limite Total Consolidado
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {formatMoneyBRL(limiteTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              Soma de {cartoes.length}{' '}
              {cartoes.length === 1 ? 'cartão cadastrado' : 'cartões cadastrados'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Faturas Abertas (Atual)
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600">
              {formatMoneyBRL(faturaTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Consumido no mês corrente</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Limite Disponível Geral
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {formatMoneyBRL(Math.max(0, limiteTotal - faturaTotal))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Margem livre para gastos familiares</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Cartões */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              Cartões Ativos
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Acompanhe fechamento, vencimento e limite individual
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Carregando cartões...</div>
          ) : cartoes.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">Nenhum cartão cadastrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Cadastre seus cartões de crédito (Nubank Ultravioleta, C6 Carbon, Itaú, etc.) para
                gerenciar faturas.
              </p>
              <Button
                onClick={abrirNovo}
                variant="outline"
                size="sm"
                className="text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs"
              >
                Cadastrar Primeiro Cartão
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cartoes.map((cartao) => {
                const fatura = cartao.fatura_atual || 0
                return (
                  <div key={cartao.id} className="transition">
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-8 rounded-md flex items-center justify-center text-white font-bold shrink-0 shadow-xs"
                          style={{ backgroundColor: cartao.cor || '#4F46E5' }}
                        >
                          <CreditCard className="w-5 h-5" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm md:text-base">
                              {cartao.nome}
                            </span>
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                              {cartao.bandeira}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>Fecha dia {cartao.dia_fechamento}</span>
                            <span>•</span>
                            <span>Vence dia {cartao.dia_vencimento}</span>
                            <span>•</span>
                            <span>Limite: {formatMoneyBRL(cartao.limite)}</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-medium">
                              Disponível: {formatMoneyBRL(Math.max(0, cartao.limite - fatura))}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-auto w-full sm:w-auto">
                        <div className="text-right">
                          <div className="font-bold text-sm md:text-base text-rose-600">
                            {formatMoneyBRL(fatura)}
                          </div>
                          <div className="text-[11px] text-slate-400">Fatura aberta</div>
                        </div>

                        <button
                          onClick={() =>
                            setCartaoExpandido(cartaoExpandido === cartao.id ? null : cartao.id)
                          }
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                        >
                          <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Faturas</span>
                          {cartaoExpandido === cartao.id ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirEdicao(cartao)}
                            title="Editar cartão"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleExcluir(cartao)}
                            title="Desativar cartão"
                            className="h-8 w-8 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Detalhes das faturas abertas e fechadas deste cartão */}
                    {cartaoExpandido === cartao.id && (
                      <div className="bg-slate-50/80 p-4 border-t border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Histórico de Faturas & Fechamentos
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Ciclo de corte dia {cartao.dia_fechamento} • Vencimento dia{' '}
                            {cartao.dia_vencimento}
                          </span>
                        </div>

                        {!faturasMap[cartao.id] || faturasMap[cartao.id].length === 0 ? (
                          <div className="p-4 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                            Nenhuma fatura gerada para este cartão. Ao lançar despesas no cartão, a
                            fatura correspondente é gerada automaticamente.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {faturasMap[cartao.id].map((fat) => {
                              const isPaga = fat.status === 'paga'
                              const lancs = lancamentosFatura[fat.id]
                              const estaCarregando = carregandoDetalheFatura === fat.id

                              return (
                                <div
                                  key={fat.id}
                                  className="bg-white rounded-lg border border-slate-200 p-3 space-y-2"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Receipt className="w-4 h-4 text-indigo-600" />
                                      <span className="text-xs font-bold text-slate-800">
                                        Fatura {fat.competencia}
                                      </span>
                                      <Badge
                                        className={`text-[10px] py-0 ${
                                          isPaga
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                            : 'bg-amber-100 text-amber-800 border-amber-200'
                                        }`}
                                      >
                                        {isPaga ? 'Paga' : 'Aberta'}
                                      </Badge>
                                      <span className="text-[11px] text-slate-400">
                                        Vencimento:{' '}
                                        {fat.data_vencimento
                                          ? fat.data_vencimento.split('-').reverse().join('/')
                                          : 'N/D'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3 self-end sm:self-auto">
                                      <span className="text-xs font-bold text-slate-900">
                                        {formatMoneyBRL(fat.valor_total)}
                                      </span>

                                      {!isPaga ? (
                                        <Button
                                          size="sm"
                                          onClick={() => abrirModalPagarFatura(fat, cartao)}
                                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                          Pagar Fatura
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleEstornarFatura(fat.id)}
                                          className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                          Reabrir
                                        </Button>
                                      )}

                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          verLancamentosDaFatura(cartao.id, fat.id, fat.competencia)
                                        }
                                        className="h-7 text-[11px] text-slate-500"
                                      >
                                        {lancs ? 'Ocultar compras' : 'Ver compras'}
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Detalhes dos lançamentos desta fatura */}
                                  {estaCarregando && (
                                    <div className="text-xs text-slate-400 py-2">
                                      Carregando compras desta fatura...
                                    </div>
                                  )}

                                  {lancs && (
                                    <div className="pt-2 border-t border-slate-100 space-y-1">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase">
                                        Compras na fatura ({lancs.length}):
                                      </div>
                                      {lancs.length === 0 ? (
                                        <div className="text-xs text-slate-400">
                                          Nenhuma compra ativa nesta fatura.
                                        </div>
                                      ) : (
                                        <div className="space-y-1 max-h-48 overflow-y-auto">
                                          {lancs.map((l) => (
                                            <div
                                              key={l.id}
                                              className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-50"
                                            >
                                              <div className="flex items-center gap-2">
                                                <span className="text-slate-400 text-[10px]">
                                                  {l.data
                                                    ? l.data.split('-').reverse().join('/')
                                                    : ''}
                                                </span>
                                                <span className="font-medium text-slate-800">
                                                  {l.descricao}
                                                </span>
                                              </div>
                                              <span className="font-bold text-rose-600">
                                                {formatMoneyBRL(l.valor)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
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

      {/* Modal de Pagamento de Fatura */}
      <ModalPagamentoFatura
        open={modalPagamentoOpen}
        onOpenChange={setModalPagamentoOpen}
        fatura={faturaParaPagar}
        nomeCartao={cartaoFaturaPagar?.nome}
        contas={contas}
        onConfirmar={handlePagarFatura}
      />

      {/* Modal Cadastro/Edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle>
                {editingCartao ? 'Editar Cartão de Crédito' : 'Novo Cartão de Crédito'}
              </DialogTitle>
              <DialogDescription>
                Informe o limite e os dias de corte e vencimento para a conciliação de faturas.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="nome-cartao" className="text-xs font-semibold text-slate-700">
                  Nome do Cartão *
                </Label>
                <Input
                  id="nome-cartao"
                  name="nome"
                  placeholder="Ex: Nubank Ultravioleta, C6 Black, XP Infinite"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bandeira" className="text-xs font-semibold text-slate-700">
                    Bandeira
                  </Label>
                  <Select value={bandeira} onValueChange={setBandeira}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Bandeira" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANDEIRAS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="limite" className="text-xs font-semibold text-slate-700">
                    Limite Total (R$) *
                  </Label>
                  <Input
                    id="limite"
                    name="limite"
                    placeholder="5.000,00"
                    value={limite}
                    onChange={(e) => setLimite(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fechamento" className="text-xs font-semibold text-slate-700">
                    Dia de Fechamento (Corte) *
                  </Label>
                  <Input
                    id="fechamento"
                    name="fechamento"
                    type="number"
                    min="1"
                    max="31"
                    value={diaFechamento}
                    onChange={(e) => setDiaFechamento(e.target.value)}
                    className="mt-1"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Dia do mês (1 a 31)</p>
                </div>

                <div>
                  <Label htmlFor="vencimento" className="text-xs font-semibold text-slate-700">
                    Dia de Vencimento *
                  </Label>
                  <Input
                    id="vencimento"
                    name="vencimento"
                    type="number"
                    min="1"
                    max="31"
                    value={diaVencimento}
                    onChange={(e) => setDiaVencimento(e.target.value)}
                    className="mt-1"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Dia do mês (1 a 31)</p>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Cor do Cartão</Label>
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saving ? 'Salvando...' : editingCartao ? 'Salvar Alterações' : 'Criar Cartão'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
