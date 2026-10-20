import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  lancamentoService,
  contaService,
  cartaoService,
  categoriaService,
  conciliacaoService,
} from '@/services/sap'
import { Lancamento, Conta, Cartao, Categoria, TipoLancamento } from '@/types/sap'
import { formatMoneyBRL, getCurrentAnoMes, formatAnoMesPT } from '@/lib/formatters'
import {
  Plus,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  Filter,
  CheckCircle2,
  Clock,
  CreditCard,
  Wallet,
  Banknote,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Scale,
  Calendar,
  AlertCircle,
  Tag,
  ArrowUpDown,
  RefreshCw,
  FileCheck,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ModalLancamento } from '@/components/ModalLancamento'
import { ModalConciliacao } from '@/components/ModalConciliacao'
import { ModalEscolhaEscopoSerie, EscopoSerie } from '@/components/ModalEscolhaEscopoSerie'
import { ModalAvisoBloqueioFatura, InfoBloqueioFatura } from '@/components/ModalAvisoBloqueioFatura'
import { faturaService } from '@/services/sap'
import { useGlobalLoading } from '@/contexts/LoadingContext'
import { toast } from 'sonner'

export default function LancamentosPage() {
  const { currentWorkspace, user } = useAuth()
  const { isProcessing, runWithLock } = useGlobalLoading()
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [modoFiltroData, setModoFiltroData] = useState<'competencia' | 'periodo' | 'especifica'>(
    'competencia',
  )
  const [anoMes, setAnoMes] = useState(getCurrentAnoMes())
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataEspecifica, setDataEspecifica] = useState('')

  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroConta, setFiltroConta] = useState<string>('todas')
  const [filtroCartao, setFiltroCartao] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')

  // Modais
  const [modalLancamentoOpen, setModalLancamentoOpen] = useState(false)
  const [lancamentoEmEdicao, setLancamentoEmEdicao] = useState<Lancamento | null>(null)
  const [tipoModalPadrao, setTipoModalPadrao] = useState<TipoLancamento>('despesa')
  const [modalConciliacaoOpen, setModalConciliacaoOpen] = useState(false)

  // Modal de aviso persistente de fatura paga
  const [bloqueioFaturaInfo, setBloqueioFaturaInfo] = useState<InfoBloqueioFatura | null>(null)
  const [modalBloqueioOpen, setModalBloqueioOpen] = useState(false)

  // Modal de escolha de escopo (alterar/excluir série parcelada)
  const [modalEscopoOpen, setModalEscopoOpen] = useState(false)
  const [acaoEscopo, setAcaoEscopo] = useState<'editar' | 'excluir'>('excluir')
  const [lancamentoAlvoEscopo, setLancamentoAlvoEscopo] = useState<any>(null)
  const [dadosEdicaoPendentes, setDadosEdicaoPendentes] = useState<any>(null)
  const [processandoEscopo, setProcessandoEscopo] = useState(false)

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarDados = async () => {
    if (!wsId) {
      setLoading(false)
      return
    }
    // REQUISITO 2: Materialização preguiçosa de fixos pendentes
    try {
      await fixoService.materializarPendentes(wsId, user?.id)
    } catch (matErr) {
      console.warn('Erro silencioso na materialização prévia de fixos:', matErr)
    }

    setLoading(true)
    try {
      const filtrosConsulta: any = {
        tipo: filtroTipo,
        contaId: filtroConta,
        cartaoId: filtroCartao,
        categoriaId: filtroCategoria,
        statusPagamento: filtroStatus,
        busca: busca,
      }

      if (modoFiltroData === 'competencia') {
        filtrosConsulta.competencia = anoMes
      } else if (modoFiltroData === 'periodo') {
        if (dataInicio) filtrosConsulta.dataInicio = dataInicio
        if (dataFim) filtrosConsulta.dataFim = dataFim
      } else if (modoFiltroData === 'especifica') {
        if (dataEspecifica) filtrosConsulta.dataEspecifica = dataEspecifica
      }

      const [lancsData, contasList, cartoesList, catsList] = await Promise.all([
        lancamentoService.list(wsId, filtrosConsulta),
        contaService.list(wsId, false),
        cartaoService.list(wsId, false),
        categoriaService.listComSubcategorias(wsId),
      ])

      setLancamentos(lancsData)
      setContas(contasList)
      setCartoes(cartoesList)
      setCategorias(catsList)
    } catch (err: any) {
      console.error('Erro ao listar lançamentos:', err)
      toast.error('Erro ao carregar lançamentos: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [
    wsId,
    modoFiltroData,
    anoMes,
    dataInicio,
    dataFim,
    dataEspecifica,
    filtroTipo,
    filtroConta,
    filtroCartao,
    filtroCategoria,
    filtroStatus,
    busca,
  ])

  // Ações de Lançamento
  const abrirNovoLancamento = (tipo: TipoLancamento = 'despesa') => {
    setLancamentoEmEdicao(null)
    setTipoModalPadrao(tipo)
    setModalLancamentoOpen(true)
  }

  const abrirEdicaoLancamento = async (l: Lancamento) => {
    // Se pertencer a cartão de crédito e a fatura estiver paga, bloqueia alteração com aviso persistente
    if (wsId && l.cartao_id && l.competencia) {
      try {
        const fat = await faturaService.getFatura(wsId, l.cartao_id, l.competencia)
        if (fat && fat.status === 'paga') {
          setBloqueioFaturaInfo({
            competencia: l.competencia,
            acao: 'alteracao',
            detalhes: `A fatura de ${l.competencia} já está quitada. Desfaça o pagamento na tela de Cartões antes de alterar este lançamento.`,
          })
          setModalBloqueioOpen(true)
          return
        }
      } catch (e) {
        console.warn('Erro ao verificar fatura no abrirEdicaoLancamento:', e)
      }
    }

    setLancamentoEmEdicao(l)
    setTipoModalPadrao(l.tipo)
    setModalLancamentoOpen(true)
  }

  const handleSalvarLancamento = async (dados: any, criarOutro = false) => {
    if (!wsId) return

    // REQUISITO 4: Ao salvar alteração de um lançamento com serie_id preenchido, interceptar e abrir ModalEscolhaEscopoSerie
    if (dados.id && (lancamentoEmEdicao?.serie_id || dados.serie_id)) {
      setDadosEdicaoPendentes(dados)
      setLancamentoAlvoEscopo(lancamentoEmEdicao)
      setAcaoEscopo('editar')
      setModalLancamentoOpen(false)
      setModalEscopoOpen(true)
      return
    }

    // Outras séries parceladas (recorrentes/contas) mantêm escopo se aplicável
    if (dados.id) {
      const ehParceladoCartao =
        (dados.meio_pagamento_tipo === 'CARTAO' ||
          lancamentoEmEdicao?.meio_pagamento_tipo === 'CARTAO') &&
        ((dados.quantidade_parcelas && dados.quantidade_parcelas > 1) ||
          (lancamentoEmEdicao?.total_parcelas && lancamentoEmEdicao.total_parcelas > 1) ||
          Boolean(lancamentoEmEdicao?.lancamento_pai_id))

      const ehOutroParcelado =
        !ehParceladoCartao &&
        ((dados.quantidade_parcelas && dados.quantidade_parcelas > 1) ||
          (lancamentoEmEdicao?.total_parcelas && lancamentoEmEdicao.total_parcelas > 1) ||
          Boolean(lancamentoEmEdicao?.lancamento_pai_id))

      if (ehOutroParcelado) {
        setDadosEdicaoPendentes(dados)
        setLancamentoAlvoEscopo(lancamentoEmEdicao)
        setAcaoEscopo('editar')
        setModalLancamentoOpen(false)
        setModalEscopoOpen(true)
        return
      }
    }

    await runWithLock(async () => {
      try {
        if (dados.id) {
          const ehParceladoCartao =
            (dados.meio_pagamento_tipo === 'CARTAO' ||
              lancamentoEmEdicao?.meio_pagamento_tipo === 'CARTAO') &&
            ((dados.quantidade_parcelas && dados.quantidade_parcelas > 1) ||
              (lancamentoEmEdicao?.total_parcelas && lancamentoEmEdicao.total_parcelas > 1) ||
              Boolean(lancamentoEmEdicao?.lancamento_pai_id))

          if (ehParceladoCartao) {
            const paiId = lancamentoEmEdicao?.lancamento_pai_id || dados.id
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
            await lancamentoService.salvarUnificado(
              {
                ...dados,
                workspace_id: wsId,
              },
              user?.id,
            )
            toast.success('Lançamento atualizado com sucesso!')
          }
        } else {
          // REQUISITO 1: Chamada unificada para criação atômica de fixos/únicos
          await lancamentoService.salvarUnificado(
            {
              ...dados,
              workspace_id: wsId,
              created_by: user?.id,
            },
            user?.id,
          )
          toast.success(
            `${
              dados.regime === 'fixo'
                ? 'Lançamento fixo e projeções criados'
                : dados.tipo === 'despesa'
                  ? 'Despesa registrada'
                  : dados.tipo === 'receita'
                    ? 'Receita registrada'
                    : 'Transferência registrada'
            } com sucesso!`,
          )
        }
        setModalLancamentoOpen(false)
        setLancamentoEmEdicao(null)
        await carregarDados()
      } catch (err: any) {
        if (err?.message && err.message.includes('fatura') && err.message.includes('paga')) {
          setBloqueioFaturaInfo({
            competencia: dados.competencia || dados.data?.substring(0, 7) || 'atual',
            acao: dados.id ? 'alteracao' : 'inclusao',
            detalhes: err.message,
          })
          setModalBloqueioOpen(true)
        } else {
          toast.error(
            err.message ||
              'Não foi possível concluir — verifique e clique novamente; se persistir, atualize a página.',
          )
        }
        throw err
      }
    }, 'Salvando lançamento com integridade de saldos...')
  }

  const handleExcluirLancamento = async (l: Lancamento) => {
    if (!wsId) return

    // Se o lançamento estiver em cartão e a fatura estiver paga, bloqueia exclusão
    if (l.cartao_id && l.competencia) {
      try {
        const fat = await faturaService.getFatura(wsId, l.cartao_id, l.competencia)
        if (fat && fat.status === 'paga') {
          setBloqueioFaturaInfo({
            competencia: l.competencia,
            acao: 'exclusao',
            detalhes: `A fatura de ${l.competencia} já foi paga. Desfaça o pagamento da fatura na tela de Cartões para liberar a exclusão.`,
          })
          setModalBloqueioOpen(true)
          return
        }
      } catch (e) {
        console.warn('Erro ao verificar fatura na exclusão:', e)
      }
    }

    // Frente 4: Se for compra parcelada em cartão, exclusão total do original sem modal de escopo
    const ehParceladoCartao =
      l.meio_pagamento_tipo === 'CARTAO' &&
      ((l.total_parcelas && l.total_parcelas > 1) ||
        (l.quantidade_parcelas && l.quantidade_parcelas > 1) ||
        Boolean(l.lancamento_pai_id))

    if (ehParceladoCartao) {
      const confirma = window.confirm(
        `Excluir a compra parcelada "${l.descricao}"? Todas as parcelas serão removidas e as faturas do cartão recalculadas.`,
      )
      if (!confirma) return

      await runWithLock(async () => {
        try {
          const paiId = l.lancamento_pai_id || l.id
          await lancamentoService.excluirCompraParcelada(wsId, paiId, user?.id)
          toast.success('Compra parcelada excluída e faturas recalculadas!')
          await carregarDados()
        } catch (err: any) {
          toast.error(
            'Não foi possível excluir a compra — ' +
              (err.message || 'verifique e clique novamente; se persistir, atualize a página.'),
          )
        }
      }, 'Excluindo compra parcelada com segurança...')
      return
    }

    // Séries de outros tipos
    const ehOutroParcelado =
      (l.total_parcelas && l.total_parcelas > 1) ||
      (l.quantidade_parcelas && l.quantidade_parcelas > 1) ||
      Boolean(l.lancamento_pai_id)

    if (ehOutroParcelado) {
      setLancamentoAlvoEscopo(l)
      setAcaoEscopo('excluir')
      setModalEscopoOpen(true)
      return
    }

    const confirmou = window.confirm(`Deseja realmente cancelar/estornar "${l.descricao}"?`)
    if (!confirmou) return

    await runWithLock(async () => {
      try {
        await lancamentoService.deleteComEscopo(l.id, wsId, 'este', user?.id)
        toast.success('Lançamento excluído/estornado com sucesso!')
        await carregarDados()
      } catch (err: any) {
        toast.error(
          'Não foi possível excluir o lançamento — ' +
            (err.message || 'verifique e clique novamente; se persistir, atualize a página.'),
        )
      }
    }, 'Excluindo lançamento e garantindo integridade dos saldos...')
  }

  const handleConfirmarEscopo = async (escopo: EscopoSerie) => {
    if (!wsId || !lancamentoAlvoEscopo) return
    setProcessandoEscopo(true)
    await runWithLock(async () => {
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
          // Se for fixo com serie_id, chama alterarComEscopo do fixoService
          if (lancamentoAlvoEscopo?.serie_id) {
            const escopoFixo =
              escopo === 'este' ? 'este' : escopo === 'este_e_proximos' ? 'este_e_futuros' : 'todos'
            const resFixo = await fixoService.alterarComEscopo(
              wsId,
              lancamentoAlvoEscopo.id,
              escopoFixo,
              {
                descricao: dadosEdicaoPendentes?.descricao,
                valor: dadosEdicaoPendentes?.valor ? Number(dadosEdicaoPendentes.valor) : undefined,
                categoria_id: dadosEdicaoPendentes?.categoria_id,
                subcategoria_id: dadosEdicaoPendentes?.subcategoria_id,
                observacao: dadosEdicaoPendentes?.observacao,
              },
              user?.id,
            )
            toast.success(
              `${resFixo.afetados} lançamento(s) da série atualizado(s). ${
                resFixo.faturas_recalculadas?.length > 0
                  ? `Faturas: ${resFixo.faturas_recalculadas.join(', ')}`
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
        }
        setModalEscopoOpen(false)
        setLancamentoAlvoEscopo(null)
        setDadosEdicaoPendentes(null)
        await carregarDados()
      } catch (err: any) {
        toast.error(
          'Não foi possível concluir a ação — ' +
            (err.message || 'verifique e tente novamente; se persistir, atualize a página.'),
        )
      } finally {
        setProcessandoEscopo(false)
      }
    }, 'Processando alteração da série no banco...')
  }

  const handleTogglePago = async (l: Lancamento) => {
    if (!wsId) return

    // Se estiver em fatura de cartão, não permite toggle manual
    if (l.meio_pagamento_tipo === 'CARTAO' || l.cartao_id) {
      setBloqueioFaturaInfo({
        competencia: l.competencia || l.data?.substring(0, 7) || 'atual',
        acao: 'alteracao',
        detalhes:
          'Lançamentos em cartão de crédito são quitados exclusivamente através do pagamento da fatura na tela de Cartões.',
      })
      setModalBloqueioOpen(true)
      return
    }

    await runWithLock(
      async () => {
        try {
          const novoStatus = l.status_pagamento !== 'pago'
          await lancamentoService.togglePago(l.id, wsId, novoStatus, user?.id)
          toast.success(
            novoStatus
              ? 'Lançamento marcado como pago (saldo baixado).'
              : 'Pagamento desfeito (saldo estornado).',
          )
          await carregarDados()
        } catch (err: any) {
          toast.error(
            'Não foi possível alterar status — ' +
              (err.message || 'verifique e clique novamente; se persistir, atualize a página.'),
          )
        }
      },
      l.status_pagamento === 'pago'
        ? 'Desfazendo pagamento e restaurando saldos...'
        : 'Confirmando pagamento e debitando saldo...',
    )
  }

  const handleToggleConciliado = async (l: Lancamento) => {
    if (!wsId) return
    try {
      const novoConciliado = !l.conciliado
      await lancamentoService.toggleConciliado(l.id, wsId, novoConciliado, user?.id)
      toast.success(
        novoConciliado ? 'Lançamento marcado como conciliado!' : 'Conciliação removida.',
      )
      await carregarDados()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conciliar lançamento')
    }
  }

  const handleSalvarConciliacao = async (dados: {
    contaId: string
    saldoExtrato: number
    dataExtrato: string
    ajustarSaldo: boolean
    observacao?: string
  }) => {
    if (!wsId) return
    const res = await conciliacaoService.registrarConciliacaoComAjuste({
      workspace_id: wsId,
      conta_id: dados.contaId,
      saldo_extrato: dados.saldoExtrato,
      data_extrato: dados.dataExtrato,
      ajustarSaldo: dados.ajustarSaldo,
      observacao: dados.observacao,
      userId: user?.id,
    })

    if (res.ajustado) {
      toast.success('Conciliação realizada com lançamento de ajuste de saldo!')
    } else {
      toast.success('Conciliação registrada com sucesso!')
    }
    await carregarDados()
  }

  // Totais do Período
  const totalReceitas = lancamentos
    .filter((l) => l.tipo === 'receita')
    .reduce((acc, l) => acc + l.valor, 0)

  const totalDespesas = lancamentos
    .filter((l) => l.tipo === 'despesa')
    .reduce((acc, l) => acc + l.valor, 0)

  const saldoLiquidoPeriodo = totalReceitas - totalDespesas

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. CABEÇALHO COM TOTAIS DO PERÍODO & ATALHOS DE CRIAÇÃO */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ArrowUpDown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
                Lançamentos Financeiros
              </h1>
              <p className="text-xs text-slate-500">
                Controle integral de receitas, despesas, transferências e conciliação bancária.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <div>
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">
                Entradas
              </span>
              <span className="text-base font-bold text-emerald-600">
                {formatMoneyBRL(totalReceitas)}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">
                Saídas
              </span>
              <span className="text-base font-bold text-rose-600">
                {formatMoneyBRL(totalDespesas)}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">
                Resultado do Mês
              </span>
              <span
                className={`text-base font-bold ${
                  saldoLiquidoPeriodo >= 0 ? 'text-blue-600' : 'text-rose-600'
                }`}
              >
                {formatMoneyBRL(saldoLiquidoPeriodo)}
              </span>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => abrirNovoLancamento('despesa')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <TrendingDown className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Despesa</span>
          </button>

          <button
            onClick={() => abrirNovoLancamento('receita')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Receita</span>
          </button>

          <button
            onClick={() => abrirNovoLancamento('transferencia')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Transferência</span>
          </button>

          <button
            onClick={() => setModalConciliacaoOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs sm:text-sm font-semibold transition shadow-2xs"
            title="Comparar com extrato bancário e conciliar divergências"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Conciliar Conta</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS & NAVEGAÇÃO POR COMPETÊNCIA, DATA E PERÍODO */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        {/* Linha superior: Modo de Data + Campos de Data + Busca */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Seletor de Modo de Filtro de Data */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setModoFiltroData('competencia')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  modoFiltroData === 'competencia'
                    ? 'bg-white text-teal-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Competência
              </button>
              <button
                type="button"
                onClick={() => setModoFiltroData('periodo')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  modoFiltroData === 'periodo'
                    ? 'bg-white text-teal-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Período (De/Até)
              </button>
              <button
                type="button"
                onClick={() => setModoFiltroData('especifica')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  modoFiltroData === 'especifica'
                    ? 'bg-white text-teal-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Data Específica
              </button>
            </div>

            {/* Inputs contextuais ao modo escolhido */}
            {modoFiltroData === 'competencia' && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="month"
                  value={anoMes}
                  onChange={(e) => setAnoMes(e.target.value)}
                  className="w-36 text-xs h-8 font-semibold bg-white text-slate-900 border-slate-300 focus:ring-teal-500"
                />
                <span className="text-xs font-semibold text-teal-700 hidden sm:inline">
                  {formatAnoMesPT(anoMes)}
                </span>
              </div>
            )}

            {modoFiltroData === 'periodo' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-medium">De:</span>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-32 text-xs h-8 bg-white text-slate-900 border-slate-300"
                  />
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 font-medium">Até:</span>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-32 text-xs h-8 bg-white text-slate-900 border-slate-300"
                  />
                </div>
              </div>
            )}

            {modoFiltroData === 'especifica' && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 font-medium">Data:</span>
                <Input
                  type="date"
                  value={dataEspecifica}
                  onChange={(e) => setDataEspecifica(e.target.value)}
                  className="w-36 text-xs h-8 bg-white text-slate-900 border-slate-300"
                />
              </div>
            )}
          </div>

          {/* Busca por texto */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar descrição de lançamento..."
              className="pl-9 text-xs h-8 bg-white text-slate-900 placeholder:text-slate-400 border-slate-300"
            />
          </div>
        </div>

        {/* Filtros em Linha com visual claro e alto contraste */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div>
            <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Tipo
            </Label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="h-8 text-xs bg-white text-slate-900 font-medium border-slate-300 shadow-2xs hover:bg-slate-50">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900 border-slate-200">
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="despesa">Somente Despesas</SelectItem>
                <SelectItem value="receita">Somente Receitas</SelectItem>
                <SelectItem value="transferencia">Transferências</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Conta
            </Label>
            <Select value={filtroConta} onValueChange={setFiltroConta}>
              <SelectTrigger className="h-8 text-xs bg-white text-slate-900 font-medium border-slate-300 shadow-2xs hover:bg-slate-50">
                <SelectValue placeholder="Conta" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900 border-slate-200 max-h-56">
                <SelectItem value="todas">Todas as Contas</SelectItem>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Cartão
            </Label>
            <Select value={filtroCartao} onValueChange={setFiltroCartao}>
              <SelectTrigger className="h-8 text-xs bg-white text-slate-900 font-medium border-slate-300 shadow-2xs hover:bg-slate-50">
                <SelectValue placeholder="Cartão" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900 border-slate-200 max-h-56">
                <SelectItem value="todos">Todos os Cartões</SelectItem>
                {cartoes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Status Pagamento
            </Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-8 text-xs bg-white text-slate-900 font-medium border-slate-300 shadow-2xs hover:bg-slate-50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900 border-slate-200">
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="pago">Somente Pagos / Realizados</SelectItem>
                <SelectItem value="pendente">Somente Pendentes / Previstos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 3. LISTAGEM CRONOLÓGICA DE LANÇAMENTOS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {lancamentos.length} Lançamento{lancamentos.length === 1 ? '' : 's'} no período
            </span>
          </div>
          <button
            onClick={() => carregarDados()}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Atualizar</span>
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando lançamentos...</p>
          </div>
        ) : lancamentos.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7" />
            </div>
            <div className="text-sm font-semibold text-slate-800">
              Nenhum lançamento encontrado para os filtros selecionados
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Cadastre suas receitas, despesas do dia a dia ou transferências usando os botões
              acima.
            </p>
            <Button
              onClick={() => abrirNovoLancamento('despesa')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs mt-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo Lançamento
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {lancamentos.map((l) => {
              const isDespesa = l.tipo === 'despesa'
              const isReceita = l.tipo === 'receita'
              const isTransf = l.tipo === 'transferencia'
              const isPago = l.status_pagamento === 'pago'

              // Meio de pagamento legível
              const meioLabel =
                l.meio_pagamento_tipo === 'CARTAO'
                  ? l.cartao?.nome || 'Cartão de Crédito'
                  : l.meio_pagamento_tipo === 'DINHEIRO'
                    ? 'Dinheiro em Espécie'
                    : isTransf
                      ? `${l.conta_origem?.nome || 'Origem'} ➔ ${l.conta_destino?.nome || 'Destino'}`
                      : l.conta_origem?.nome || 'Conta Corrente'

              return (
                <div
                  key={l.id}
                  className="p-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition group"
                >
                  {/* Esquerda: Ícone do Tipo + Descrição + Metadados */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    {/* Ícone de status */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 sm:mt-0 ${
                        isDespesa
                          ? 'bg-rose-100 text-rose-600'
                          : isReceita
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      {isDespesa && <TrendingDown className="w-4 h-4 stroke-[2.5]" />}
                      {isReceita && <TrendingUp className="w-4 h-4 stroke-[2.5]" />}
                      {isTransf && <ArrowRightLeft className="w-4 h-4 stroke-[2.5]" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-slate-800">
                          {l.descricao}
                        </span>

                        {/* Badge de parcelamento no cartão: ex: 4 vezes de R$ 100,00 */}
                        {l.meio_pagamento_tipo === 'CARTAO' &&
                          (l.total_parcelas > 1 || l.quantidade_parcelas > 1) && (
                            <Badge
                              variant="outline"
                              className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] py-0 px-1.5 font-medium"
                            >
                              {l.total_parcelas || l.quantidade_parcelas} vezes de{' '}
                              {formatMoneyBRL(
                                Number(l.valor) /
                                  Number(l.total_parcelas || l.quantidade_parcelas || 1),
                              )}
                            </Badge>
                          )}

                        {/* Badges de Categoria com alto contraste */}
                        {l.categoria && (
                          <Badge
                            variant="outline"
                            className="text-[11px] font-semibold py-0.5 px-2.5 flex items-center gap-1.5 bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 shadow-2xs"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/10"
                              style={{ backgroundColor: l.categoria.cor || '#4F46E5' }}
                            />
                            <span className="font-bold text-slate-900 dark:text-white">
                              {l.categoria.nome}
                            </span>
                            {l.subcategoria && (
                              <span className="font-semibold text-slate-600 dark:text-slate-300">
                                / {l.subcategoria.nome}
                              </span>
                            )}
                          </Badge>
                        )}

                        {/* Badge de Conciliado */}
                        {l.conciliado && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] py-0">
                            <FileCheck className="w-3 h-3 mr-1" />
                            Conciliado
                          </Badge>
                        )}
                      </div>

                      {/* Informações complementares: Meio de pagamento, Data, Observações */}
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                        <span className="font-medium text-slate-600 flex items-center gap-1">
                          {l.meio_pagamento_tipo === 'CARTAO' && (
                            <CreditCard className="w-3 h-3 text-indigo-500" />
                          )}
                          {l.meio_pagamento_tipo === 'CONTA' && (
                            <Wallet className="w-3 h-3 text-emerald-600" />
                          )}
                          {l.meio_pagamento_tipo === 'DINHEIRO' && (
                            <Banknote className="w-3 h-3 text-emerald-600" />
                          )}
                          {meioLabel}
                        </span>
                        <span>•</span>
                        <span>{l.data ? l.data.split('-').reverse().join('/') : ''}</span>
                        {l.observacao && (
                          <>
                            <span>•</span>
                            <span className="italic max-w-[200px] truncate">{l.observacao}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direita: Valor + Status + Ações */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 self-end sm:self-auto w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right">
                      <div
                        className={`text-sm sm:text-base font-bold ${
                          isDespesa
                            ? 'text-rose-600'
                            : isReceita
                              ? 'text-emerald-600'
                              : 'text-blue-600'
                        }`}
                      >
                        {isDespesa ? '- ' : isReceita ? '+ ' : ''}
                        {formatMoneyBRL(l.valor)}
                      </div>
                      <div className="text-[10px] mt-1 flex items-center justify-end gap-1.5">
                        {l.meio_pagamento_tipo === 'CARTAO' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed"
                            title="Pagamento e desfazimento deste lançamento são feitos exclusivamente através da fatura do cartão."
                          >
                            <CreditCard className="w-3 h-3 text-indigo-500" />
                            Pago na fatura
                          </span>
                        ) : isPago ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleTogglePago(l)}
                            title="Lançamento PAGO. Clique para desfazer pagamento (alterar para Não Pago / estornar da conta)."
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs transition active:scale-95 cursor-pointer"
                          >
                            <ThumbsUp className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Pago</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleTogglePago(l)}
                            title="Lançamento NÃO PAGO. Clique para confirmar pagamento (marcar como Pago e debitar da conta)."
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs transition active:scale-95 cursor-pointer"
                          >
                            <ThumbsDown className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Não Pago</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Menu de Ações rápidas */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 text-xs">
                        {l.meio_pagamento_tipo !== 'CARTAO' && (
                          <DropdownMenuItem
                            onClick={() => handleTogglePago(l)}
                            className="cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                            <span>{isPago ? 'Marcar como Pendente' : 'Marcar como Pago'}</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleToggleConciliado(l)}
                          className="cursor-pointer"
                        >
                          <FileCheck className="w-3.5 h-3.5 mr-2 text-teal-600" />
                          <span>
                            {l.conciliado ? 'Desmarcar Conciliação' : 'Conciliar Manualmente'}
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => abrirEdicaoLancamento(l)}
                          className="cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-2 text-slate-500" />
                          <span>Editar Lançamento</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isProcessing}
                          onClick={() => handleExcluirLancamento(l)}
                          className="cursor-pointer text-rose-600 focus:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          <span>Excluir / Cancelar</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      <ModalLancamento
        open={modalLancamentoOpen}
        onOpenChange={setModalLancamentoOpen}
        onSave={handleSalvarLancamento}
        initialData={lancamentoEmEdicao}
        tipoPadrao={tipoModalPadrao}
        contas={contas}
        cartoes={cartoes}
        categorias={categorias}
        workspaceId={wsId || ''}
        userId={user?.id}
      />

      {/* MODAL DE CONCILIAÇÃO BANCÁRIA */}
      <ModalConciliacao
        open={modalConciliacaoOpen}
        onOpenChange={setModalConciliacaoOpen}
        contas={contas}
        onSalvar={handleSalvarConciliacao}
      />

      {/* MODAL DE ESCOLHA DE ESCOPO DE SÉRIE PARCELADA */}
      <ModalEscolhaEscopoSerie
        open={modalEscopoOpen}
        acao={acaoEscopo}
        lancamento={lancamentoAlvoEscopo}
        onConfirmar={handleConfirmarEscopo}
        onCancelar={() => {
          setModalEscopoOpen(false)
          setLancamentoAlvoEscopo(null)
          setDadosEdicaoPendentes(null)
        }}
        loading={processandoEscopo}
      />

      {/* MODAL DE AVISO DE BLOQUEIO POR FATURA PAGA (FECHA APENAS COM BOTÃO X) */}
      <ModalAvisoBloqueioFatura
        open={modalBloqueioOpen}
        onClose={() => {
          setModalBloqueioOpen(false)
          setBloqueioFaturaInfo(null)
        }}
        info={bloqueioFaturaInfo}
      />
    </div>
  )
}
