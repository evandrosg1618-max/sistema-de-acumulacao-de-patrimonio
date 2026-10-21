import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  lancamentoService,
  contaService,
  cartaoService,
  categoriaService,
  conciliacaoService,
  fixoService,
} from '@/services/sap'
import { Lancamento, Conta, Cartao, Categoria, TipoLancamento } from '@/types/sap'
import { formatMoneyBRL, getCurrentAnoMes, formatAnoMesPT } from '@/lib/formatters'
import {
  Plus,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  CheckCircle2,
  CreditCard,
  Wallet,
  Banknote,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Scale,
  Calendar,
  ArrowUpDown,
  RefreshCw,
  FileCheck,
  ThumbsUp,
  ThumbsDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
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
  const [faturasMes, setFaturasMes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros conforme modelo da referência visual
  // Opções de data: 'hoje' | 'esta_semana' | 'este_mes' | 'periodo' | 'mes'
  const [filtroPeriodoTipo, setFiltroPeriodoTipo] = useState<
    'hoje' | 'esta_semana' | 'este_mes' | 'periodo' | 'mes'
  >('mes')
  const [anoMes, setAnoMes] = useState(getCurrentAnoMes())
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroConta, setFiltroConta] = useState<string>('todas')
  const [filtroCartao, setFiltroCartao] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [mostrarBusca, setMostrarBusca] = useState(false)

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

  const navegarMes = (direcao: number) => {
    const [a, m] = anoMes.split('-').map(Number)
    const d = new Date(a, m - 1 + direcao, 1)
    const novoAno = d.getFullYear()
    const novoMes = String(d.getMonth() + 1).padStart(2, '0')
    setAnoMes(`${novoAno}-${novoMes}`)
    setFiltroPeriodoTipo('mes')
  }

  const aplicarFiltroRapido = (tipo: 'hoje' | 'esta_semana' | 'este_mes' | 'periodo') => {
    const hoje = new Date()
    const hojeStr = hoje.toISOString().slice(0, 10)
    setFiltroPeriodoTipo(tipo)

    if (tipo === 'hoje') {
      setDataInicio(hojeStr)
      setDataFim(hojeStr)
    } else if (tipo === 'esta_semana') {
      const diaSemana = hoje.getDay() // 0 = domingo
      const primeiro = new Date(hoje)
      primeiro.setDate(hoje.getDate() - diaSemana)
      const ultimo = new Date(primeiro)
      ultimo.setDate(primeiro.getDate() + 6)
      setDataInicio(primeiro.toISOString().slice(0, 10))
      setDataFim(ultimo.toISOString().slice(0, 10))
    } else if (tipo === 'este_mes') {
      const esteAnoMes = getCurrentAnoMes()
      setAnoMes(esteAnoMes)
      setFiltroPeriodoTipo('mes')
    } else if (tipo === 'periodo') {
      if (!dataInicio) setDataInicio(hojeStr)
      if (!dataFim) setDataFim(hojeStr)
    }
  }

  const carregarDados = async () => {
    if (!wsId) {
      setLoading(false)
      return
    }
    // Materialização preguiçosa de fixos pendentes
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

      if (filtroPeriodoTipo === 'mes') {
        filtrosConsulta.competencia = anoMes
      } else if (
        filtroPeriodoTipo === 'hoje' ||
        filtroPeriodoTipo === 'esta_semana' ||
        filtroPeriodoTipo === 'periodo'
      ) {
        if (dataInicio) filtrosConsulta.dataInicio = dataInicio
        if (dataFim) filtrosConsulta.dataFim = dataFim
      }

      const [lancsData, contasList, cartoesList, catsList, faturasList] = await Promise.all([
        lancamentoService.list(wsId, filtrosConsulta),
        contaService.list(wsId, false),
        cartaoService.list(wsId, false),
        categoriaService.listComSubcategorias(wsId),
        faturaService.getFaturasDoMes(wsId, anoMes),
      ])

      setLancamentos(lancsData)
      setContas(contasList)
      setCartoes(cartoesList)
      setCategorias(catsList)
      setFaturasMes(faturasList)
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
    filtroPeriodoTipo,
    anoMes,
    dataInicio,
    dataFim,
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

    // REQUISITO 2 & 4: Se for recorrente fixo (serie_id), abrir modal de escopo com opções "Este e os próximos" e "Todos"
    if (l.serie_id || l.regime === 'fixo') {
      setLancamentoAlvoEscopo(l)
      setAcaoEscopo('excluir')
      setModalEscopoOpen(true)
      return
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
          if (lancamentoAlvoEscopo?.serie_id || lancamentoAlvoEscopo?.regime === 'fixo') {
            const resFixo = await fixoService.excluirFixoComEscopo(
              lancamentoAlvoEscopo.id,
              wsId,
              escopo,
              user?.id,
            )
            toast.success(
              `${resFixo.excluidos || 1} lançamento(s) recorrente(s) excluído(s). ${
                resFixo.faturas_recalculadas && resFixo.faturas_recalculadas.length > 0
                  ? `Faturas recalculadas: ${resFixo.faturas_recalculadas.join(', ')}`
                  : ''
              }`,
            )
          } else {
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
          }
        } else {
          // Se for fixo com serie_id, chama alterarComEscopo do fixoService
          if (lancamentoAlvoEscopo?.serie_id) {
            const escopoFixo =
              escopo === 'este_e_proximos'
                ? 'este_e_proximos'
                : escopo === 'todos'
                  ? 'todos'
                  : 'este_e_proximos'
            const resFixo = await fixoService.alterarComEscopo(
              lancamentoAlvoEscopo.id,
              wsId,
              escopoFixo,
              {
                descricao: dadosEdicaoPendentes?.descricao || lancamentoAlvoEscopo.descricao,
                valor: Number(dadosEdicaoPendentes?.valor ?? lancamentoAlvoEscopo.valor),
                data: dadosEdicaoPendentes?.data || lancamentoAlvoEscopo.data,
                categoria_id: dadosEdicaoPendentes?.categoria_id,
                subcategoria_id: dadosEdicaoPendentes?.subcategoria_id,
                observacao: dadosEdicaoPendentes?.observacao,
                prazo: dadosEdicaoPendentes?.fixo?.prazo,
                quantidade_total: dadosEdicaoPendentes?.fixo?.quantidade_total,
                periodicidade: dadosEdicaoPendentes?.fixo?.periodicidade,
              },
              user?.id,
            )
            toast.success(
              `Série recorrente atualizada no banco! ${resFixo.alterados || 0} ocorrência(s) regenerada(s). ${
                resFixo.faturas_recalculadas && resFixo.faturas_recalculadas.length > 0
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

  // Formatação do label do grupo de data: ex: "01/10/26"
  const formatarDataGrupo = (dataStr: string) => {
    if (!dataStr) return ''
    const parts = dataStr.split('-')
    if (parts.length === 3) {
      const [ano, mes, dia] = parts
      return `${dia}/${mes}/${ano.slice(-2)}`
    }
    return dataStr
  }

  // Montar lista mista de itens do dia: lançamentos normais + Faturas de Cartão que vencem nesta data
  // 1. Agrupar todas as datas presentes em lançamentos ou faturas
  const todasDatasSet = new Set<string>()
  lancamentos.forEach((l) => {
    if (l.data) todasDatasSet.add(l.data)
  })

  // Para faturas do mês, associar à sua data de vencimento
  const faturasPorData: Record<string, any[]> = {}
  faturasMes.forEach((fat) => {
    let dataVenc = fat.data_vencimento
    if (!dataVenc && fat.competencia) {
      const dv = fat.cartao?.dia_vencimento || 10
      dataVenc = `${fat.competencia}-${String(dv).padStart(2, '0')}`
    }
    if (dataVenc) {
      todasDatasSet.add(dataVenc)
      if (!faturasPorData[dataVenc]) faturasPorData[dataVenc] = []
      faturasPorData[dataVenc].push(fat)
    }
  })

  // Ordenação CRESCENTE por data (Requisito 5)
  const datasOrdenadas = Array.from(todasDatasSet).sort((a, b) => a.localeCompare(b))

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* 1. BALÃO COM VALORES TOTAIS (Preservado conforme solicitado) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Lançamentos Financeiros
          </h1>
          <p className="text-xs text-slate-500">
            Controle de fluxo de caixa familiar e acompanhamento de faturas
          </p>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 bg-slate-50 px-5 py-2.5 rounded-xl border border-slate-200">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Entradas
            </span>
            <span className="text-sm sm:text-base font-bold text-emerald-600">
              {formatMoneyBRL(totalReceitas)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Saídas
            </span>
            <span className="text-sm sm:text-base font-bold text-rose-600">
              {formatMoneyBRL(totalDespesas)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Resultado Mês
            </span>
            <span
              className={`text-sm sm:text-base font-bold ${
                saldoLiquidoPeriodo >= 0 ? 'text-blue-600' : 'text-rose-600'
              }`}
            >
              {formatMoneyBRL(saldoLiquidoPeriodo)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. BARRA SUPERIOR MODELO REFERÊNCIA VISUAL (Botão + Lançamento, Seletor Mês com Setas, Ações) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Botão + Lançamento */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            onClick={() => abrirNovoLancamento('despesa')}
            className="bg-neutral-800 hover:bg-neutral-900 text-white font-medium text-xs sm:text-sm rounded-xl px-4 py-2 h-10 shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Lançamento</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalConciliacaoOpen(true)}
            className="h-10 text-xs rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            title="Conciliação Bancária"
          >
            <Scale className="w-3.5 h-3.5 mr-1 text-teal-600" />
            <span>Conciliar</span>
          </Button>
        </div>

        {/* Centro: Filtro de Data no modelo da referência */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarMes(-1)}
            className="h-9 w-9 text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {/* Dropdown com opções de período */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 transition select-none"
              >
                <span>
                  {filtroPeriodoTipo === 'mes'
                    ? formatAnoMesPT(anoMes)
                    : filtroPeriodoTipo === 'hoje'
                      ? 'Hoje'
                      : filtroPeriodoTipo === 'esta_semana'
                        ? 'Esta Semana'
                        : `${dataInicio.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48 text-xs bg-white border-slate-200">
              <DropdownMenuItem
                onClick={() => aplicarFiltroRapido('hoje')}
                className="cursor-pointer font-medium"
              >
                Hoje
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => aplicarFiltroRapido('esta_semana')}
                className="cursor-pointer font-medium"
              >
                Esta semana
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => aplicarFiltroRapido('este_mes')}
                className="cursor-pointer font-medium"
              >
                Este mês
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => aplicarFiltroRapido('periodo')}
                className="cursor-pointer font-medium"
              >
                Escolher período
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarMes(1)}
            className="h-9 w-9 text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Lado Direito: Ações rápidas */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => carregarDados()}
            className="text-xs text-slate-600 h-9 rounded-lg"
            title="Recarregar lançamentos do banco"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Caixa de período customizado quando 'periodo' estiver ativo */}
      {filtroPeriodoTipo === 'periodo' && (
        <div className="bg-white rounded-xl p-3 border border-slate-200 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">De:</span>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-36 text-xs h-8"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Até:</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-36 text-xs h-8"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltroPeriodoTipo('mes')}
            className="h-8 text-xs text-slate-500 hover:text-slate-800"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Voltar para mês
          </Button>
        </div>
      )}

      {/* 3. BARRA DE FILTROS "Origem / Tipo / Categorias / Status" (Estilo pill da referência visual) */}
      <div className="bg-neutral-100/80 rounded-2xl p-2 px-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Filtro: Origem (Contas e Cartões) */}
          <Select
            value={
              filtroConta !== 'todas'
                ? `conta:${filtroConta}`
                : filtroCartao !== 'todos'
                  ? `cartao:${filtroCartao}`
                  : 'todas'
            }
            onValueChange={(val) => {
              if (val.startsWith('conta:')) {
                setFiltroConta(val.replace('conta:', ''))
                setFiltroCartao('todos')
              } else if (val.startsWith('cartao:')) {
                setFiltroCartao(val.replace('cartao:', ''))
                setFiltroConta('todas')
              } else {
                setFiltroConta('todas')
                setFiltroCartao('todos')
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-transparent border-none shadow-none font-medium text-neutral-700 hover:bg-neutral-200/60 rounded-xl px-2.5">
              <span>
                {filtroConta !== 'todas'
                  ? `Conta: ${contas.find((c) => c.id === filtroConta)?.nome || ''}`
                  : filtroCartao !== 'todos'
                    ? `Cartão: ${cartoes.find((c) => c.id === filtroCartao)?.nome || ''}`
                    : 'Origem'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200 max-h-64">
              <SelectItem value="todas">Todas as origens</SelectItem>
              {contas.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Contas Bancárias
                </div>
              )}
              {contas.map((c) => (
                <SelectItem key={`conta:${c.id}`} value={`conta:${c.id}`}>
                  {c.nome}
                </SelectItem>
              ))}
              {cartoes.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Cartões de Crédito
                </div>
              )}
              {cartoes.map((c) => (
                <SelectItem key={`cartao:${c.id}`} value={`cartao:${c.id}`}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro: Tipo */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 text-xs bg-transparent border-none shadow-none font-medium text-neutral-700 hover:bg-neutral-200/60 rounded-xl px-2.5">
              <span>
                {filtroTipo === 'despesa'
                  ? 'Tipo: Despesas'
                  : filtroTipo === 'receita'
                    ? 'Tipo: Receitas'
                    : filtroTipo === 'transferencia'
                      ? 'Tipo: Transferências'
                      : 'Tipo'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200">
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="despesa">Somente Despesas</SelectItem>
              <SelectItem value="receita">Somente Receitas</SelectItem>
              <SelectItem value="transferencia">Transferências</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro: Categorias */}
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="h-8 text-xs bg-transparent border-none shadow-none font-medium text-neutral-700 hover:bg-neutral-200/60 rounded-xl px-2.5">
              <span>
                {filtroCategoria !== 'todas'
                  ? `Cat: ${categorias.find((c) => c.id === filtroCategoria)?.nome || ''}`
                  : 'Categorias'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200 max-h-64">
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro: Status */}
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 text-xs bg-transparent border-none shadow-none font-medium text-neutral-700 hover:bg-neutral-200/60 rounded-xl px-2.5">
              <span>
                {filtroStatus === 'pago'
                  ? 'Status: Pago'
                  : filtroStatus === 'pendente'
                    ? 'Status: Pendente'
                    : 'Status'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200">
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pago">Somente Pagos</SelectItem>
              <SelectItem value="pendente">Somente Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lupa de busca rápida */}
        <div className="flex items-center">
          {mostrarBusca ? (
            <div className="flex items-center gap-1 bg-white rounded-full px-2 py-0.5 border border-slate-200">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar lançamentos..."
                className="text-xs bg-transparent border-none focus:outline-none w-36 sm:w-48 text-slate-800"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setBusca('')
                  setMostrarBusca(false)
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarBusca(true)}
              className="p-1.5 rounded-full hover:bg-neutral-200/70 text-neutral-600 transition"
              title="Buscar por descrição"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 4. LISTAGEM AGRUPADA POR DATA EM ORDEM CRESCENTE (Visual fiel à referência) */}
      <div className="space-y-6">
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 space-y-2 border border-slate-100 shadow-xs">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando lançamentos...</p>
          </div>
        ) : datasOrdenadas.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center space-y-3 border border-slate-100 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7" />
            </div>
            <div className="text-sm font-semibold text-slate-800">
              Nenhum lançamento encontrado para os filtros selecionados
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Cadastre suas receitas, despesas ou faturas usando os botões acima.
            </p>
            <Button
              onClick={() => abrirNovoLancamento('despesa')}
              className="bg-neutral-800 hover:bg-neutral-900 text-white text-xs mt-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo Lançamento
            </Button>
          </div>
        ) : (
          datasOrdenadas.map((dataKey) => {
            const lancsDoDia = lancamentos.filter((l) => l.data === dataKey)
            const faturasDoDia = faturasPorData[dataKey] || []

            return (
              <div key={dataKey} className="space-y-1.5">
                {/* TÍTULO DO GRUPO: Data no topo (ex.: "01/10/26") */}
                <div className="pt-2 pb-1 border-b border-slate-200/70">
                  <span className="text-xs font-bold text-slate-500 tracking-wide">
                    {formatarDataGrupo(dataKey)}
                  </span>
                </div>

                {/* Itens do grupo */}
                <div className="space-y-1">
                  {/* A) Lançamentos normais da data */}
                  {lancsDoDia.map((l) => {
                    const isDespesa = l.tipo === 'despesa'
                    const isReceita = l.tipo === 'receita'
                    const isTransf = l.tipo === 'transferencia'
                    const isPago = l.status_pagamento === 'pago'
                    const ehFixo = Boolean(l.serie_id || l.regime === 'fixo')
                    const ehPrevisao =
                      (l as any).natureza === 'previsao' ||
                      (l as any).natureza_previsao === true ||
                      (l.status_pagamento as string) === 'previsao'

                    const contaNome =
                      l.meio_pagamento_tipo === 'CARTAO'
                        ? l.cartao?.nome || 'Cartão de Crédito'
                        : isTransf
                          ? `${l.conta_origem?.nome || 'Origem'} ➔ ${l.conta_destino?.nome || 'Destino'}`
                          : l.conta_origem?.nome || 'Conta Corrente'

                    return (
                      <div
                        key={l.id}
                        className={`p-2.5 px-3 rounded-xl flex items-center justify-between gap-3 transition group hover:bg-slate-50 ${
                          ehPrevisao ? 'bg-amber-50/20' : 'bg-white'
                        }`}
                      >
                        {/* Esquerda: Ícone circular colorido + Descrição + Tag / Conta */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Ícone circular */}
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-2xs ${
                              isDespesa
                                ? 'bg-rose-500'
                                : isReceita
                                  ? 'bg-emerald-500'
                                  : 'bg-emerald-600'
                            }`}
                            style={
                              l.categoria?.cor ? { backgroundColor: l.categoria.cor } : undefined
                            }
                          >
                            {isDespesa && <TrendingDown className="w-4 h-4 stroke-[2.5]" />}
                            {isReceita && <TrendingUp className="w-4 h-4 stroke-[2.5]" />}
                            {isTransf && <ArrowRightLeft className="w-4 h-4 stroke-[2.5]" />}
                          </div>

                          {/* Descrição & Metadados */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                                {l.descricao}
                              </span>

                              {ehFixo && (
                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] py-0 px-1 font-semibold shrink-0">
                                  Fixo
                                </Badge>
                              )}

                              {l.meio_pagamento_tipo === 'CARTAO' &&
                                (l.total_parcelas > 1 || l.quantidade_parcelas > 1) && (
                                  <Badge
                                    variant="outline"
                                    className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] py-0 px-1 font-medium shrink-0"
                                  >
                                    {l.numero_parcela ? `${l.numero_parcela}/` : ''}
                                    {l.total_parcelas || l.quantidade_parcelas}
                                  </Badge>
                                )}
                            </div>

                            {/* Linha de conta e tags */}
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
                              {ehFixo && (
                                <span className="text-slate-400" title="Recorrente fixo">
                                  🔁
                                </span>
                              )}
                              <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">
                                {contaNome}
                              </span>
                              {l.categoria && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500">
                                    {l.categoria.nome}
                                    {l.subcategoria && ` / ${l.subcategoria.nome}`}
                                  </span>
                                </>
                              )}
                              {l.observacao && (
                                <>
                                  <span>•</span>
                                  <span className="italic truncate">{l.observacao}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Direita: Valor + Ícone Pago / Não Pago (Thumbs up / down verde e cinza conforme referência) */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-xs sm:text-sm font-bold ${
                              isDespesa
                                ? 'text-slate-800'
                                : isReceita
                                  ? 'text-emerald-600'
                                  : 'text-slate-700'
                            }`}
                          >
                            {isDespesa ? '-' : isReceita ? '+' : ''}
                            {formatMoneyBRL(l.valor).replace('R$', '').trim()}
                          </span>

                          {/* Botão de Toggle de Pagamento com ícone Thumbs up / down da referência */}
                          {l.meio_pagamento_tipo === 'CARTAO' ? (
                            <span
                              className="text-slate-400 cursor-not-allowed"
                              title="Pago na fatura do cartão"
                            >
                              <ThumbsDown className="w-4 h-4 text-slate-300" />
                            </span>
                          ) : isPago ? (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleTogglePago(l)}
                              title="Pago — clique para desfazer"
                              className="p-1 text-emerald-600 hover:text-emerald-700 transition"
                            >
                              <ThumbsUp className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleTogglePago(l)}
                              title="Não pago — clique para confirmar pagamento"
                              className="p-1 text-slate-400 hover:text-emerald-600 transition"
                            >
                              <ThumbsDown className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          )}

                          {/* Menu de Ações rápidas */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-44 text-xs bg-white border-slate-200"
                            >
                              <DropdownMenuItem
                                onClick={() => abrirEdicaoLancamento(l)}
                                className="cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                <span>Editar</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleConciliado(l)}
                                className="cursor-pointer"
                              >
                                <FileCheck className="w-3.5 h-3.5 mr-2 text-teal-600" />
                                <span>{l.conciliado ? 'Desmarcar Conciliação' : 'Conciliar'}</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={isProcessing}
                                onClick={() => handleExcluirLancamento(l)}
                                className="cursor-pointer text-rose-600 focus:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                <span>Excluir</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )
                  })}

                  {/* B) ITENS "FATURA DO CARTÃO [NOME]" no vencimento (ITEM 5: fundo amarelo claro com marcador vermelho à esquerda, valor negativo à direita) */}
                  {faturasDoDia.map((fat) => {
                    const nomeCartao = fat.cartao?.nome || 'Cartão'
                    const valorFatura = Number(fat.valor_total || 0)
                    const ehPaga = fat.status === 'paga'
                    const mesAnoFatura = formatAnoMesPT(fat.competencia)

                    return (
                      <div
                        key={`fatura-${fat.id || fat.cartao_id}`}
                        className="p-3 px-4 rounded-xl flex items-center justify-between gap-3 bg-[#FFF9E6] border border-amber-200/60 shadow-2xs transition"
                      >
                        {/* Esquerda: Marcador circular vermelho + Ícone cinza + Título da fatura */}
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {/* Marcador / ponto vermelho destacado na lateral esquerda */}
                            <span className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white" />
                            {/* Ícone cinza de fatura */}
                            <div className="w-9 h-9 rounded-full bg-slate-300 text-slate-600 flex items-center justify-center shrink-0">
                              <CreditCard className="w-4 h-4" />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-bold text-slate-800">
                                Fatura {mesAnoFatura}
                              </span>
                              <Badge
                                variant="outline"
                                className="bg-amber-100/70 text-amber-800 border-amber-300 text-[10px] py-0 px-1.5 font-bold"
                              >
                                Vencimento
                              </Badge>
                              {ehPaga ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] py-0 px-1.5 font-bold">
                                  Paga
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] py-0 px-1.5 font-bold">
                                  Aberta / Fechada
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500">
                              {nomeCartao}
                            </span>
                          </div>
                        </div>

                        {/* Direita: Valor negativo em destaque e ícone de status */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs sm:text-sm font-bold text-slate-900">
                            -{formatMoneyBRL(valorFatura).replace('R$', '').trim()}
                          </span>

                          {ehPaga ? (
                            <span title="Fatura quitada">
                              <ThumbsUp className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                            </span>
                          ) : (
                            <span title="Fatura não paga">
                              <ThumbsDown className="w-4 h-4 text-slate-400 stroke-[2.5]" />
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
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
