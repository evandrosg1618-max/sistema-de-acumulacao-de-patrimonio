import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Calendar as CalendarIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  FileCheck,
  ThumbsUp,
  ThumbsDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Receipt,
} from 'lucide-react'
import { renderIconePorId } from '@/components/SeletorVisualIconeCor'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
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
import { ModalConfirmacaoExclusao } from '@/components/ModalConfirmacaoExclusao'
import { ModalModoVisualizacao, ModoVisualizacao } from '@/components/ModalModoVisualizacao'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { faturaService } from '@/services/sap'
import { supabase } from '@/lib/supabase/client'
import { useGlobalLoading } from '@/contexts/LoadingContext'
import { toast } from 'sonner'

export default function LancamentosPage() {
  const navigate = useNavigate()
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
  const [filtroSubtipoAjuste, setFiltroSubtipoAjuste] = useState<string>('todos')
  const [filtroConta, setFiltroConta] = useState<string>('todas')
  const [filtroCartao, setFiltroCartao] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [mostrarBusca, setMostrarBusca] = useState(false)
  // Ordenação da listagem: 'desc' = do mais recente para o mais antigo (padrão), 'asc' = do mais antigo para o mais recente
  const [ordemData, setOrdemData] = useState<'desc' | 'asc'>('desc')
  const [calendarioPopoverOpen, setCalendarioPopoverOpen] = useState(false)

  // BUILD 5 (SAP-5 BLOCO 2): Seletor de Modo de Visualização (padrão: Competência Integral)
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('competencia_integral')
  const [modalModoVisualizacaoOpen, setModalModoVisualizacaoOpen] = useState(false)
  const [resultadoPeriodoIntegral, setResultadoPeriodoIntegral] = useState<{
    entradas_previstas: number
    saidas_previstas: number
    entradas_efetivadas: number
    saidas_efetivadas: number
    resultado_previsto: number
    resultado_efetivado: number
  }>({
    entradas_previstas: 0,
    saidas_previstas: 0,
    entradas_efetivadas: 0,
    saidas_efetivadas: 0,
    resultado_previsto: 0,
    resultado_efetivado: 0,
  })

  // Modais
  const [modalLancamentoOpen, setModalLancamentoOpen] = useState(false)
  const [lancamentoEmEdicao, setLancamentoEmEdicao] = useState<Lancamento | null>(null)
  const [tipoModalPadrao, setTipoModalPadrao] = useState<TipoLancamento>('despesa')
  const [modalConciliacaoOpen, setModalConciliacaoOpen] = useState(false)

  // Modal de aviso persistente de fatura paga
  const [bloqueioFaturaInfo, setBloqueioFaturaInfo] = useState<InfoBloqueioFatura | null>(null)
  const [modalBloqueioOpen, setModalBloqueioOpen] = useState(false)

  // BLOCO 3 (Testes 5–7): Modal unificado AlertDialog para confirmação de exclusões
  const [modalConfirmacaoExclusaoOpen, setModalConfirmacaoExclusaoOpen] = useState(false)
  const [modalConfirmacaoConfig, setModalConfirmacaoConfig] = useState<{
    title: string
    description: string
    isAlertOnly?: boolean
    confirmText?: string
    cancelText?: string
    onConfirm: () => Promise<void> | void
  }>({
    title: 'Exclusão',
    description: '',
    isAlertOnly: false,
    confirmText: 'OK',
    cancelText: 'Cancelar',
    onConfirm: () => {},
  })

  // Modal de escolha de escopo único "Todos" (alterar/excluir série recorrente ou parcelada)
  const [modalEscopoOpen, setModalEscopoOpen] = useState(false)
  const [acaoEscopo, setAcaoEscopo] = useState<'editar' | 'excluir'>('excluir')
  const [lancamentoAlvoEscopo, setLancamentoAlvoEscopo] = useState<any>(null)
  const [dadosEdicaoPendentes, setDadosEdicaoPendentes] = useState<any>(null)
  const [processandoEscopo, setProcessandoEscopo] = useState(false)
  const [statusSerieFixa, setStatusSerieFixa] = useState<{
    temPagas: boolean
    competenciasPagas: string[]
  }>({ temPagas: false, competenciasPagas: [] })

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
        subtipoAjuste: filtroTipo === 'ajuste' ? filtroSubtipoAjuste : undefined,
        contaId: filtroConta,
        cartaoId: filtroCartao,
        categoriaId: filtroCategoria,
        statusPagamento: filtroStatus,
        busca: busca,
      }

      // Passo 3 (testes 30–31): filtros de período devem filtrar SEMPRE pela DATA DO LANÇAMENTO
      // Quando for 'mes', calcula início (YYYY-MM-01) e fim (último dia do mês) pela data real do lançamento
      if (filtroPeriodoTipo === 'mes') {
        const [anoStr, mesStr] = anoMes.split('-')
        const anoNum = parseInt(anoStr, 10)
        const mesNum = parseInt(mesStr, 10)
        const ultimoDia = new Date(anoNum, mesNum, 0).getDate()
        filtrosConsulta.dataInicio = `${anoMes}-01`
        filtrosConsulta.dataFim = `${anoMes}-${String(ultimoDia).padStart(2, '0')}`
      } else if (
        filtroPeriodoTipo === 'hoje' ||
        filtroPeriodoTipo === 'esta_semana' ||
        filtroPeriodoTipo === 'periodo'
      ) {
        if (dataInicio) filtrosConsulta.dataInicio = dataInicio
        if (dataFim) filtrosConsulta.dataFim = dataFim
      }

      // Determinar período exato para o cálculo RPC de Competência Integral
      let rpcDataInicio = filtrosConsulta.dataInicio
      let rpcDataFim = filtrosConsulta.dataFim
      if (!rpcDataInicio || !rpcDataFim) {
        const [anoStr, mesStr] = anoMes.split('-')
        const anoNum = parseInt(anoStr, 10)
        const mesNum = parseInt(mesStr, 10)
        const ultimoDia = new Date(anoNum, mesNum, 0).getDate()
        rpcDataInicio = `${anoMes}-01`
        rpcDataFim = `${anoMes}-${String(ultimoDia).padStart(2, '0')}`
      }

      const [lancsData, contasList, cartoesList, catsList, faturasList, rpcRes] = await Promise.all(
        [
          lancamentoService.list(wsId, filtrosConsulta),
          contaService.list(wsId, false),
          cartaoService.list(wsId, false),
          categoriaService.listComSubcategorias(wsId),
          faturaService.getFaturasDoMes(wsId, anoMes),
          lancamentoService.calcularCompetenciaIntegral(wsId, rpcDataInicio, rpcDataFim),
        ],
      )

      setLancamentos(lancsData)
      setContas(contasList)
      setCartoes(cartoesList)
      setCategorias(catsList)
      setFaturasMes(faturasList)
      setResultadoPeriodoIntegral(rpcRes)
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
    filtroSubtipoAjuste,
    filtroConta,
    filtroCartao,
    filtroCategoria,
    filtroStatus,
    busca,
  ])

  // Estado para Visualização de Lançamentos Vinculados a uma Conta específica (Extrato da Conta)
  const [contaDetalhesModal, setContaDetalhesModal] = useState<Conta | null>(null)
  const [filtroStatusContaDetalhes, setFiltroStatusContaDetalhes] = useState<'pagos' | 'todos'>(
    'pagos',
  )
  const [lancamentosDaConta, setLancamentosDaConta] = useState<Lancamento[]>([])
  const [movimentacoesFaturaConta, setMovimentacoesFaturaConta] = useState<any[]>([])
  const [carregandoLancamentosConta, setCarregandoLancamentosConta] = useState(false)

  const abrirDetalhesConta = async (conta: Conta) => {
    setContaDetalhesModal(conta)
    setFiltroStatusContaDetalhes('pagos')
    if (!wsId) return
    setCarregandoLancamentosConta(true)
    try {
      const [lancs, movsRes] = await Promise.all([
        lancamentoService.list(wsId, {
          contaId: conta.id,
          tipo: 'todos',
          statusPagamento: 'todos',
        }),
        supabase
          .from('movimentacoes_conta')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('conta_id', conta.id)
          .not('pagamento_fatura_id', 'is', null)
          .order('data', { ascending: false }),
      ])

      setLancamentosDaConta(lancs)
      setMovimentacoesFaturaConta(movsRes.data || [])
    } catch (e) {
      console.error('Erro ao buscar extrato da conta:', e)
      toast.error('Erro ao carregar extrato da conta')
    } finally {
      setCarregandoLancamentosConta(false)
    }
  }

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

    // Se houve conversão de regime na edição (ex: de fixo para único, único para fixo/parcelado, etc.),
    // executar diretamente a conversão via salvarUnificado / converterRegime sem abrir o modal de escopo de repetição da série antiga!
    const regimeAnterior = lancamentoEmEdicao?.regime || 'unico'
    const regimeNovo = dados.regime || 'unico'
    const houveMudancaRegime = dados.id && regimeAnterior !== regimeNovo

    // REQUISITO 4: Ao salvar alteração de um lançamento com serie_id preenchido (sem mudar regime), interceptar e abrir ModalEscolhaEscopoSerie
    if (dados.id && !houveMudancaRegime && (lancamentoEmEdicao?.serie_id || dados.serie_id)) {
      setDadosEdicaoPendentes(dados)
      setLancamentoAlvoEscopo(lancamentoEmEdicao)
      setAcaoEscopo('editar')
      setModalLancamentoOpen(false)

      // Inspecionar status de pagas no backend
      try {
        const infoStatus = await fixoService.obterStatusSerieFixa(dados.id, wsId)
        setStatusSerieFixa({
          temPagas: Boolean(infoStatus.tem_pagas),
          competenciasPagas: infoStatus.competencias_pagas || [],
        })
      } catch (e) {
        console.warn('Erro ao obter status da série fixa:', e)
        setStatusSerieFixa({ temPagas: false, competenciasPagas: [] })
      }

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
                cartao_id: dados.cartao_id,
                subcategoria_id: dados.subcategoria_id,
                observacao: dados.observacao,
                // BLOCO 3 (20261104000000): Valor Próprio/Terceiros da edição —
                // sem reescala proporcional na compra compartilhada parcelada
                valor_proprio:
                  dados.valor_proprio !== undefined && dados.valor_proprio !== null
                    ? Number(dados.valor_proprio)
                    : lancamentoEmEdicao?.valor_proprio,
                valor_terceiros:
                  dados.valor_terceiros !== undefined && dados.valor_terceiros !== null
                    ? Number(dados.valor_terceiros)
                    : lancamentoEmEdicao?.valor_terceiros,
                modalidade_saida: dados.modalidade_saida || lancamentoEmEdicao?.modalidade_saida,
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

    // REGRA BLOCO B / BLOCO 3 (Testes 5–7):
    const ehUnico = (l.regime === 'unico' || !l.regime) && !l.serie_id
    // 3.2 Único em conta PAGO: mesmo padrão visual AlertDialog, mensagem exata (botão único OK)
    if (l.status_pagamento === 'pago' && l.meio_pagamento_tipo !== 'CARTAO' && ehUnico) {
      setModalConfirmacaoConfig({
        title: 'Exclusão de Lançamento único em Conta Movimento',
        description:
          'Este lançamento está pago. É necessário desfazer o pagamento para excluir. Desfaça o pagamento no botão da lista antes de excluir.',
        isAlertOnly: true,
        confirmText: 'OK',
        onConfirm: () => {
          setModalConfirmacaoExclusaoOpen(false)
        },
      })
      setModalConfirmacaoExclusaoOpen(true)
      return
    }

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

    // REQUISITO 2: Se for recorrente com serie_id válida apontando para série existente, abrir modal de escopo único "Todos"
    // Lançamentos órfãos (sem serie_id ou série inexistente) excluem diretamente como lançamento único
    if (l.serie_id) {
      try {
        const infoStatus = await fixoService.obterStatusSerieFixa(l.id, wsId)
        if (infoStatus.encontrado && infoStatus.serie_id) {
          setLancamentoAlvoEscopo(l)
          setAcaoEscopo('excluir')
          setStatusSerieFixa({
            temPagas: Boolean(infoStatus.tem_pagas),
            competenciasPagas: infoStatus.competencias_pagas || [],
          })
          setModalEscopoOpen(true)
          return
        }
      } catch (e) {
        console.warn('Erro ao obter status da série fixa:', e)
      }
    }

    // Frente 4: Se for compra parcelada em cartão, exclusão total do original sem modal de escopo
    const ehParceladoCartao =
      l.meio_pagamento_tipo === 'CARTAO' &&
      ((l.total_parcelas && l.total_parcelas > 1) ||
        (l.quantidade_parcelas && l.quantidade_parcelas > 1) ||
        Boolean(l.lancamento_pai_id))

    if (ehParceladoCartao) {
      // 3.3 Compra parcelada: AlertDialog contendo APENAS:
      // Excluir a compra parcelada "{descrição}"? Todas as parcelas serão removidas e as faturas do cartão recalculadas.
      setModalConfirmacaoConfig({
        title: 'Excluir compra parcelada',
        description: `Excluir a compra parcelada "${l.descricao}"? Todas as parcelas serão removidas e as faturas do cartão recalculadas.`,
        isAlertOnly: false,
        confirmText: 'OK',
        cancelText: 'Cancelar',
        onConfirm: async () => {
          setModalConfirmacaoExclusaoOpen(false)
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
        },
      })
      setModalConfirmacaoExclusaoOpen(true)
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

    // 3.1 Único em conta NÃO pago: título "Exclusão de Lançamento único em Conta Movimento",
    // mensagem "Deseja excluir este lançamento ?", botões "OK" e "Cancelar" (textos exatos).
    const ehContaMovimento = l.meio_pagamento_tipo !== 'CARTAO'
    const tituloExclusao = ehContaMovimento
      ? 'Exclusão de Lançamento único em Conta Movimento'
      : 'Excluir Lançamento'
    const msgExclusao = ehContaMovimento
      ? 'Deseja excluir este lançamento ?'
      : `Deseja realmente cancelar/estornar "${l.descricao}"?`

    setModalConfirmacaoConfig({
      title: tituloExclusao,
      description: msgExclusao,
      isAlertOnly: false,
      confirmText: 'OK',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setModalConfirmacaoExclusaoOpen(false)
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
      },
    })
    setModalConfirmacaoExclusaoOpen(true)
  }

  const handleConfirmarEscopo = async (escopo: EscopoSerie) => {
    if (!wsId || !lancamentoAlvoEscopo) return
    setProcessandoEscopo(true)
    await runWithLock(async () => {
      try {
        if (acaoEscopo === 'excluir') {
          if (lancamentoAlvoEscopo?.serie_id) {
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
          // Se for fixo com serie_id, chama alterarComEscopo do fixoService com todos os campos novos
          if (lancamentoAlvoEscopo?.serie_id) {
            const resFixo = await fixoService.alterarComEscopo(
              lancamentoAlvoEscopo.id,
              wsId,
              'todos',
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
                meio_pagamento_tipo: dadosEdicaoPendentes?.meio_pagamento_tipo,
                conta_origem_id: dadosEdicaoPendentes?.conta_origem_id,
                conta_destino_id: dadosEdicaoPendentes?.conta_destino_id,
                cartao_id: dadosEdicaoPendentes?.cartao_id,
                pago_primeira: Boolean(
                  dadosEdicaoPendentes?.pago ?? dadosEdicaoPendentes?.status_pagamento === 'pago',
                ),
              },
              user?.id,
            )
            toast.success(
              `Série recorrente atualizada com sucesso! ${resFixo.alterados || 0} ocorrência(s) regenerada(s). ${
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

  // Totais do Período: derivam estritamente dos lançamentos PAGOS do período (Passo 1.1 e testes 9, 11, 12, 15, 18, 20)
  // Transferências têm impacto zero no resultado mês (liquidez neutra)
  const totalReceitas = lancamentos
    .filter((l) => l.tipo === 'receita' && l.status_pagamento === 'pago')
    .reduce((acc, l) => acc + l.valor, 0)

  const totalDespesas = lancamentos
    .filter((l) => l.tipo === 'despesa' && l.status_pagamento === 'pago')
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

  // REQUISITO: A lista de Lançamentos Financeiros deve exibir SOMENTE lançamentos (SEM faturas)
  // 1. Agrupar datas presentes em lançamentos normais
  const todasDatasSet = new Set<string>()
  lancamentos.forEach((l) => {
    if (l.data) todasDatasSet.add(l.data)
  })

  // Ordenação por data: 'desc' (padrão - mais recente para o mais antigo) ou 'asc' (mais antigo para o mais recente)
  const datasOrdenadas = Array.from(todasDatasSet).sort((a, b) =>
    ordemData === 'desc' ? b.localeCompare(a) : a.localeCompare(b),
  )

  // Data atual do período para inicializar o calendário do Popover
  const dataReferenciaCalendario = (() => {
    if (dataInicio) {
      const [y, m, d] = dataInicio.split('-').map(Number)
      if (y && m && d) return new Date(y, m - 1, d)
    }
    const [y, m] = anoMes.split('-').map(Number)
    if (y && m) return new Date(y, m - 1, 1)
    return new Date()
  })()

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      {/* 1.1 TÍTULO: Lançamentos Financeiros (Item 0 Build 6: sem subtítulo e altura reduzida) */}
      <div className="py-0.5">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
          Lançamentos Financeiros
        </h1>
      </div>

      {/* 1.2 SUMMARY CARD: PERÍODO + REGIME NA MESMA LINHA */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Esquerda: Período com navegação < Outubro de 2026 > e ícone de calendário */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-600 mr-1">Período</span>

          {/* Seta anterior */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarMes(-1)}
            className="h-8 w-8 text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {/* Dropdown com opções de período */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="px-2.5 py-1 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-100 rounded-lg flex items-center gap-1 transition select-none"
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
            <DropdownMenuContent align="start" className="w-48 text-xs bg-white border-slate-200">
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

          {/* BLOCO 2 (Teste 2): Ícone de abrir calendário diretamente no lado direito, antes da última seta */}
          <Popover open={calendarioPopoverOpen} onOpenChange={setCalendarioPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg"
                title="Abrir calendário para escolher data/competência"
              >
                <CalendarIcon className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              className="w-auto p-0 bg-white border-slate-200 shadow-lg"
            >
              <div className="p-3">
                <Calendar
                  mode="single"
                  selected={dataReferenciaCalendario}
                  onSelect={(date) => {
                    if (date) {
                      const y = date.getFullYear()
                      const m = String(date.getMonth() + 1).padStart(2, '0')
                      const d = String(date.getDate()).padStart(2, '0')
                      const iso = `${y}-${m}-${d}`
                      const anoMesIso = `${y}-${m}`
                      setAnoMes(anoMesIso)
                      setDataInicio(iso)
                      setDataFim(iso)
                      setFiltroPeriodoTipo('periodo')
                      setCalendarioPopoverOpen(false)
                    }
                  }}
                  initialFocus
                />
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-slate-500"
                    onClick={() => {
                      aplicarFiltroRapido('este_mes')
                      setCalendarioPopoverOpen(false)
                    }}
                  >
                    Mês Atual
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-slate-500"
                    onClick={() => setCalendarioPopoverOpen(false)}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Seta próximo mês (última seta) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarMes(1)}
            className="h-8 w-8 text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Direita: REGIME NA MESMA LINHA/CARD com o quadradinho do seletor de regime */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Regime de</span>
            <span className="text-xs font-bold text-slate-800">Competência Integral</span>
          </div>

          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setModalModoVisualizacaoOpen(true)}
                  aria-label="Modo de Visualização"
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition shadow-2xs hover:border-slate-300"
                >
                  {/* Ícone de quadradinho com 2 linhas */}
                  <svg
                    className="w-3.5 h-3.5 text-slate-700"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                    <line x1="7" y1="9" x2="17" y2="9" />
                    <line x1="7" y1="15" x2="17" y2="15" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                Modo de Visualização
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 3 pontinhos para opções rápidas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg"
                title="Mais opções"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-xs bg-white border-slate-200">
              <DropdownMenuItem
                onClick={() => setModalModoVisualizacaoOpen(true)}
                className="cursor-pointer"
              >
                Modo de Visualização
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => carregarDados()} className="cursor-pointer">
                Atualizar dados
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => carregarDados()}
            className="text-xs text-slate-600 h-8 rounded-lg px-2"
            title="Recarregar lançamentos do banco"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Caixa de período customizado quando 'periodo' estiver ativo */}
      {filtroPeriodoTipo === 'periodo' && (
        <div className="bg-white rounded-xl p-2.5 px-3 border border-slate-200 flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">De:</span>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-36 text-xs h-7"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Até:</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-36 text-xs h-7"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltroPeriodoTipo('mes')}
            className="h-7 text-xs text-slate-500 hover:text-slate-800"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Voltar para mês
          </Button>
        </div>
      )}

      {/* 1.3 SUMMARY CARD: "RESUMO DO PERÍODO" (substitui "Resultado Período", sem "Indicador" nem "previsto vs efetivado") */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 mb-2.5">
          Resumo do Período
        </div>

        <div className="overflow-x-auto">
          <table className="text-xs w-full text-right border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider font-semibold">
                <th className="text-left pr-4 w-28"></th>
                <th className="px-3 text-[#16A34A]">Entradas</th>
                <th className="px-3 text-[#DC2626]">Saídas</th>
                <th className="pl-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Linha 1: Previsto (intensidade suavizada 40-60%) */}
              <tr>
                <td className="text-left pr-4 py-1.5 font-medium text-slate-500 text-[11px]">
                  Previsto
                </td>
                <td className="px-3 py-1.5 font-semibold text-[#16A34A]/60">
                  {formatMoneyBRL(resultadoPeriodoIntegral.entradas_previstas)}
                </td>
                <td className="px-3 py-1.5 font-semibold text-[#DC2626]/60">
                  {formatMoneyBRL(resultadoPeriodoIntegral.saidas_previstas)}
                </td>
                <td
                  className={`pl-3 py-1.5 font-semibold ${
                    resultadoPeriodoIntegral.resultado_previsto >= 0
                      ? 'text-[#2563EB]/60'
                      : 'text-[#EA580C]/60'
                  }`}
                >
                  {formatMoneyBRL(resultadoPeriodoIntegral.resultado_previsto)}
                </td>
              </tr>

              {/* Linha 2: Efetivado (intensidade cheia 100%) */}
              <tr>
                <td className="text-left pr-4 py-1.5 font-bold text-slate-700 text-[11px]">
                  Efetivado
                </td>
                <td className="px-3 py-1.5 font-bold text-[#16A34A]">
                  {formatMoneyBRL(resultadoPeriodoIntegral.entradas_efetivadas)}
                </td>
                <td className="px-3 py-1.5 font-bold text-[#DC2626]">
                  {formatMoneyBRL(resultadoPeriodoIntegral.saidas_efetivadas)}
                </td>
                <td
                  className={`pl-3 py-1.5 font-bold ${
                    resultadoPeriodoIntegral.resultado_efetivado >= 0
                      ? 'text-[#2563EB]'
                      : 'text-[#EA580C]'
                  }`}
                >
                  {formatMoneyBRL(resultadoPeriodoIntegral.resultado_efetivado)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 1.4 SUMMARY CARD "SALDOS DISPONÍVEIS" (sem "Minhas contas", faixa compacta e corpo na altura do ícone) */}
      {contas.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs w-full">
          {/* Faixa do título com altura reduzida */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 mb-2">
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Saldos Disponíveis
              </h2>
            </div>
            <span className="text-[10px] text-slate-400">
              Clique em uma conta para ver o extrato detalhado
            </span>
          </div>

          {/* Corpo do card: altura compacta nivelada à altura do ícone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {contas.map((c) => {
              const isNegativo = (c.saldo_atual || 0) < 0
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => abrirDetalhesConta(c)}
                  className="p-2 px-3 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-white hover:border-emerald-300 hover:shadow-2xs transition text-left flex items-center justify-between gap-2.5 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0 shadow-2xs"
                      style={{ backgroundColor: c.cor || '#10B981' }}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 leading-tight">
                      <div className="text-xs font-bold text-slate-800 truncate group-hover:text-emerald-700 transition">
                        {c.nome}
                      </div>
                      <div className="text-[9px] text-slate-400 uppercase font-medium truncate">
                        {c.tipo || 'Conta'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 leading-tight">
                    <div
                      className={`text-xs font-bold ${
                        isNegativo ? 'text-rose-600' : 'text-blue-600'
                      }`}
                    >
                      {formatMoneyBRL(c.saldo_atual)}
                    </div>
                    <span className="text-[8px] text-slate-400 block font-normal">Saldo atual</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 1.5 BOTÕES DE AÇÃO: "Novo Lançamento" (verde padrão do sistema, um único "+") e "Conciliar" */}
      <div className="flex items-center gap-2">
        <Button
          onClick={() => abrirNovoLancamento('despesa')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm rounded-xl px-4 py-2 h-9 shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Lançamento</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setModalConciliacaoOpen(true)}
          className="h-9 text-xs rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
          title="Conciliação Bancária"
        >
          <Scale className="w-3.5 h-3.5 mr-1 text-teal-600" />
          <span>Conciliar</span>
        </Button>
      </div>

      {/* 1.6 SUMMARY CARD BUSCA + FILTROS — TODOS NA HORIZONTAL (estilo OrganiZe) */}
      <div className="bg-neutral-100/90 rounded-2xl p-2 px-3 flex flex-nowrap items-center gap-2 overflow-x-auto">
        {/* Filtro: Origem (Contas e Cartões) */}
        <div className="shrink-0">
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
            <SelectTrigger className="h-8 text-xs bg-white/70 hover:bg-white border-none shadow-none font-medium text-neutral-700 rounded-xl px-2.5 whitespace-nowrap">
              <span>
                {filtroConta !== 'todas'
                  ? `Origem: ${contas.find((c) => c.id === filtroConta)?.nome || ''}`
                  : filtroCartao !== 'todos'
                    ? `Origem: ${cartoes.find((c) => c.id === filtroCartao)?.nome || ''}`
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
        </div>

        {/* Filtro: Tipo */}
        <div className="shrink-0">
          <Select
            value={filtroTipo}
            onValueChange={(val) => {
              setFiltroTipo(val)
              if (val !== 'ajuste') {
                setFiltroSubtipoAjuste('todos')
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-white/70 hover:bg-white border-none shadow-none font-medium text-neutral-700 rounded-xl px-2.5 whitespace-nowrap">
              <span>
                {filtroTipo === 'despesa'
                  ? 'Tipo: Despesas'
                  : filtroTipo === 'receita'
                    ? 'Tipo: Receitas'
                    : filtroTipo === 'transferencia'
                      ? 'Tipo: Transferências'
                      : filtroTipo === 'ajuste'
                        ? 'Tipo: Ajustes'
                        : 'Tipo'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200">
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="despesa">Somente Despesas</SelectItem>
              <SelectItem value="receita">Somente Receitas</SelectItem>
              <SelectItem value="transferencia">Transferências</SelectItem>
              <SelectItem value="ajuste">Ajustes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Subfiltro de Ajuste: aparece apenas quando Tipo === 'ajuste' */}
        {filtroTipo === 'ajuste' && (
          <div className="shrink-0">
            <Select value={filtroSubtipoAjuste} onValueChange={setFiltroSubtipoAjuste}>
              <SelectTrigger className="h-8 text-xs bg-purple-50 hover:bg-purple-100 border border-purple-200 shadow-none font-semibold text-purple-800 rounded-xl px-2.5 whitespace-nowrap">
                <span>
                  {filtroSubtipoAjuste === 'ajuste_fatura_banco'
                    ? 'Subtipo: Fatura do Banco'
                    : filtroSubtipoAjuste === 'ajuste_tecnico_sap'
                      ? 'Subtipo: Técnico do SAP'
                      : 'Todos os Ajustes'}
                </span>
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900 border-slate-200">
                <SelectItem value="todos">Todos os Ajustes</SelectItem>
                <SelectItem value="ajuste_fatura_banco">Ajustes da Fatura do Banco</SelectItem>
                <SelectItem value="ajuste_tecnico_sap">Ajustes Técnicos do SAP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Filtro: Categorias */}
        <div className="shrink-0">
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="h-8 text-xs bg-white/70 hover:bg-white border-none shadow-none font-medium text-neutral-700 rounded-xl px-2.5 whitespace-nowrap">
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
        </div>

        {/* Filtro: Status */}
        <div className="shrink-0">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 text-xs bg-white/70 hover:bg-white border-none shadow-none font-medium text-neutral-700 rounded-xl px-2.5 whitespace-nowrap">
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

        {/* Campo de Busca na mesma linha horizontal */}
        <div className="shrink-0 ml-auto flex items-center">
          {mostrarBusca ? (
            <div className="flex items-center gap-1 bg-white rounded-full px-2.5 py-1 border border-slate-200 shadow-2xs">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar lançamentos..."
                className="text-xs bg-transparent border-none focus:outline-none w-32 sm:w-44 text-slate-800"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setBusca('')
                  setMostrarBusca(false)
                }}
                className="text-slate-400 hover:text-slate-600 ml-1"
                title="Fechar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarBusca(true)}
              className="p-1.5 rounded-full bg-white/70 hover:bg-white text-neutral-600 transition shadow-2xs"
              title="Buscar lançamentos"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 1.7 LISTAGEM DE LANÇAMENTOS COM CABEÇALHO E ORDENAÇÃO (Setas pra cima e pra baixo) */}
      <div className="space-y-4">
        {/* Cabeçalho da Listagem com controles de ordenação */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Lançamentos
            </span>
            <span className="text-[11px] text-slate-400">
              ({lancamentos.length} {lancamentos.length === 1 ? 'registro' : 'registros'})
            </span>
          </div>

          {/* Ícones de seta pra cima e pra baixo para alternar a ordenação */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60">
            <button
              type="button"
              onClick={() => setOrdemData('asc')}
              className={`p-1 rounded-md text-xs transition flex items-center gap-1 ${
                ordemData === 'asc'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Ordenar do mais antigo para o mais recente"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span className="text-[10px] hidden sm:inline">Mais antigo</span>
            </button>

            <button
              type="button"
              onClick={() => setOrdemData('desc')}
              className={`p-1 rounded-md text-xs transition flex items-center gap-1 ${
                ordemData === 'desc'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Ordenar do mais recente para o mais antigo (padrão)"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span className="text-[10px] hidden sm:inline">Mais recente</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center text-xs text-slate-400 space-y-2 border border-slate-100 shadow-xs">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando lançamentos...</p>
          </div>
        ) : datasOrdenadas.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center space-y-3 border border-slate-100 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <CalendarIcon className="w-7 h-7" />
            </div>
            <div className="text-sm font-semibold text-slate-800">
              Nenhum lançamento encontrado para os filtros selecionados
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Cadastre suas receitas, despesas ou faturas usando os botões acima.
            </p>
            <Button
              onClick={() => abrirNovoLancamento('despesa')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs mt-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Novo Lançamento
            </Button>
          </div>
        ) : (
          datasOrdenadas.map((dataKey) => {
            const lancsDoDia = lancamentos.filter((l) => l.data === dataKey)

            return (
              <div key={dataKey} className="space-y-1.5">
                {/* TÍTULO DO GRUPO: Data no topo (ex.: "01/10/26") */}
                <div className="pt-2 pb-1 border-b border-slate-200/70">
                  <span className="text-xs font-bold text-slate-500 tracking-wide">
                    {formatarDataGrupo(dataKey)}
                  </span>
                </div>

                {/* Itens do grupo (SOMENTE lançamentos normais) */}
                <div className="space-y-1">
                  {lancsDoDia.map((l) => {
                    const isDespesa = l.tipo === 'despesa'
                    const isReceita = l.tipo === 'receita'
                    const isTransf = l.tipo === 'transferencia'
                    const isAjuste = l.tipo === 'ajuste'
                    const isPago = l.status_pagamento === 'pago'
                    const ehCartao = l.meio_pagamento_tipo === 'CARTAO'
                    const regimeStr = String(l.regime || '')
                    const ehParcelado =
                      regimeStr === 'parcelado' ||
                      Boolean(
                        (l.total_parcelas && l.total_parcelas > 1) ||
                        (l.quantidade_parcelas && l.quantidade_parcelas > 1),
                      )
                    const ehFixo =
                      regimeStr === 'fixo' || Boolean(l.serie_id && regimeStr === 'fixo')
                    // Detecção de fixo determinado vs indeterminado
                    const seriePrazo = (l as any).series_lancamentos?.prazo
                    const serieQtdTotal = (l as any).series_lancamentos?.quantidade_total
                    const totalParcelasFixo =
                      l.total_parcelas || l.quantidade_parcelas || serieQtdTotal || 0

                    const ehFixoDeterminado =
                      ehFixo &&
                      (seriePrazo === 'determinado' ||
                        (totalParcelasFixo > 1 && seriePrazo !== 'indeterminado'))
                    const ehFixoIndeterminado = ehFixo && !ehFixoDeterminado

                    const ehPrevisao =
                      (l as any).natureza === 'previsao' ||
                      (l as any).natureza_previsao === true ||
                      (l.status_pagamento as string) === 'previsao'

                    // Coluna 2: Meio de pagamento — nome da conta, cartão ou "Dinheiro"
                    let meioPagamentoLabel = 'Conta Corrente'
                    if (ehCartao) {
                      meioPagamentoLabel = l.cartao?.nome || 'Cartão de Crédito'
                    } else if (l.meio_pagamento_tipo === 'DINHEIRO') {
                      meioPagamentoLabel = 'Dinheiro'
                    } else if (isTransf) {
                      meioPagamentoLabel = `${l.conta_origem?.nome || 'Origem'} ➔ ${l.conta_destino?.nome || 'Destino'}`
                    } else if (l.conta_origem?.nome) {
                      meioPagamentoLabel = l.conta_origem.nome
                    }

                    // Redirecionamento para fatura do cartão (C.2)
                    const handleIrParaFatura = () => {
                      if (!l.cartao_id) {
                        toast.error('Lançamento sem cartão vinculado.')
                        return
                      }
                      const comp = l.competencia || getCurrentAnoMes()
                      navigate(`/cartoes?cartaoId=${l.cartao_id}&competencia=${comp}`)
                    }

                    return (
                      <div
                        key={l.id}
                        className={`p-3 px-3.5 rounded-xl grid grid-cols-[1fr_auto_auto_auto_auto] sm:grid-cols-[1fr_180px_130px_36px_32px] items-center gap-3 transition group hover:bg-slate-50 border border-slate-100/70 shadow-2xs ${
                          ehPrevisao ? 'bg-amber-50/20' : 'bg-white'
                        }`}
                      >
                        {/* 1ª COLUNA: Descrição (quebra de linha se longa) + Categoria/Subcategoria + Badge Fixo/Parcelado */}
                        <div className="flex items-start gap-3 min-w-0 pr-2">
                          {/* Ícone circular com o ícone e cor escolhidos para a subcategoria (Bloco 4) */}
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs ${
                              isAjuste
                                ? 'bg-purple-600'
                                : isDespesa
                                  ? 'bg-rose-500'
                                  : isReceita
                                    ? 'bg-emerald-500'
                                    : 'bg-emerald-600'
                            }`}
                            style={{
                              backgroundColor:
                                l.subcategoria?.cor ||
                                l.categoria?.cor ||
                                (isAjuste
                                  ? '#7C3AED'
                                  : isDespesa
                                    ? '#EF4444'
                                    : isReceita
                                      ? '#10B981'
                                      : '#059669'),
                            }}
                          >
                            {renderIconePorId(
                              l.subcategoria?.icone ||
                                l.categoria?.icone ||
                                (isAjuste
                                  ? 'scale'
                                  : isDespesa
                                    ? 'tag'
                                    : isReceita
                                      ? 'trending-up'
                                      : 'arrow-right-left'),
                              'w-4 h-4 stroke-[2.2]',
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            {/* Descrição com quebra de linha normal */}
                            <div className="text-xs sm:text-sm font-semibold text-slate-800 break-words leading-snug">
                              {l.descricao}
                            </div>

                            {/* Categoria / Subcategoria + Observação + Badges específicas de Ajuste */}
                            {isAjuste ? (
                              <div className="flex items-center flex-wrap gap-1.5 text-[11px] pt-0.5">
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-bold px-1.5 py-0"
                                >
                                  ± Ajuste
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-medium px-1.5 py-0"
                                >
                                  {l.subtipo_ajuste === 'ajuste_tecnico_sap'
                                    ? 'Ajuste Técnico do SAP'
                                    : 'Ajuste da Fatura do Banco'}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-medium px-1.5 py-0 ${
                                    l.efeito_fatura === 'reduz'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {l.efeito_fatura === 'reduz' ? 'Reduz fatura' : 'Aumenta fatura'}
                                </Badge>
                                {l.observacao && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="italic text-slate-400 break-words line-clamp-1">
                                      {l.observacao}
                                    </span>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-slate-500">
                                {l.modalidade_saida !== 'emprestimo_terceiros' && l.categoria && (
                                  <span className="font-medium text-slate-600">
                                    {l.categoria.nome}
                                    {l.subcategoria && ` / ${l.subcategoria.nome}`}
                                  </span>
                                )}
                                {l.observacao && (
                                  <>
                                    {l.modalidade_saida !== 'emprestimo_terceiros' &&
                                      l.categoria && <span className="text-slate-300">•</span>}
                                    <span className="italic text-slate-400 break-words line-clamp-1">
                                      {l.observacao}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Sublinha informativa conforme Modalidade da Saída (PDF Seções 4.8, 5.6 e 6.8) */}
                            {l.tipo === 'despesa' &&
                              l.modalidade_saida === 'compra_compartilhada' && (
                                <div className="text-[11px] font-medium text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded-md inline-flex items-center flex-wrap gap-1 border border-blue-100">
                                  <span>
                                    👥 Minha parte {formatMoneyBRL(l.valor_proprio ?? l.valor)}
                                  </span>
                                  <span className="text-blue-300">•</span>
                                  <span>A receber {formatMoneyBRL(l.valor_terceiros ?? 0)}</span>
                                </div>
                              )}

                            {l.tipo === 'despesa' && l.modalidade_saida === 'compra_terceiros' && (
                              <div className="text-[11px] font-medium text-amber-800 bg-amber-50/80 px-2 py-0.5 rounded-md inline-flex items-center flex-wrap gap-1 border border-amber-100">
                                <span>👤 Compra para Terceiros</span>
                                <span className="text-amber-300">•</span>
                                <span>
                                  A receber {formatMoneyBRL(l.valor_terceiros ?? l.valor)}
                                </span>
                              </div>
                            )}

                            {l.tipo === 'despesa' &&
                              l.modalidade_saida === 'emprestimo_terceiros' && (
                                <div className="text-[11px] font-medium text-purple-800 bg-purple-50/80 px-2 py-0.5 rounded-md inline-flex items-center flex-wrap gap-1 border border-purple-100">
                                  <span>👤 Empréstimo a Terceiros</span>
                                  <span className="text-purple-300">•</span>
                                  <span>
                                    A receber {formatMoneyBRL(l.valor_terceiros ?? l.valor)}
                                  </span>
                                </div>
                              )}

                            {/* Badges de Fixo / Parcelado (C.3) */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              {ehParcelado &&
                                (() => {
                                  const totalP =
                                    l.total_parcelas || l.quantidade_parcelas || serieQtdTotal || 1
                                  const valorParcela = totalP > 0 ? l.valor / totalP : l.valor
                                  return (
                                    <Badge
                                      variant="outline"
                                      className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] py-0 px-1.5 font-medium shrink-0"
                                    >
                                      {totalP} vezes de{' '}
                                      {formatMoneyBRL(valorParcela).replace('R$', '').trim()}
                                    </Badge>
                                  )
                                })()}

                              {ehFixoDeterminado && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0 px-1.5 font-medium shrink-0"
                                >
                                  Fixo {l.numero_parcela ? `${l.numero_parcela}/` : '1/'}
                                  {totalParcelasFixo}
                                </Badge>
                              )}

                              {ehFixoIndeterminado && (
                                <Badge
                                  variant="outline"
                                  className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0 px-1.5 font-medium shrink-0"
                                >
                                  Indeterminado
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 2ª COLUNA: Meio de pagamento — nome da conta, cartão ou "Dinheiro" */}
                        <div className="text-left sm:text-left min-w-0 pr-1">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-600 bg-slate-100/80 hover:bg-slate-100 px-2.5 py-1 rounded-md max-w-full truncate"
                            title={meioPagamentoLabel}
                          >
                            {ehCartao ? (
                              <CreditCard className="w-3 h-3 text-slate-500 shrink-0" />
                            ) : l.meio_pagamento_tipo === 'DINHEIRO' ? (
                              <Banknote className="w-3 h-3 text-slate-500 shrink-0" />
                            ) : (
                              <Wallet className="w-3 h-3 text-slate-500 shrink-0" />
                            )}
                            <span className="truncate">{meioPagamentoLabel}</span>
                          </span>
                        </div>

                        {/* 3ª COLUNA: Valor — Ajuste exibe efeito (−R$ quando reduz fatura, +R$ quando aumenta fatura), nunca rotulado como Receita/Despesa */}
                        <div className="text-right whitespace-nowrap pl-1">
                          <span
                            className={`text-xs sm:text-sm font-bold tracking-tight ${
                              isAjuste
                                ? l.efeito_fatura === 'reduz'
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                                : isReceita
                                  ? 'text-blue-600'
                                  : isDespesa
                                    ? 'text-rose-600'
                                    : 'text-emerald-600'
                            }`}
                          >
                            {isAjuste
                              ? `${l.efeito_fatura === 'reduz' ? '−' : '+'} ${formatMoneyBRL(l.valor)}`
                              : `${isReceita ? '+' : isDespesa ? '−' : ''} ${formatMoneyBRL(l.valor)}`}
                          </span>
                        </div>

                        {/* 4ª COLUNA: Botão de pagamento (OCULTO COMPLETAMENTE para cartões conforme C.2) */}
                        <div className="flex items-center justify-center w-9 h-9 shrink-0">
                          {ehCartao ? null : isPago ? (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleTogglePago(l)}
                              title="Pago — clique para desfazer"
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition"
                            >
                              <ThumbsUp className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleTogglePago(l)}
                              title="Não pago — clique para confirmar pagamento"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition"
                            >
                              <ThumbsDown className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          )}
                        </div>

                        {/* 5ª COLUNA: 3 pontinhos com opção "Fatura" para cartão (C.2) */}
                        <div className="flex items-center justify-center w-8 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48 text-xs bg-white border-slate-200 text-slate-900 shadow-md"
                            >
                              {ehCartao && (
                                <>
                                  <DropdownMenuItem
                                    onClick={handleIrParaFatura}
                                    className="cursor-pointer text-slate-900 font-medium hover:bg-indigo-50 hover:text-indigo-900"
                                  >
                                    <Receipt className="w-3.5 h-3.5 mr-2 text-indigo-600" />
                                    <span>Fatura</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}

                              <DropdownMenuItem
                                onClick={() => abrirEdicaoLancamento(l)}
                                className="cursor-pointer text-slate-900 font-medium hover:bg-slate-100"
                              >
                                <Edit2 className="w-3.5 h-3.5 mr-2 text-slate-800" />
                                <span className="text-slate-900">Editar</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={isProcessing}
                                onClick={() => handleExcluirLancamento(l)}
                                className="cursor-pointer text-rose-600 font-medium focus:text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2 text-rose-600" />
                                <span>Excluir</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* MODAL DE DETALHES DE CONTA BANCÁRIA (EXTRATO DE LANÇAMENTOS) */}
      {contaDetalhesModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in-50 zoom-in-95">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: contaDetalhesModal.cor || '#10B981' }}
                >
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{contaDetalhesModal.nome}</h3>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>Saldo atual:</span>
                    <strong
                      className={`font-bold ${
                        (contaDetalhesModal.saldo_atual || 0) < 0
                          ? 'text-rose-600'
                          : 'text-blue-600'
                      }`}
                    >
                      {formatMoneyBRL(contaDetalhesModal.saldo_atual)}
                    </strong>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setContaDetalhesModal(null)}
                className="h-8 w-8 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Aviso Obrigatório e Seletor Pagos / Todos */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 space-y-3">
              <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 font-medium">
                ⚠️ O saldo atual da conta só inclui lançamentos pagos.
              </div>

              {/* Seletor Pagos / Todos */}
              <div className="grid grid-cols-2 gap-2 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFiltroStatusContaDetalhes('pagos')}
                  className={`py-1.5 rounded-lg transition ${
                    filtroStatusContaDetalhes === 'pagos'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lançamentos pagos (padrão)
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatusContaDetalhes('todos')}
                  className={`py-1.5 rounded-lg transition ${
                    filtroStatusContaDetalhes === 'todos'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos os Lançamentos
                </button>
              </div>
            </div>

            {/* Lista de lançamentos vinculados */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100 space-y-1">
              {carregandoLancamentosConta ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Carregando lançamentos da conta...
                </div>
              ) : (
                (() => {
                  // Unifica lançamentos da conta + movimentações de pagamento/estorno de faturas (Passo 5 / Teste 37)
                  type ItemExtrato = {
                    id: string
                    tipoItem: 'lancamento' | 'movimentacao_fatura'
                    tipoMov: 'entrada' | 'saida' | 'transferencia' | 'estorno'
                    descricao: string
                    data: string
                    categoriaNome?: string
                    valor: number
                    pago: boolean
                  }

                  const itensLancamentos: ItemExtrato[] = lancamentosDaConta
                    .filter((l) =>
                      filtroStatusContaDetalhes === 'pagos' ? l.status_pagamento === 'pago' : true,
                    )
                    .map((l) => ({
                      id: `lanc-${l.id}`,
                      tipoItem: 'lancamento',
                      tipoMov:
                        l.tipo === 'despesa'
                          ? 'saida'
                          : l.tipo === 'receita'
                            ? 'entrada'
                            : 'transferencia',
                      descricao: l.descricao,
                      data: l.data,
                      categoriaNome: l.categoria?.nome,
                      valor: Number(l.valor || 0),
                      pago: l.status_pagamento === 'pago',
                    }))

                  const itensMovsFatura: ItemExtrato[] = movimentacoesFaturaConta.map((m) => {
                    const ehEstorno = m.tipo === 'estorno'
                    return {
                      id: `mov-${m.id}`,
                      tipoItem: 'movimentacao_fatura',
                      tipoMov: ehEstorno ? 'estorno' : 'saida',
                      descricao:
                        m.descricao ||
                        (ehEstorno
                          ? 'Estorno de fatura de cartão'
                          : 'Pagamento de fatura de cartão'),
                      data: m.data,
                      categoriaNome: 'Fatura de Cartão',
                      valor: Number(m.valor || 0),
                      pago: true,
                    }
                  })

                  const todosItensExtrato = [...itensLancamentos, ...itensMovsFatura].sort((a, b) =>
                    (b.data || '').localeCompare(a.data || ''),
                  )

                  if (todosItensExtrato.length === 0) {
                    return (
                      <div className="py-10 text-center text-xs text-slate-400">
                        Nenhum lançamento ou movimentação encontrada para esta seleção.
                      </div>
                    )
                  }

                  return todosItensExtrato.map((item) => {
                    const isSaida = item.tipoMov === 'saida'
                    const isEntrada = item.tipoMov === 'entrada' || item.tipoMov === 'estorno'
                    const isTransf = item.tipoMov === 'transferencia'

                    return (
                      <div
                        key={item.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 ${
                              isSaida ? 'bg-rose-500' : isEntrada ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                          >
                            {isSaida && <TrendingDown className="w-3.5 h-3.5" />}
                            {isEntrada && <TrendingUp className="w-3.5 h-3.5" />}
                            {isTransf && <ArrowRightLeft className="w-3.5 h-3.5" />}
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                              <span>{item.descricao}</span>
                              {item.tipoItem === 'movimentacao_fatura' && (
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] py-0 px-1 font-normal ${
                                    item.tipoMov === 'estorno'
                                      ? 'text-amber-800 bg-amber-50 border-amber-200'
                                      : 'text-indigo-800 bg-indigo-50 border-indigo-200'
                                  }`}
                                >
                                  {item.tipoMov === 'estorno'
                                    ? 'Estorno Fatura'
                                    : 'Pagamento Fatura'}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.data ? item.data.split('-').reverse().join('/') : ''}{' '}
                              {item.categoriaNome && `• ${item.categoriaNome}`}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`font-bold ${
                              isSaida
                                ? 'text-slate-800'
                                : isEntrada
                                  ? 'text-emerald-600'
                                  : 'text-slate-700'
                            }`}
                          >
                            {isSaida ? '-' : isEntrada ? '+' : ''}
                            {formatMoneyBRL(item.valor)}
                          </div>
                          <span
                            className={`text-[10px] font-semibold ${
                              item.pago ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          >
                            {item.pago ? 'Efetivado' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                })()
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-100 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setContaDetalhesModal(null)}
                className="text-xs"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONCILIAÇÃO BANCÁRIA */}
      <ModalConciliacao
        open={modalConciliacaoOpen}
        onOpenChange={setModalConciliacaoOpen}
        contas={contas}
        onSalvar={handleSalvarConciliacao}
      />

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO UNIFICADO (AlertDialog) */}
      <ModalConfirmacaoExclusao
        open={modalConfirmacaoExclusaoOpen}
        onOpenChange={setModalConfirmacaoExclusaoOpen}
        title={modalConfirmacaoConfig.title}
        description={modalConfirmacaoConfig.description}
        isAlertOnly={modalConfirmacaoConfig.isAlertOnly}
        confirmText={modalConfirmacaoConfig.confirmText}
        cancelText={modalConfirmacaoConfig.cancelText}
        loading={isProcessing}
        onConfirm={modalConfirmacaoConfig.onConfirm}
      />

      {/* MODAL DE ESCOLHA DE ESCOPO ÚNICO "TODOS" */}
      <ModalEscolhaEscopoSerie
        open={modalEscopoOpen}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setModalEscopoOpen(false)
            setLancamentoAlvoEscopo(null)
            setDadosEdicaoPendentes(null)
          }
        }}
        tipoAcao={acaoEscopo}
        regime={lancamentoAlvoEscopo?.serie_id ? 'fixo' : 'parcelado'}
        descricaoLancamento={dadosEdicaoPendentes?.descricao || lancamentoAlvoEscopo?.descricao}
        numeroParcela={lancamentoAlvoEscopo?.numero_parcela}
        totalParcelas={lancamentoAlvoEscopo?.total_parcelas}
        temPagas={statusSerieFixa.temPagas}
        competenciasPagas={statusSerieFixa.competenciasPagas}
        dataEscolhida={dadosEdicaoPendentes?.data || lancamentoAlvoEscopo?.data}
        loading={processandoEscopo}
        onConfirmar={handleConfirmarEscopo}
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

      {/* MODAL DO SELETOR DE MODO DE VISUALIZAÇÃO (3 MODOS) */}
      <ModalModoVisualizacao
        open={modalModoVisualizacaoOpen}
        onOpenChange={setModalModoVisualizacaoOpen}
        modoAtual={modoVisualizacao}
        onSelecionarModo={(novoModo) => {
          if (novoModo === 'competencia_integral') {
            setModoVisualizacao('competencia_integral')
            toast.success('Visualização definida para Regime de Competência Integral.')
          } else {
            // Modos 2 e 3 em breve
            toast.info(
              'Este modo estará disponível em breve com o Orçamento. O modo padrão (Competência Integral) foi mantido.',
            )
          }
        }}
      />
    </div>
  )
}
