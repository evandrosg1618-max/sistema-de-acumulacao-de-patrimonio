import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useGlobalLoading } from '@/contexts/LoadingContext'
import {
  contaService,
  meioPagamentoService,
  cartaoService,
  orcamentoService,
  categoriaService,
  lancamentoService,
  lancamentoRapidoService,
  fixoService,
} from '@/services/sap'
import { Conta, Cartao, Orcamento, Categoria, MeioPagamento, Fatura } from '@/types/sap'
import {
  formatMoneyBRL,
  getCurrentAnoMes,
  formatAnoMesPT,
  getTodayDateString,
} from '@/lib/formatters'
import {
  Eye,
  EyeOff,
  BarChart2,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  FileSpreadsheet,
  Plus,
  Target,
  CreditCard,
  Wallet,
  Banknote,
  Landmark,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Receipt,
  Layers,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Edit2,
  Trash2,
  Calendar,
  RotateCcw,
  AlertCircle,
  PieChart as PieIcon,
} from 'lucide-react'
import { ModalPagamentoFatura } from '@/components/ModalPagamentoFatura'
import { ModalEscolhaEscopoSerie, EscopoSerie } from '@/components/ModalEscolhaEscopoSerie'
import { ModalAvisoBloqueioFatura, InfoBloqueioFatura } from '@/components/ModalAvisoBloqueioFatura'
import { ModalConfirmacaoExclusao } from '@/components/ModalConfirmacaoExclusao'
import { faturaService } from '@/services/sap'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalLancamento } from '@/components/ModalLancamento'
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

