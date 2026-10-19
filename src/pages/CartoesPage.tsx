import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  cartaoService,
  faturaService,
  contaService,
  lancamentoService,
  categoriaService,
} from '@/services/sap'
import { Cartao, Fatura, Conta, Lancamento, TipoLancamento } from '@/types/sap'
import { formatMoneyBRL, getCurrentAnoMes, formatAnoMesPT } from '@/lib/formatters'
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
  Layers,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react'
import { ModalLancamento } from '@/components/ModalLancamento'
import { ModalPagamentoFatura } from '@/components/ModalPagamentoFatura'
import { ModalEscolhaEscopoSerie, EscopoSerie } from '@/components/ModalEscolhaEscopoSerie'
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

  // Gestão de faturas e competências (Build 3)
  const [cartaoExpandido, setCartaoExpandido] = useState<string | null>(null)
  const [faturaParaPagar, setFaturaParaPagar] = useState<Fatura | null>(null)
  const [cartaoFaturaPagar, setCartaoFaturaPagar] = useState<Cartao | null>(null)
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false)
  const [lancamentosFatura, setLancamentosFatura] = useState<Record<string, Lancamento[]>>({})
  const [carregandoDetalheFatura, setCarregandoDetalheFatura] = useState<string | null>(null)

  // Categorias para ModalLancamento dentro da fatura
  const [categorias, setCategorias] = useState<any[]>([])

  // Modal de Lançamento direto na fatura
  const [modalLancamentoOpen, setModalLancamentoOpen] = useState(false)
  const [lancamentoFaturaEmEdicao, setLancamentoFaturaEmEdicao] = useState<any>(null)
  const [cartaoIdParaNovoLanc, setCartaoIdParaNovoLanc] = useState<string>('')
  const [dataPadraoParaNovoLanc, setDataPadraoParaNovoLanc] = useState<string>('')

  // Modal de escolha de escopo de série
  const [modalEscopoOpen, setModalEscopoOpen] = useState(false)
  const [acaoEscopo, setAcaoEscopo] = useState<'editar' | 'excluir'>('excluir')
  const [lancamentoAlvoEscopo, setLancamentoAlvoEscopo] = useState<any>(null)
  const [dadosEdicaoPendentes, setDadosEdicaoPendentes] = useState<any>(null)
  const [processandoEscopo, setProcessandoEscopo] = useState(false)

  // Competência selecionada para visualização detalhada em cada cartão
  const [competenciaFiltro, setCompetenciaFiltro] = useState<string>(getCurrentAnoMes())
  const [resumosFatura, setResumosFatura] = useState<Record<string, any>>({})
  const [recalculando, setRecalculando] = useState(false)

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
      const [data, contasList, catsList] = await Promise.all([
        cartaoService.list(wsId, false),
        contaService.list(wsId, false),
        categoriaService.listComSubcategorias(wsId),
      ])
      setCartoes(data)
      setContas(contasList)
      setCategorias(catsList)

      // Carregar histórico de faturas para cada cartão
      const faturasTemp: Record<string, Fatura[]> = {}
      const resumosTemp: Record<string, any> = {}

      for (const c of data) {
        const fats = await faturaService.listFaturasCartao(wsId, c.id)
        faturasTemp[c.id] = fats

        // Build 3: Recálculo dinâmico da competência selecionada
        try {
          const resumo = await faturaService.getResumoFaturaCompetencia(
            wsId,
            c.id,
            competenciaFiltro,
          )
          resumosTemp[c.id] = resumo
        } catch (e) {
          console.warn('Erro ao carregar resumo da fatura:', e)
        }
      }
      setFaturasMap(faturasTemp)
      setResumosFatura(resumosTemp)
    } catch (err: any) {
      toast.error('Erro ao carregar cartões: ' + (err.message || 'tente novamente'))
    } finally {
      setLoading(false)
    }
  }

  // Navegar competência (mês anterior/próximo)
  const mudarCompetencia = async (deltaMeses: number) => {
    const [anoStr, mesStr] = competenciaFiltro.split('-')
    let a = parseInt(anoStr, 10)
    let m = parseInt(mesStr, 10) + deltaMeses
    if (m > 12) {
      m = 1
      a += 1
    } else if (m < 1) {
      m = 12
      a -= 1
    }
    const novaComp = `${a}-${String(m).padStart(2, '0')}`
    await selecionarCompetencia(novaComp)
  }

  // Selecionar competência específica (ao clicar em card de fatura em Outras Competências)
  const selecionarCompetencia = async (novaComp: string) => {
    setCompetenciaFiltro(novaComp)
    if (!wsId) return
    setRecalculando(true)
    try {
      const resumosTemp: Record<string, any> = {}
      for (const c of cartoes) {
        const resumo = await faturaService.getResumoFaturaCompetencia(wsId, c.id, novaComp)
        resumosTemp[c.id] = resumo
      }
      setResumosFatura(resumosTemp)
    } finally {
      setRecalculando(false)
    }
  }

  // Forçar recálculo manual caso o usuário solicite
  const forcarRecalculo = async () => {
    if (!wsId) return
    setRecalculando(true)
    try {
      const resumosTemp: Record<string, any> = {}
      for (const c of cartoes) {
        await faturaService.recalcularValorFatura(wsId, c.id, competenciaFiltro)
        const resumo = await faturaService.getResumoFaturaCompetencia(
          wsId,
          c.id,
          competenciaFiltro,
          true,
        )
        resumosTemp[c.id] = resumo
      }
      setResumosFatura(resumosTemp)
      toast.success('Faturas recalculadas e sincronizadas!')
    } catch (e: any) {
      toast.error('Erro ao recalcular: ' + (e.message || ''))
    } finally {
      setRecalculando(false)
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

  // FRENTE 1: Ações de Lançamentos dentro da Fatura
  const abrirNovoLancamentoNaFatura = (cartao: Cartao) => {
    setLancamentoFaturaEmEdicao(null)
    setCartaoIdParaNovoLanc(cartao.id)
    // Data padrão: usar primeiro dia da competência ou data de hoje se coincidir
    const [ano, mes] = competenciaFiltro.split('-')
    const dataEstimada = `${ano}-${mes}-01`
    setDataPadraoParaNovoLanc(dataEstimada)
    setModalLancamentoOpen(true)
  }

  const abrirEdicaoLancamentoFatura = async (item: any) => {
    // Se o item for uma parcela ou pertencer a um lançamento original (pai),
    // carrega o lançamento original completo para que a edição ocorra exclusivamente sobre o original.
    let alvoParaEdicao = item
    const paiId = item.lancamento_pai_id || item.lancamento_id || item.id
    if (paiId) {
      try {
        const pai = await lancamentoService.getById(paiId)
        if (pai) {
          alvoParaEdicao = pai
        }
      } catch (err) {
        console.warn('Não foi possível obter lançamento original, usando item da fatura:', err)
      }
    }

    setLancamentoFaturaEmEdicao(alvoParaEdicao)
    setCartaoIdParaNovoLanc(alvoParaEdicao.cartao_id || item.cartao_id || '')
    setModalLancamentoOpen(true)
  }

  const handleSalvarLancamentoFatura = async (dados: any, criarOutro = false) => {
    if (!wsId) return
    try {
      if (dados.id) {
        const ehParcelado =
          (dados.quantidade_parcelas && dados.quantidade_parcelas > 1) ||
          (lancamentoFaturaEmEdicao?.total_parcelas &&
            lancamentoFaturaEmEdicao.total_parcelas > 1) ||
          Boolean(lancamentoFaturaEmEdicao?.lancamento_pai_id)

        if (ehParcelado) {
          // Frente 4: Opera SEMPRE sobre o original, regenerando atomicamente via RPC
          const paiId = lancamentoFaturaEmEdicao?.lancamento_pai_id || dados.id
          await lancamentoService.regenerarCompraParcelada(
            wsId,
            paiId,
            {
              valor: Number(dados.valor),
              data: dados.data,
              quantidade_parcelas: Number(dados.quantidade_parcelas || 1),
              descricao: dados.descricao,
              categoria_id: dados.categoria_id,
              subcategoria_id: dados.subcategoria_id,
              observacao: dados.observacao,
            },
            user?.id,
          )
          toast.success('Compra parcelada regenerada com sucesso!')
        } else {
          await lancamentoService.update(dados.id, wsId, dados, user?.id)
          toast.success('Lançamento atualizado com sucesso!')
        }
      } else {
        await lancamentoService.create({
          ...dados,
          workspace_id: wsId,
          created_by: user?.id,
        })
        toast.success('Compra incluída na fatura do cartão com sucesso!')
      }

      setModalLancamentoOpen(false)
      setLancamentoFaturaEmEdicao(null)
      await carregarCartoes()
    } catch (err: any) {
      toast.error('Erro ao salvar lançamento: ' + (err.message || ''))
      throw err
    }
  }

  const handleExcluirLancamentoFatura = async (item: any) => {
    if (!wsId) return

    // Se o item for uma parcela ou pertencer a um lançamento original (pai),
    // a exclusão deve direcionar e impactar o lançamento original.
    let alvoParaExclusao = item
    const paiId = item.lancamento_pai_id || item.lancamento_id || item.id
    if (paiId) {
      try {
        const pai = await lancamentoService.getById(paiId)
        if (pai) {
          alvoParaExclusao = pai
        }
      } catch (err) {
        console.warn('Não foi possível obter original para exclusão:', err)
      }
    }

    const ehParcelado =
      (alvoParaExclusao.total_parcelas && alvoParaExclusao.total_parcelas > 1) ||
      (alvoParaExclusao.quantidade_parcelas && alvoParaExclusao.quantidade_parcelas > 1) ||
      Boolean(alvoParaExclusao.lancamento_pai_id)

    if (ehParcelado) {
      // Frente 4: Sem modal de escopo para parcelados. Excluir o original e regenerar faturas.
      const confirma = window.confirm(
        `Excluir a compra parcelada "${alvoParaExclusao.descricao}"? Todas as parcelas vinculadas serão removidas e as faturas recalculadas.`,
      )
      if (!confirma) return

      try {
        await lancamentoService.excluirCompraParcelada(wsId, alvoParaExclusao.id, user?.id)
        toast.success('Compra parcelada excluída e faturas recalculadas!')
        await carregarCartoes()
      } catch (err: any) {
        toast.error(err.message || 'Erro ao excluir')
      }
      return
    }

    const confirma = window.confirm(
      `Deseja realmente excluir "${alvoParaExclusao.descricao}" desta fatura?`,
    )
    if (!confirma) return

    try {
      await lancamentoService.deleteComEscopo(alvoParaExclusao.id, wsId, 'este', user?.id)
      toast.success('Lançamento excluído e faturas recalculadas!')
      await carregarCartoes()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir')
    }
  }

  const handleConfirmarEscopoFatura = async (escopo: EscopoSerie) => {
    if (!wsId || !lancamentoAlvoEscopo) return
    setProcessandoEscopo(true)
    try {
      if (acaoEscopo === 'excluir') {
        const res = await lancamentoService.deleteComEscopo(
          lancamentoAlvoEscopo.id,
          wsId,
          escopo,
          user?.id,
        )
        toast.success(
          `${res.excluidos} lançamento(s) excluído(s). ${
            res.faturasRecalculadas.length > 0
              ? `Faturas recalculadas: ${res.faturasRecalculadas.join(', ')}`
              : ''
          }`,
        )
      } else {
        const res = await lancamentoService.updateComEscopo(
          lancamentoAlvoEscopo.id,
          wsId,
          escopo,
          {
            descricao: dadosEdicaoPendentes?.descricao,
            valor: dadosEdicaoPendentes?.valor,
            data: dadosEdicaoPendentes?.data,
            categoria_id: dadosEdicaoPendentes?.categoria_id,
            subcategoria_id: dadosEdicaoPendentes?.subcategoria_id,
            observacao: dadosEdicaoPendentes?.observacao,
          },
          user?.id,
        )
        toast.success(
          `${res.alterados} lançamento(s) atualizado(s). ${
            res.faturasRecalculadas.length > 0
              ? `Faturas recalculadas: ${res.faturasRecalculadas.join(', ')}`
              : ''
          }`,
        )
      }
      setModalEscopoOpen(false)
      setLancamentoAlvoEscopo(null)
      setDadosEdicaoPendentes(null)
      await carregarCartoes()
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível completar a operação')
    } finally {
      setProcessandoEscopo(false)
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
  const totalComprometidoGeral = cartoes.reduce(
    (acc, c) => acc + (c.total_comprometido || c.fatura_atual || 0),
    0,
  )

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Gestão de Cartões de Crédito
            </h1>
            <Badge
              variant="outline"
              className="text-indigo-700 bg-indigo-50 border-indigo-200 text-xs font-semibold"
            >
              Build 3 • Faturas & Parcelas
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Competências dinâmicas por dia de fechamento, parcelas futuras e recálculo em tempo real
            sem valores congelados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Competência da Fatura */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-xs p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600"
              onClick={() => mudarCompetencia(-1)}
              title="Competência anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-2 text-xs font-bold text-slate-800 flex items-center gap-1.5 min-w-[130px] justify-center">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>{formatAnoMesPT(competenciaFiltro)}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600"
              onClick={() => mudarCompetencia(1)}
              title="Próxima competência"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={forcarRecalculo}
            disabled={recalculando}
            className="text-xs text-slate-700 h-9"
            title="Recalcular totais e parcelas dinamicamente"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recalculando ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>

          <Button
            onClick={abrirNovo}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-sm h-9"
          >
            <Plus className="w-4 h-4" />
            Novo Cartão
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
              Fatura de {competenciaFiltro}
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600">
              {formatMoneyBRL(
                Object.values(resumosFatura).reduce(
                  (acc: number, r: any) => acc + (r?.saldoDevedor ?? r?.totalCompras ?? 0),
                  0,
                ),
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Compras + parcelas na competência</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Comprometido
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600">
              {formatMoneyBRL(totalComprometidoGeral)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Fatura atual + parcelas futuras</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Limite Disponível Real
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {formatMoneyBRL(Math.max(0, limiteTotal - totalComprometidoGeral))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Descontando parcelas ativas</p>
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
                const resumo = resumosFatura[cartao.id]
                const totalComp = cartao.total_comprometido || fatura

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
                            <span className="text-amber-700 font-medium">
                              Comprometido: {formatMoneyBRL(totalComp)}
                            </span>
                            <span>•</span>
                            <span className="text-emerald-700 font-medium">
                              Disponível: {formatMoneyBRL(Math.max(0, cartao.limite - totalComp))}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-auto w-full sm:w-auto">
                        <div className="text-right">
                          <div className="font-bold text-sm md:text-base text-rose-600">
                            {formatMoneyBRL(resumo?.saldoDevedor ?? fatura)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Fatura {competenciaFiltro}{' '}
                            {resumo?.status === 'paga' ? '(Paga)' : '(Aberta)'}
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            setCartaoExpandido(cartaoExpandido === cartao.id ? null : cartao.id)
                          }
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-indigo-200 bg-indigo-50/50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                        >
                          <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Fatura & Parcelas</span>
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

                    {/* Detalhes das faturas abertas e fechadas deste cartão (Build 3) */}
                    {cartaoExpandido === cartao.id && (
                      <div className="bg-slate-50/90 p-4 border-t border-slate-200 space-y-4">
                        {/* Painel da Competência Ativa */}
                        <div className="bg-white rounded-xl border border-indigo-100 p-4 shadow-xs space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                              <Receipt className="w-4 h-4 text-indigo-600" />
                              <span className="text-sm font-bold text-slate-800">
                                Fatura da Competência {formatAnoMesPT(competenciaFiltro)} (
                                {competenciaFiltro})
                              </span>
                              <Badge
                                className={`text-[10px] py-0 ${
                                  resumo?.status === 'paga'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                              >
                                {resumo?.status === 'paga' ? 'Quitada' : 'Aberta'}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">
                                  Total da fatura
                                </span>
                                <span className="text-sm font-bold text-slate-900">
                                  {formatMoneyBRL(resumo?.totalCompras ?? 0)}
                                </span>
                              </div>

                              {resumo?.totalPago > 0 && (
                                <div className="text-right border-l border-slate-200 pl-3">
                                  <span className="text-xs text-emerald-600 block">Pago</span>
                                  <span className="text-sm font-bold text-emerald-700">
                                    {formatMoneyBRL(resumo.totalPago)}
                                  </span>
                                </div>
                              )}

                              <div className="text-right border-l border-slate-200 pl-3">
                                <span className="text-xs text-rose-500 block">A Pagar</span>
                                <span className="text-base font-bold text-rose-600">
                                  {formatMoneyBRL(resumo?.saldoDevedor ?? 0)}
                                </span>
                              </div>

                              {resumo?.fatura &&
                                resumo?.status !== 'paga' &&
                                resumo?.saldoDevedor > 0 && (
                                  <Button
                                    size="sm"
                                    onClick={() => abrirModalPagarFatura(resumo.fatura, cartao)}
                                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold ml-2"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                    Pagar Fatura
                                  </Button>
                                )}
                            </div>
                          </div>

                          {/* Lista de compras e parcelas da competência com conferência, inclusão, edição e exclusão */}
                          <div className="space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                              <span className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                Compras e Parcelas desta Fatura ({resumo?.itens?.length || 0}):
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">
                                  Corte dia {cartao.dia_fechamento} • Vencimento dia{' '}
                                  {cartao.dia_vencimento}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => abrirNovoLancamentoNaFatura(cartao)}
                                  className="h-7 text-xs bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Incluir na Fatura
                                </Button>
                              </div>
                            </div>

                            {!resumo?.itens || resumo.itens.length === 0 ? (
                              <div className="p-6 bg-slate-50 rounded-lg text-center space-y-2 border border-dashed border-slate-200">
                                <p className="text-xs text-slate-500 font-medium">
                                  Nenhum lançamento ou parcela nesta fatura ({competenciaFiltro}).
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => abrirNovoLancamentoNaFatura(cartao)}
                                  className="h-7 text-xs bg-white text-indigo-700 border-indigo-200"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Lançar compra nesta fatura
                                </Button>
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                                {resumo.itens.map((l: any) => {
                                  const numP = l.numero_parcela || 1
                                  const totP = l.total_parcelas || l.quantidade_parcelas || 1
                                  const ehParcela = totP > 1

                                  return (
                                    <div
                                      key={l.id}
                                      className="flex items-center justify-between p-2.5 sm:px-3 hover:bg-slate-50 text-xs transition group"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-slate-400 text-[11px] font-mono shrink-0">
                                          {l.data ? l.data.split('-').reverse().join('/') : ''}
                                        </span>
                                        <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-slate-800 truncate">
                                              {l.descricao}
                                            </span>
                                            {ehParcela && (
                                              <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] py-0 px-1.5 font-bold shrink-0">
                                                {numP}/{totP}
                                              </Badge>
                                            )}
                                          </div>
                                          {l.categorias?.nome && (
                                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600">
                                              <span
                                                className="w-2 h-2 rounded-full inline-block ring-1 ring-black/10 shrink-0"
                                                style={{
                                                  backgroundColor: l.categorias.cor || '#4F46E5',
                                                }}
                                              />
                                              <span className="text-slate-900 dark:text-white font-bold">
                                                {l.categorias.nome}
                                              </span>
                                              {l.subcategorias?.nome && (
                                                <span className="text-slate-600 dark:text-slate-300">
                                                  / {l.subcategorias.nome}
                                                </span>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0 pl-2">
                                        <span className="font-bold text-rose-600 text-xs sm:text-sm">
                                          {formatMoneyBRL(l.valor)}
                                        </span>

                                        <div className="flex items-center gap-0.5">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => abrirEdicaoLancamentoFatura(l)}
                                            title="Alterar lançamento desta fatura"
                                            className="h-7 w-7 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleExcluirLancamentoFatura(l)}
                                            title="Excluir lançamento desta fatura"
                                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
                          </div>
                        </div>

                        {/* Histórico Geral de Faturas */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              OUTRAS COMPETÊNCIAS CADASTRADAS
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Clique no card para abrir os lançamentos daquela fatura
                            </span>
                          </div>

                          {!faturasMap[cartao.id] || faturasMap[cartao.id].length === 0 ? (
                            <div className="p-3 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-400">
                              Nenhuma outra fatura gerada para este cartão.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                              {(() => {
                                // Mês anterior ao atual para recorte cronológico inicial
                                const hoje = new Date()
                                const mesAnterior = new Date(
                                  hoje.getFullYear(),
                                  hoje.getMonth() - 1,
                                  1,
                                )
                                const compMesAnterior = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`

                                const lista = [...faturasMap[cartao.id]]
                                // Ordenação cronológica CRESCENTE
                                lista.sort((a, b) => a.competencia.localeCompare(b.competencia))
                                // Filtrar a partir do mês anterior (se houver; senão mostra todas em ordem crescente)
                                const aPartirDoMesAnterior = lista.filter(
                                  (f) => f.competencia >= compMesAnterior,
                                )
                                const listaFinal =
                                  aPartirDoMesAnterior.length > 0 ? aPartirDoMesAnterior : lista

                                return listaFinal.map((fat) => {
                                  const isPaga = fat.status === 'paga'
                                  const isAtiva = fat.competencia === competenciaFiltro
                                  return (
                                    <div
                                      key={fat.id}
                                      onClick={() => selecionarCompetencia(fat.competencia)}
                                      className={`rounded-xl border p-3 flex items-center justify-between text-xs transition cursor-pointer shadow-2xs hover:shadow-sm ${
                                        isAtiva
                                          ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-400'
                                          : 'bg-white border-slate-200/90 hover:border-indigo-200 hover:bg-slate-50/80'
                                      }`}
                                      title={`Clique para abrir a fatura de ${fat.competencia}`}
                                    >
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                          <span>Fatura {fat.competencia}</span>
                                          <Badge
                                            className={`text-[9px] py-0 px-1 font-semibold ${
                                              isPaga
                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                : 'bg-amber-100 text-amber-900 border-amber-300'
                                            }`}
                                          >
                                            {isPaga ? 'Paga' : 'Aberta'}
                                          </Badge>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-600 block">
                                          {formatMoneyBRL(fat.valor_total)}
                                        </span>
                                      </div>

                                      <div className="pl-2" onClick={(e) => e.stopPropagation()}>
                                        {!isPaga ? (
                                          <Button
                                            size="sm"
                                            onClick={() => abrirModalPagarFatura(fat, cartao)}
                                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 rounded-lg shadow-2xs"
                                          >
                                            Pagar
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEstornarFatura(fat.id)}
                                            className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 px-2.5 rounded-lg"
                                          >
                                            Reabrir
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })
                              })()}
                            </div>
                          )}
                        </div>
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

      {/* Modal de Lançamento / Edição direto na Fatura */}
      <ModalLancamento
        open={modalLancamentoOpen}
        onOpenChange={setModalLancamentoOpen}
        onSave={handleSalvarLancamentoFatura}
        initialData={lancamentoFaturaEmEdicao}
        tipoPadrao="despesa"
        cartaoPadraoId={cartaoIdParaNovoLanc}
        dataPadrao={dataPadraoParaNovoLanc}
        contas={contas}
        cartoes={cartoes}
        categorias={categorias}
        workspaceId={wsId || ''}
        userId={user?.id}
      />

      {/* Modal de Escolha de Escopo (série parcelada da fatura) */}
      <ModalEscolhaEscopoSerie
        open={modalEscopoOpen}
        acao={acaoEscopo}
        lancamento={lancamentoAlvoEscopo}
        onConfirmar={handleConfirmarEscopoFatura}
        onCancelar={() => {
          setModalEscopoOpen(false)
          setLancamentoAlvoEscopo(null)
          setDadosEdicaoPendentes(null)
        }}
        loading={processandoEscopo}
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