export default function Index() {
  const { currentWorkspace, profile, user } = useAuth()
  const { isProcessing, runWithLock } = useGlobalLoading()
  const [ocultarSaldos, setOcultarSaldos] = useState(false)
  const [contas, setContas] = useState<Conta[]>([])
  const [carteirasDinheiro, setCarteirasDinheiro] = useState<MeioPagamento[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [resumoMes, setResumoMes] = useState<{
    receitaMensal: number
    despesaMensal: number
    maioresGastos: { nome: string; cor: string; total: number; percentual: number }[]
    totalLancamentos: number
  }>({
    receitaMensal: 0,
    despesaMensal: 0,
    maioresGastos: [],
    totalLancamentos: 0,
  })
  const [loading, setLoading] = useState(true)

  // Modal para Criar/Editar Carteira em Espécie
  const [modalDinheiroOpen, setModalDinheiroOpen] = useState(false)
  const [carteiraEmEdicao, setCarteiraEmEdicao] = useState<MeioPagamento | null>(null)
  const [nomeCarteira, setNomeCarteira] = useState('Dinheiro em Espécie / Carteira')
  const [salvandoCarteira, setSalvandoCarteira] = useState(false)

  // Modal de Lançamentos Completo da Build 2 acionado pela Visão Geral
  const [modalLancamentoOpen, setModalLancamentoOpen] = useState(false)
  const [tipoLancamentoSelecionado, setTipoLancamentoSelecionado] = useState<
    'despesa' | 'receita' | 'transferencia'
  >('despesa')

  // Estado interativo dos cartões (idêntico ao CartoesPage para manter mesmas opções e cliques)
  const [competenciaFiltro, setCompetenciaFiltro] = useState(getCurrentAnoMes())
  const [cartaoExpandido, setCartaoExpandido] = useState<string | null>(null)
  const [resumosFatura, setResumosFatura] = useState<Record<string, any>>({})
  const [faturasMap, setFaturasMap] = useState<Record<string, Fatura[]>>({})
  const [modalPagamentoOpen, setModalPagamentoOpen] = useState(false)
  const [faturaParaPagar, setFaturaParaPagar] = useState<Fatura | null>(null)
  const [cartaoFaturaPagar, setCartaoFaturaPagar] = useState<Cartao | null>(null)
  const [modalLancamentoFaturaOpen, setModalLancamentoFaturaOpen] = useState(false)
  const [lancamentoFaturaEmEdicao, setLancamentoFaturaEmEdicao] = useState<any | null>(null)
  const [cartaoIdParaNovoLanc, setCartaoIdParaNovoLanc] = useState<string | undefined>(undefined)
  const [dataPadraoParaNovoLanc, setDataPadraoParaNovoLanc] = useState<string | undefined>(
    undefined,
  )
  const [modalEscopoOpen, setModalEscopoOpen] = useState(false)
  const [acaoEscopo, setAcaoEscopo] = useState<'editar' | 'excluir'>('excluir')
  const [lancamentoAlvoEscopo, setLancamentoAlvoEscopo] = useState<any | null>(null)
  const [dadosEdicaoPendentes, setDadosEdicaoPendentes] = useState<any | null>(null)
  const [processandoEscopo, setProcessandoEscopo] = useState(false)

  // Modal Aviso Bloqueio Fatura Paga (persistente, fecha somente no botão X)
  const [bloqueioFaturaInfo, setBloqueioFaturaInfo] = useState<InfoBloqueioFatura | null>(null)
  const [modalBloqueioOpen, setModalBloqueioOpen] = useState(false)

  // Modal unificado AlertDialog para confirmações (padrão homologado de CartoesPage)
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

  const anoMes = getCurrentAnoMes()
  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  const carregarFaturasCartoes = async (listaCartoes: Cartao[], comp: string) => {
    if (!wsId || listaCartoes.length === 0) return
    try {
      const resTemp: Record<string, any> = {}
      const fMapTemp: Record<string, Fatura[]> = {}

      await Promise.all(
        listaCartoes.map(async (c) => {
          const [resumo, historico] = await Promise.all([
            faturaService.getResumoFaturaCompetencia(wsId, c.id, comp),
            faturaService.listFaturasCartao(wsId, c.id),
          ])
          resTemp[c.id] = resumo
          fMapTemp[c.id] = historico
        }),
      )

      setResumosFatura(resTemp)
      setFaturasMap(fMapTemp)
    } catch (err) {
      console.warn('Erro ao carregar detalhes de faturas:', err)
    }
  }

  const carregarDashboard = async () => {
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
      const [contasList, dinheiroList, cartoesList, orcamentosList, resumo, catsList] =
        await Promise.all([
          contaService.list(wsId, false),
          meioPagamentoService.listDinheiroComSaldo(wsId, true),
          cartaoService.list(wsId, false),
          orcamentoService.listByMes(wsId, anoMes),
          lancamentoRapidoService.getResumoMes(wsId, anoMes),
          categoriaService.listComSubcategorias(wsId),
        ])

      setContas(contasList)
      setCarteirasDinheiro(dinheiroList)
      setCartoes(cartoesList)
      setOrcamentos(orcamentosList)
      setResumoMes(resumo)
      setCategorias(catsList)

      await carregarFaturasCartoes(cartoesList, competenciaFiltro)
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDashboard()
  }, [wsId])

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

  const selecionarCompetencia = async (novaComp: string) => {
    setCompetenciaFiltro(novaComp)
    await carregarFaturasCartoes(cartoes, novaComp)
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
    await runWithLock(async () => {
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
        await carregarDashboard()
      } catch (err: any) {
        toast.error(
          'Não foi possível concluir — verifique e clique novamente; se persistir, atualize a página.',
        )
        throw err
      }
    }, 'Baixando saldo e quitando fatura...')
  }

  const handleEstornarFatura = async (faturaId: string) => {
    if (!wsId) return
    setModalConfirmacaoConfig({
      title: 'Estornar Pagamento da Fatura',
      description:
        'Deseja estornar o pagamento desta fatura? O pagamento será desfeito e o saldo bancário recomposto, permitindo alterações na fatura.',
      isAlertOnly: false,
      confirmText: 'OK',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setModalConfirmacaoExclusaoOpen(false)
        await runWithLock(async () => {
          try {
            await faturaService.estornarPagamentoFatura(faturaId, wsId, user?.id)
            toast.success('Pagamento estornado com sucesso! Saldo recomposto.')
            await carregarDashboard()
          } catch (err: any) {
            toast.error(
              'Não foi possível concluir — verifique e clique novamente; se persistir, atualize a página.',
            )
          }
        }, 'Recompondo saldo bancário e estornando pagamento...')
      },
    })
    setModalConfirmacaoExclusaoOpen(true)
  }

  const abrirNovoLancamentoNaFatura = (cartao: Cartao) => {
    const resumo = resumosFatura[cartao.id]
    // Bloquear inclusão se fatura estiver paga
    if (resumo?.status === 'paga' || (resumo?.fatura && resumo.fatura.status === 'paga')) {
      setBloqueioFaturaInfo({
        competencia: competenciaFiltro,
        acao: 'inclusao',
        detalhes: `A fatura de ${cartao.nome} (${competenciaFiltro}) já foi quitada. Desfaça o pagamento para liberar novos lançamentos.`,
      })
      setModalBloqueioOpen(true)
      return
    }

    setLancamentoFaturaEmEdicao(null)
    setCartaoIdParaNovoLanc(cartao.id)
    // Pré-preenchimento no dia de corte da competência
    const dataFechamentoComp = faturaService.calcularDataFechamentoDaCompetencia(
      competenciaFiltro,
      cartao.dia_fechamento,
      cartao.dia_vencimento,
    )
    setDataPadraoParaNovoLanc(dataFechamentoComp)
    setModalLancamentoFaturaOpen(true)
  }

  const abrirEdicaoLancamentoFatura = async (item: any) => {
    const compItem = item.competencia || competenciaFiltro
    const resumo = resumosFatura[item.cartao_id]

    if (
      (resumo && resumo.status === 'paga' && resumo.fatura?.competencia === compItem) ||
      (wsId &&
        item.cartao_id &&
        compItem &&
        (await faturaService.getFatura(wsId, item.cartao_id, compItem))?.status === 'paga')
    ) {
      setBloqueioFaturaInfo({
        competencia: compItem,
        acao: 'alteracao',
        detalhes: `A fatura desta compra (${compItem}) já foi paga. Para alterar, reabra a fatura primeiro.`,
      })
      setModalBloqueioOpen(true)
      return
    }

    let alvoParaEdicao = item
    const paiId = item.lancamento_pai_id || item.lancamento_id || item.id
    if (paiId) {
      try {
        const pai = await lancamentoService.getById(paiId)
        if (pai) alvoParaEdicao = pai
      } catch (err) {
        console.warn('Erro ao obter original:', err)
      }
    }
    setLancamentoFaturaEmEdicao(alvoParaEdicao)
    setCartaoIdParaNovoLanc(alvoParaEdicao.cartao_id || item.cartao_id || '')
    setModalLancamentoFaturaOpen(true)
  }

  const handleSalvarLancamentoFatura = async (dados: any) => {
    if (!wsId) return
    // Revalidação de fatura paga
    if (dados.cartao_id && dados.data) {
      const cartaoObj = cartoes.find((c) => c.id === dados.cartao_id)
      if (cartaoObj) {
        const compCalculada = faturaService.calcularCompetenciaCartao(
          dados.data,
          cartaoObj.dia_fechamento,
          cartaoObj.dia_vencimento,
        )
        const fat = await faturaService.getFatura(wsId, dados.cartao_id, compCalculada)
        if (fat && fat.status === 'paga') {
          setBloqueioFaturaInfo({
            competencia: compCalculada,
            acao: dados.id ? 'alteracao' : 'inclusao',
            detalhes: `A fatura de ${compCalculada} já está quitada. Desfaça o pagamento para salvar.`,
          })
          setModalBloqueioOpen(true)
          return
        }
      }
    }

    await runWithLock(async () => {
      try {
        if (dados.id) {
          const ehParcelado =
            (dados.quantidade_parcelas && dados.quantidade_parcelas > 1) ||
            (lancamentoFaturaEmEdicao?.total_parcelas &&
              lancamentoFaturaEmEdicao.total_parcelas > 1) ||
            Boolean(lancamentoFaturaEmEdicao?.lancamento_pai_id)

          if (ehParcelado) {
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
          await lancamentoService.salvarUnificado(
            {
              ...dados,
              workspace_id: wsId,
              created_by: user?.id,
            },
            user?.id,
          )
          toast.success('Compra incluída na fatura do cartão com sucesso!')
        }

        setModalLancamentoFaturaOpen(false)
        setLancamentoFaturaEmEdicao(null)
        await carregarDashboard()
      } catch (err: any) {
        toast.error(
          'Não foi possível concluir — verifique e clique novamente; se persistir, atualize a página.',
        )
        throw err
      }
    }, 'Salvando item da fatura...')
  }

  const handleExcluirLancamentoFatura = async (item: any) => {
    if (!wsId) return

    const compItem = item.competencia || competenciaFiltro
    if (item.cartao_id && compItem) {
      const fat = await faturaService.getFatura(wsId, item.cartao_id, compItem)
      if (fat && fat.status === 'paga') {
        setBloqueioFaturaInfo({
          competencia: compItem,
          acao: 'exclusao',
          detalhes: `A fatura de ${compItem} já foi paga. Para excluir, reabra a fatura primeiro.`,
        })
        setModalBloqueioOpen(true)
        return
      }
    }

    let alvoParaExclusao = item
    const paiId = item.lancamento_pai_id || item.lancamento_id || item.id
    if (paiId) {
      try {
        const pai = await lancamentoService.getById(paiId)
        if (pai) alvoParaExclusao = pai
      } catch (err) {
        console.warn('Erro ao obter original:', err)
      }
    }

    const ehParcelado =
      (alvoParaExclusao.total_parcelas && alvoParaExclusao.total_parcelas > 1) ||
      (alvoParaExclusao.quantidade_parcelas && alvoParaExclusao.quantidade_parcelas > 1) ||
      Boolean(alvoParaExclusao.lancamento_pai_id)

    if (ehParcelado) {
      setModalConfirmacaoConfig({
        title: 'Excluir compra parcelada',
        description: `Excluir a compra parcelada "${alvoParaExclusao.descricao}"? Todas as parcelas serão removidas e as faturas do cartão recalculadas.`,
        isAlertOnly: false,
        confirmText: 'OK',
        cancelText: 'Cancelar',
        onConfirm: async () => {
          setModalConfirmacaoExclusaoOpen(false)
          await runWithLock(async () => {
            try {
              await lancamentoService.excluirCompraParcelada(wsId, alvoParaExclusao.id, user?.id)
              toast.success('Compra parcelada excluída e faturas recalculadas!')
              await carregarDashboard()
            } catch (err: any) {
              toast.error(
                'Não foi possível concluir — verifique e clique novamente; se persistir, atualize a página.',
              )
            }
          }, 'Excluindo compra parcelada...')
        },
      })
      setModalConfirmacaoExclusaoOpen(true)
      return
    }

    const estaPago = alvoParaExclusao.status_pagamento === 'pago'
    if (estaPago) {
      setModalConfirmacaoConfig({
        title: 'Exclusão de Lançamento único em Conta Movimento',
        description:
          'Este lançamento está pago. É necessário desfazer o pagamento para excluir. Desfaça o pagamento no botão da lista antes de excluir.',
        isAlertOnly: true,
        confirmText: 'OK',
        cancelText: 'Cancelar',
        onConfirm: () => {
          setModalConfirmacaoExclusaoOpen(false)
        },
      })
      setModalConfirmacaoExclusaoOpen(true)
      return
    }

    setModalConfirmacaoConfig({
      title: 'Exclusão de Lançamento único em Conta Movimento',
      description: 'Deseja excluir este lançamento ?',
      isAlertOnly: false,
      confirmText: 'OK',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setModalConfirmacaoExclusaoOpen(false)
        await runWithLock(async () => {
          try {
            await lancamentoService.deleteComEscopo(alvoParaExclusao.id, wsId, 'este', user?.id)
            toast.success('Lançamento excluído e faturas recalculadas!')
            await carregarDashboard()
          } catch (err: any) {
            toast.error(
              'Não foi possível concluir — verifique e clique novamente; se persistir, atualize a página.',
            )
          }
        }, 'Excluindo lançamento da fatura...')
      },
    })
    setModalConfirmacaoExclusaoOpen(true)
  }

  // Saudação de acordo com o horário
  const hora = new Date().getHours()
  let saudacao = 'Bom dia'
  if (hora >= 12 && hora < 18) saudacao = 'Boa tarde'
  else if (hora >= 18 || hora < 5) saudacao = 'Boa noite'

  const primeiroNome = profile?.nome?.split(' ')[0] || user?.email?.split('@')[0] || 'Evandro'

  // Saldo Geral consolidado (soma contas + saldo de carteiras em dinheiro físico)
  const saldoContas = contas.reduce((acc, c) => acc + (c.saldo_atual || 0), 0)
  const saldoDinheiroTotal = carteirasDinheiro.reduce((acc, d) => acc + (d.saldo_atual || 0), 0)
  const saldoGeral = saldoContas + saldoDinheiroTotal

  // Abrir Modal de Carteira em Espécie
  const abrirNovaCarteira = () => {
    setCarteiraEmEdicao(null)
    setNomeCarteira('Dinheiro em Espécie / Carteira')
    setModalDinheiroOpen(true)
  }

  const abrirEdicaoCarteira = (m: MeioPagamento) => {
    setCarteiraEmEdicao(m)
    setNomeCarteira(m.nome)
    setModalDinheiroOpen(true)
  }

  const handleSalvarCarteira = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formElement = e.currentTarget
    const formData = new FormData(formElement)
    const formNome = (formData.get('nome') as string)?.trim() || nomeCarteira.trim()

    if (!formNome) {
      toast.error('Informe o nome da carteira')
      return
    }

    if (!wsId) {
      toast.error('Selecione um espaço familiar para continuar. Atualize a página.')
      return
    }

    setSalvandoCarteira(true)
    try {
      if (carteiraEmEdicao) {
        await meioPagamentoService.update(carteiraEmEdicao.id, wsId, { nome: formNome }, user?.id)
        toast.success(`Carteira "${formNome}" atualizada com sucesso!`)
      } else {
        await meioPagamentoService.createDinheiro(wsId, formNome, user?.id)
        toast.success(`Carteira "${formNome}" cadastrada com sucesso!`)
      }

      setModalDinheiroOpen(false)
      await carregarDashboard()
    } catch (err: any) {
      toast.error('Erro ao salvar carteira: ' + (err.message || 'tente novamente'))
    } finally {
      setSalvandoCarteira(false)
    }
  }

  // Abrir Modal Completo da Build 2
  const abrirAcaoRapida = (tipo: 'despesa' | 'receita' | 'transferencia') => {
    setTipoLancamentoSelecionado(tipo)
    setModalLancamentoOpen(true)
  }

  const handleSalvarLancamentoVisaoGeral = async (dados: any, criarOutro = false) => {
    if (!wsId) return
    await runWithLock(async () => {
      try {
        // REQUISITO 1: Chamada unificada para criação atômica de fixos/únicos na Visão Geral
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
        await carregarDashboard()
      } catch (err: any) {
        if (err?.message && err.message.includes('fatura') && err.message.includes('paga')) {
          setBloqueioFaturaInfo({
            competencia: dados.competencia || dados.data?.substring(0, 7) || 'atual',
            acao: 'inclusao',
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
    }, 'Registrando lançamento e atualizando saldos...')
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. CABEÇALHO DE BOAS-VINDAS ESTILO ORGANIZZE */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Esquerda: Saudação + Receita e Despesa Mensais */}
        <div className="space-y-4">
          <div>
            <div className="text-xs md:text-sm text-slate-500 font-normal">{saudacao},</div>
            <div className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              {primeiroNome}!
            </div>
          </div>

          <div className="flex items-center gap-6 sm:gap-8">
            <div>
              <div className="text-xs text-slate-500 font-medium">Receita mensal</div>
              <div className="text-base sm:text-lg font-bold text-emerald-600">
                {ocultarSaldos ? '••••••' : formatMoneyBRL(resumoMes.receitaMensal)}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200" />

            <div>
              <div className="text-xs text-slate-500 font-medium">Despesa mensal</div>
              <div className="text-base sm:text-lg font-bold text-rose-600">
                {ocultarSaldos ? '••••••' : formatMoneyBRL(resumoMes.despesaMensal)}
              </div>
            </div>

            <button
              onClick={() => setOcultarSaldos(!ocultarSaldos)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
              title={ocultarSaldos ? 'Mostrar saldos' : 'Ocultar saldos'}
            >
              <BarChart2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Direita: Botões de Ação Rápida no modelo Organizze */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Despesa */}
          <button
            onClick={() => abrirAcaoRapida('despesa')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 text-slate-700 hover:text-rose-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Despesa</span>
          </button>

          {/* Entrada */}
          <button
            onClick={() => abrirAcaoRapida('receita')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Entrada</span>
          </button>

          {/* Transferência */}
          <button
            onClick={() => abrirAcaoRapida('transferencia')}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
              <ArrowRightLeft className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Transferência</span>
          </button>

          {/* Importar (placeholder da Build futura, desabilitado/informativo) */}
          <button
            onClick={() =>
              toast.info(
                'Importação bancária (OFX/Open Finance) estará disponível nas próximas builds do PRD.',
              )
            }
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 text-xs sm:text-sm font-semibold transition shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span>Importar</span>
          </button>
        </div>
      </div>

      {/* 2. LAYOUT EM DUAS COLUNAS CONFORME O PRINT DO ORGANIZZE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* COLUNA ESQUERDA: Saldo Geral + Minhas Contas + Meus Cartões */}
        <div className="space-y-6">
          {/* Card Saldo Geral com barra verde vertical à esquerda */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-10 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Saldo geral</div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight">
                  {ocultarSaldos ? '••••••••' : formatMoneyBRL(saldoGeral)}
                </div>
              </div>
            </div>

            <button
              onClick={() => setOcultarSaldos(!ocultarSaldos)}
              className="text-slate-400 hover:text-slate-600 p-1"
              title={ocultarSaldos ? 'Exibir saldo' : 'Ocultar saldo'}
            >
              {ocultarSaldos ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Minhas Contas */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800">Minhas contas</h2>
              </div>
              <Link
                to="/contas"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>Gerenciar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {contas.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-xs text-slate-400">Nenhuma conta cadastrada ainda.</p>
                  <Link to="/contas">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-emerald-700 border-emerald-200"
                    >
                      Cadastrar Conta
                    </Button>
                  </Link>
                </div>
              ) : (
                contas.map((conta) => {
                  const isNegativo = (conta.saldo_atual || 0) < 0
                  return (
                    <div
                      key={conta.id}
                      className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: conta.cor || '#10B981' }}
                        >
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs md:text-sm font-semibold text-slate-800">
                            {conta.nome}
                          </div>
                          <div className="text-[11px] text-slate-400">Conta manual</div>
                        </div>
                      </div>

                      <div
                        className={`text-xs md:text-sm font-bold ${
                          isNegativo ? 'text-rose-600' : 'text-blue-600'
                        }`}
                      >
                        {ocultarSaldos ? '••••••' : formatMoneyBRL(conta.saldo_atual)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Carteira / Dinheiro em Espécie (EXIBIDO ABAIXO DE MINHAS CONTAS CONFORME PEDIDO) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800">Carteira & Dinheiro em Espécie</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={abrirNovaCarteira}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  title="Adicionar Carteira / Dinheiro em Espécie"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
                <span className="text-slate-300">•</span>
                <Link
                  to="/meios-pagamento"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <span>Gerenciar</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {carteirasDinheiro.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    Nenhuma carteira física ou dinheiro em espécie cadastrado.
                  </p>
                  <Button
                    onClick={abrirNovaCarteira}
                    variant="outline"
                    size="sm"
                    className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Adicionar Carteira
                  </Button>
                </div>
              ) : (
                carteirasDinheiro.map((carteira) => {
                  const saldo = carteira.saldo_atual || 0
                  const isNegativo = saldo < 0
                  return (
                    <div
                      key={carteira.id}
                      className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50/70 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: carteira.cor || '#10B981' }}
                        >
                          <Banknote className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs md:text-sm font-semibold text-slate-800">
                              {carteira.nome}
                            </span>
                            <button
                              onClick={() => abrirEdicaoCarteira(carteira)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition"
                              title="Editar nome da carteira"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400">Dinheiro em espécie</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div
                          className={`text-xs md:text-sm font-bold ${
                            isNegativo
                              ? 'text-rose-600'
                              : saldo > 0
                                ? 'text-emerald-600'
                                : 'text-slate-600'
                          }`}
                        >
                          {ocultarSaldos ? '••••••' : formatMoneyBRL(saldo)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* TOTAL CONSOLIDADO DE CARTÕES (3 INDICADORES: PRÓXIMA FATURA A VENCER, TOTAL COMPROMETIDO, LIMITE DISPONÍVEL) */}
          {cartoes.length > 0 &&
            (() => {
              const limiteConsolidado = cartoes.reduce((acc, c) => acc + (c.limite || 0), 0)
              // Regra SAP Build 5: O quadro "Total das Faturas" na página inicial reflete
              // a soma do consolidado global do banco (mesma fonte e valor de "Total Comprometido" em Meus Cartões)
              const totalComprometidoGeral = cartoes.reduce((acc, c) => {
                return acc + Number(c.total_comprometido || 0)
              }, 0)
              const comprometidoConsolidado = totalComprometidoGeral
              const limiteDisponivelConsolidado = Math.max(
                0,
                limiteConsolidado - comprometidoConsolidado,
              )

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                  <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-100">
                    <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">
                      Total das Faturas
                    </div>
                    <div className="text-lg font-bold text-rose-600 mt-0.5">
                      {ocultarSaldos ? '••••••' : formatMoneyBRL(totalComprometidoGeral)}
                    </div>
                    <div className="text-[10px] text-rose-700/80 mt-0.5">
                      Competência {competenciaFiltro}
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-100">
                    <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
                      Total comprometido
                    </div>
                    <div className="text-lg font-bold text-amber-600 mt-0.5">
                      {ocultarSaldos ? '••••••' : formatMoneyBRL(comprometidoConsolidado)}
                    </div>
                    <div className="text-[10px] text-amber-700/80 mt-0.5">
                      Fatura aberta + parcelas futuras
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100">
                    <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                      Limite Total Disponível
                    </div>
                    <div className="text-lg font-bold text-emerald-600 mt-0.5">
                      {ocultarSaldos ? '••••••' : formatMoneyBRL(limiteDisponivelConsolidado)}
                    </div>
                    <div className="text-[10px] text-emerald-700/80 mt-0.5">
                      Descontado o Total comprometido
                    </div>
                  </div>
                </div>
              )
            })()}

          {/* MEUS CARTÕES: VISUALIZAÇÃO COMPLETA CLICÁVEL IDÊNTICA À TELA DE CARTÕES */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 px-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">Meus cartões</h2>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 text-indigo-700 bg-indigo-50 border-indigo-200"
                >
                  Faturas & Parcelas
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                {/* Seletor de Competência */}
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-600"
                    onClick={() => mudarCompetencia(-1)}
                    title="Competência anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <div className="px-2 text-xs font-bold text-slate-800 flex items-center gap-1 justify-center min-w-[105px]">
                    <Calendar className="w-3 h-3 text-indigo-600" />
                    <span>{formatAnoMesPT(competenciaFiltro)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-600"
                    onClick={() => mudarCompetencia(1)}
                    title="Próxima competência"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <Link
                  to="/cartoes"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 pl-1"
                >
                  <span>Gerenciar</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {cartoes.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-xs text-slate-400">Nenhum cartão cadastrado ainda.</p>
                  <Link to="/cartoes">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-indigo-700 border-indigo-200"
                    >
                      Cadastrar Cartão
                    </Button>
                  </Link>
                </div>
              ) : (
                cartoes.map((cartao) => {
                  const fatura = cartao.fatura_atual || 0
                  const resumo = resumosFatura[cartao.id]
                  const totalComp = cartao.total_comprometido || fatura

                  return (
                    <div key={cartao.id} className="transition">
                      <div className="p-3.5 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                            style={{ backgroundColor: cartao.cor || '#4F46E5' }}
                          >
                            <CreditCard className="w-4 h-4" />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 text-xs md:text-sm">
                                {cartao.nome}
                              </span>
                              <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full font-medium">
                                {cartao.bandeira}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span>Fecha dia {cartao.dia_fechamento}</span>
                              <span>•</span>
                              <span>Vence dia {cartao.dia_vencimento}</span>
                              <span>•</span>
                              <span>
                                Limite: {ocultarSaldos ? '•••' : formatMoneyBRL(cartao.limite)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-auto w-full sm:w-auto">
                          <div className="text-right">
                            <div className="font-bold text-xs md:text-sm text-rose-600">
                              {ocultarSaldos
                                ? '••••••'
                                : formatMoneyBRL(resumo?.saldoDevedor ?? fatura)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Fatura {competenciaFiltro} (
                              {resumo?.statusExibicao ||
                                (resumo?.status === 'paga' ? 'Paga' : 'Aberta')}
                              )
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setCartaoExpandido(cartaoExpandido === cartao.id ? null : cartao.id)
                            }
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-indigo-200 bg-indigo-50/50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                          >
                            <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Fatura & Parcelas</span>
                            {cartaoExpandido === cartao.id ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Painel expandido com lançamentos da fatura e Outras Competências (idêntico ao CartoesPage) */}
                      {cartaoExpandido === cartao.id && (
                        <div className="bg-slate-50/90 p-4 border-t border-slate-200 space-y-4">
                          {/* Painel da Competência Ativa */}
                          <div className="bg-white rounded-xl border border-indigo-100 p-3.5 shadow-xs space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-indigo-600" />
                                <span className="text-xs sm:text-sm font-bold text-slate-800">
                                  Fatura {formatAnoMesPT(competenciaFiltro)} ({competenciaFiltro})
                                </span>
                                <Badge
                                  className={`text-[9px] py-0 px-1.5 ${
                                    resumo?.statusExibicao === 'Paga' || resumo?.status === 'paga'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                      : resumo?.statusExibicao === 'Pago parcial' ||
                                          resumo?.status === 'pago_parcial'
                                        ? 'bg-orange-100 text-orange-800 border-orange-200'
                                        : resumo?.statusExibicao === 'Fechada'
                                          ? 'bg-slate-200 text-slate-800 border-slate-300'
                                          : 'bg-amber-100 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {resumo?.statusExibicao ||
                                    (resumo?.status === 'paga'
                                      ? 'Paga'
                                      : resumo?.status === 'pago_parcial'
                                        ? 'Pago parcial'
                                        : 'Aberta')}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 block">Total</span>
                                  <span className="text-xs sm:text-sm font-bold text-slate-900">
                                    {formatMoneyBRL(resumo?.totalCompras ?? 0)}
                                  </span>
                                </div>

                                {resumo?.totalPago > 0 && (
                                  <div className="text-right border-l border-slate-200 pl-3">
                                    <span className="text-[10px] text-emerald-600 block">Pago</span>
                                    <span className="text-xs sm:text-sm font-bold text-emerald-700">
                                      {formatMoneyBRL(resumo.totalPago)}
                                    </span>
                                  </div>
                                )}

                                <div className="text-right border-l border-slate-200 pl-3">
                                  <span className="text-[10px] text-rose-500 block">A Pagar</span>
                                  <span className="text-xs sm:text-sm font-bold text-rose-600">
                                    {formatMoneyBRL(resumo?.saldoDevedor ?? 0)}
                                  </span>
                                </div>

                                {resumo?.fatura &&
                                  resumo?.status !== 'paga' &&
                                  resumo?.saldoDevedor > 0 && (
                                    <Button
                                      size="sm"
                                      disabled={isProcessing}
                                      onClick={() => abrirModalPagarFatura(resumo.fatura, cartao)}
                                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold ml-2"
                                    >
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Pagar Fatura
                                    </Button>
                                  )}

                                {resumo?.fatura &&
                                  (resumo?.status === 'paga' ||
                                    resumo?.statusExibicao === 'Paga' ||
                                    resumo?.status === 'pago_parcial' ||
                                    resumo?.statusExibicao === 'Pago parcial') && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={isProcessing}
                                      onClick={() => handleEstornarFatura(resumo.fatura.id)}
                                      className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 font-semibold ml-2"
                                    >
                                      <RotateCcw className="w-3 h-3 mr-1" />
                                      Estornar Pagamento
                                    </Button>
                                  )}
                              </div>
                            </div>

                            {/* Tarja vermelha de fatura atrasada */}
                            {resumo?.isAtrasada && (
                              <div className="bg-rose-600 text-white px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-semibold shadow-xs">
                                <span className="flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 shrink-0 text-white" />
                                  Fatura atrasada — vencimento expirou em{' '}
                                  {resumo?.fatura?.data_vencimento
                                    ? resumo.fatura.data_vencimento.split('-').reverse().join('/')
                                    : 'data anterior'}
                                </span>
                                {resumo?.fatura && resumo?.status !== 'paga' && (
                                  <Button
                                    size="sm"
                                    disabled={isProcessing}
                                    variant="secondary"
                                    className="h-6 text-[11px] bg-white text-rose-700 hover:bg-rose-50 font-bold px-2 py-0"
                                    onClick={() => abrirModalPagarFatura(resumo.fatura, cartao)}
                                  >
                                    Pagar agora
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Lista de compras e parcelas da competência */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                                <span className="flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                  Compras e Parcelas ({resumo?.itens?.length || 0}):
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => abrirNovoLancamentoNaFatura(cartao)}
                                  className="h-6 text-[11px] bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Incluir na Fatura
                                </Button>
                              </div>

                              {!resumo?.itens || resumo.itens.length === 0 ? (
                                <div className="p-4 bg-slate-50 rounded-lg text-center space-y-1.5 border border-dashed border-slate-200">
                                  <p className="text-xs text-slate-500 font-medium">
                                    Nenhum lançamento ou parcela nesta fatura ({competenciaFiltro}).
                                  </p>
                                </div>
                              ) : (
                                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                                  {resumo.itens.map((l: any) => {
                                    const numP = l.numero_parcela || 1
                                    const totP = l.total_parcelas || l.quantidade_parcelas || 1
                                    const ehParcela = totP > 1
                                    const ehFixo = Boolean(l.serie_id && l.regime === 'fixo')
                                    const ehPrevisao =
                                      (l as any).natureza === 'previsao' ||
                                      (l as any).natureza_previsao === true ||
                                      (l.status_pagamento as string) === 'previsao'

                                    return (
                                      <div
                                        key={l.id}
                                        className={`flex items-center justify-between p-2 sm:px-2.5 text-xs transition ${
                                          ehPrevisao
                                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                            : 'hover:bg-slate-50'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-slate-400 text-[10px] font-mono shrink-0">
                                            {l.data ? l.data.split('-').reverse().join('/') : ''}
                                          </span>
                                          <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-semibold text-slate-800 truncate">
                                                {l.descricao}
                                              </span>
                                              {ehParcela && (
                                                <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[9px] py-0 px-1 font-bold shrink-0">
                                                  {numP}/{totP}
                                                </Badge>
                                              )}
                                              {ehFixo && (
                                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[9px] py-0 px-1.5 font-bold shrink-0">
                                                  Fixo
                                                </Badge>
                                              )}
                                              {ehPrevisao && (
                                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[9px] py-0 px-1.5 font-semibold shrink-0">
                                                  Previsão
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

                                        <div className="flex items-center gap-2 shrink-0 pl-2">
                                          <span className="font-bold text-rose-600 text-xs">
                                            {formatMoneyBRL(l.valor)}
                                          </span>
                                          <div className="flex items-center">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => abrirEdicaoLancamentoFatura(l)}
                                              title="Alterar lançamento desta fatura"
                                              className="h-6 w-6 text-slate-400 hover:text-indigo-600"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => handleExcluirLancamentoFatura(l)}
                                              title="Excluir lançamento desta fatura"
                                              className="h-6 w-6 text-slate-400 hover:text-rose-600"
                                            >
                                              <Trash2 className="w-3 h-3" />
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

                          {/* OUTRAS COMPETÊNCIAS CADASTRADAS (Ordem crescente a partir do mês anterior e clicáveis) */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                OUTRAS COMPETÊNCIAS CADASTRADAS
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Clique para abrir a fatura
                              </span>
                            </div>

                            {!faturasMap[cartao.id] || faturasMap[cartao.id].length === 0 ? (
                              <div className="p-3 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-400">
                                Nenhuma outra fatura gerada para este cartão.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(() => {
                                  const hoje = new Date()
                                  const mesAnterior = new Date(
                                    hoje.getFullYear(),
                                    hoje.getMonth() - 1,
                                    1,
                                  )
                                  const compMesAnterior = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`

                                  const lista = [...faturasMap[cartao.id]]
                                  lista.sort((a, b) => a.competencia.localeCompare(b.competencia))
                                  const aPartirDoMesAnterior = lista.filter(
                                    (f) => f.competencia >= compMesAnterior,
                                  )
                                  const listaFinal =
                                    aPartirDoMesAnterior.length > 0 ? aPartirDoMesAnterior : lista

                                  return listaFinal.map((fat) => {
                                    const isPaga = fat.status === 'paga'
                                    const isAtiva = fat.competencia === competenciaFiltro
                                    const hojeStr = getTodayDateString()
                                    const dataFech = fat.data_fechamento || `${fat.competencia}-01`
                                    const dataVenc = fat.data_vencimento || `${fat.competencia}-28`

                                    let statusExib = 'Aberta'
                                    let isAtrasadaCard = false
                                    if (isPaga) {
                                      statusExib = 'Paga'
                                    } else if (hojeStr >= dataFech) {
                                      statusExib = 'Fechada'
                                      if (hojeStr > dataVenc) {
                                        isAtrasadaCard = true
                                      }
                                    } else {
                                      statusExib = 'Aberta'
                                    }

                                    return (
                                      <div
                                        key={fat.id}
                                        onClick={() => selecionarCompetencia(fat.competencia)}
                                        className={`rounded-xl border p-2.5 flex items-center justify-between text-xs transition cursor-pointer shadow-2xs hover:shadow-sm ${
                                          isAtiva
                                            ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-400'
                                            : isAtrasadaCard
                                              ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300 hover:bg-rose-50/70'
                                              : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
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
                                                  : statusExib === 'Fechada'
                                                    ? 'bg-slate-200 text-slate-800 border-slate-300'
                                                    : 'bg-amber-100 text-amber-900 border-amber-300'
                                              }`}
                                            >
                                              {statusExib}
                                            </Badge>
                                            {isAtrasadaCard && (
                                              <Badge className="text-[9px] py-0 px-1 font-semibold bg-rose-600 text-white border-rose-700">
                                                Atrasada
                                              </Badge>
                                            )}
                                          </div>
                                          <span className="text-xs font-semibold text-slate-600 block">
                                            {formatMoneyBRL(fat.valor_total)}
                                          </span>
                                        </div>

                                        <div className="pl-2" onClick={(e) => e.stopPropagation()}>
                                          {!isPaga ? (
                                            <Button
                                              size="sm"
                                              disabled={isProcessing}
                                              onClick={() => abrirModalPagarFatura(fat, cartao)}
                                              className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 rounded-lg"
                                            >
                                              Pagar
                                            </Button>
                                          ) : (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              disabled={isProcessing}
                                              onClick={() => handleEstornarFatura(fat.id)}
                                              className="h-6 text-[10px] text-rose-700 border-rose-200 hover:bg-rose-50 px-2 rounded-lg"
                                            >
                                              Estornar Pagamento
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
                })
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: Maiores gastos do mês atual + Orçamento */}
        <div className="space-y-6">
          {/* Card: Maiores gastos do mês atual (modelo Organizze) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Maiores gastos do mês atual</h2>

            {resumoMes.maioresGastos.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <PieIcon className="w-8 h-8" />
                </div>
                <div className="text-xs font-semibold text-slate-700">
                  Nenhum gasto registrado neste mês
                </div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Use os botões de ação rápida no topo para registrar despesas e acompanhar o
                  gráfico de distribuição de categorias.
                </p>
                <Button
                  onClick={() => abrirAcaoRapida('despesa')}
                  variant="outline"
                  size="sm"
                  className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <TrendingDown className="w-3.5 h-3.5 mr-1" />
                  Lançar Despesa
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                {/* Lista com ícones e percentuais */}
                <div className="w-full space-y-3 flex-1">
                  {resumoMes.maioresGastos.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: item.cor || '#64748B' }}
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                        <span className="font-medium text-slate-700 truncate max-w-[150px]">
                          {item.nome}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {item.percentual.toFixed(2).replace('.', ',')}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Gráfico de Rosca Visual Representativo dos Maiores Gastos */}
                <div className="flex flex-col items-center justify-center shrink-0">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      {resumoMes.maioresGastos.slice(0, 5).map((item, i, arr) => {
                        let offset = 0
                        for (let j = 0; j < i; j++) offset += arr[j].percentual
                        return (
                          <circle
                            key={i}
                            cx="18"
                            cy="18"
                            r="14"
                            fill="transparent"
                            stroke={item.cor || '#10B981'}
                            strokeWidth="4"
                            strokeDasharray={`${item.percentual} ${100 - item.percentual}`}
                            strokeDashoffset={-offset}
                          />
                        )
                      })}
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        Total
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {formatMoneyBRL(resumoMes.despesaMensal)}
                      </span>
                    </div>
                  </div>

                  <Link to="/orcamento" className="mt-3">
                    <Button variant="outline" size="sm" className="text-[11px] h-7 text-slate-600">
                      Ver detalhes
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Card: Orçamento (TRANSFORMADO CONFORME PEDIDO DO USUÁRIO: TÍTULO CENTRALIZADO COM ÍCONE CIRCULAR) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
              <Target className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">Orçamento</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Aqui você poderá ver todos os seus limites disponíveis por categoria e valores.
              </p>
            </div>

            {orcamentos.length === 0 ? (
              <div className="pt-2">
                <Link to="/orcamento">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-medium"
                  >
                    Definir Orçamento Mensal
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="pt-3 space-y-2.5 text-left border-t border-slate-100">
                {orcamentos.slice(0, 4).map((orc) => {
                  const consumo = orc.consumo_atual || 0
                  const limite = orc.limite || 1
                  const pct = Math.min(100, Math.round((consumo / limite) * 100))
                  return (
                    <div key={orc.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-700">
                        <span>{orc.categoria?.nome}</span>
                        <span>
                          {formatMoneyBRL(consumo)} / {formatMoneyBRL(orc.limite)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            pct >= 80
                              ? 'bg-rose-500'
                              : pct >= 60
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}

                <div className="pt-2 text-center">
                  <Link to="/orcamento">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-emerald-600 hover:text-emerald-700"
                    >
                      Ver todos os limites
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CADASTRO / EDIÇÃO DE CARTEIRA EM ESPÉCIE */}
      <Dialog open={modalDinheiroOpen} onOpenChange={setModalDinheiroOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarCarteira}>
            <DialogHeader>
              <DialogTitle>
                {carteiraEmEdicao ? 'Editar Carteira em Espécie' : 'Adicionar Carteira em Espécie'}
              </DialogTitle>
              <DialogDescription>
                Ideal para compras à vista em notas, feiras, pequenos trocos e pagamentos sem banco.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div>
                <Label htmlFor="carteira-nome" className="text-xs font-semibold text-slate-700">
                  Nome da Carteira / Espécie *
                </Label>
                <Input
                  id="carteira-nome"
                  name="nome"
                  value={nomeCarteira}
                  onChange={(e) => setNomeCarteira(e.target.value)}
                  placeholder="Ex: Dinheiro em Espécie, Carteira do Dia a Dia, Troco"
                  className="mt-1"
                  autoFocus
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalDinheiroOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvandoCarteira}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {salvandoCarteira
                  ? 'Salvando...'
                  : carteiraEmEdicao
                    ? 'Salvar Alterações'
                    : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL COMPLETO DE LANÇAMENTOS (BUILD 2) */}
      <ModalLancamento
        open={modalLancamentoOpen}
        onOpenChange={setModalLancamentoOpen}
        onSave={handleSalvarLancamentoVisaoGeral}
        tipoPadrao={tipoLancamentoSelecionado}
        contas={contas}
        cartoes={cartoes}
        categorias={categorias}
        workspaceId={wsId || ''}
        userId={user?.id}
      />

      {/* MODAL PAGAMENTO DE FATURA ACIONADO DA PÁGINA INICIAL */}
      {faturaParaPagar && (
        <ModalPagamentoFatura
          open={modalPagamentoOpen}
          onOpenChange={setModalPagamentoOpen}
          fatura={faturaParaPagar}
          nomeCartao={cartaoFaturaPagar?.nome}
          contas={contas}
          onConfirmar={handlePagarFatura}
        />
      )}

      {/* MODAL INCLUIR / EDITAR LANÇAMENTO NA FATURA ACIONADO DA PÁGINA INICIAL */}
      <ModalLancamento
        open={modalLancamentoFaturaOpen}
        onOpenChange={(aberto) => {
          setModalLancamentoFaturaOpen(aberto)
          if (!aberto) setLancamentoFaturaEmEdicao(null)
        }}
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

      {/* MODAL DE AVISO DE BLOQUEIO POR FATURA PAGA (FECHA APENAS COM BOTÃO X) */}
      <ModalAvisoBloqueioFatura
        open={modalBloqueioOpen}
        onClose={() => {
          setModalBloqueioOpen(false)
          setBloqueioFaturaInfo(null)
        }}
        info={bloqueioFaturaInfo}
      />

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO / ESTORNO (ALERTDIALOG) */}
      <ModalConfirmacaoExclusao
        open={modalConfirmacaoExclusaoOpen}
        onOpenChange={setModalConfirmacaoExclusaoOpen}
        title={modalConfirmacaoConfig.title}
        description={modalConfirmacaoConfig.description}
        isAlertOnly={modalConfirmacaoConfig.isAlertOnly}
        confirmText={modalConfirmacaoConfig.confirmText}
        cancelText={modalConfirmacaoConfig.cancelText}
        onConfirm={modalConfirmacaoConfig.onConfirm}
      />
    </div>
  )
}
