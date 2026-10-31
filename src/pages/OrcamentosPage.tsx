import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search,
  ChevronDown,
  X,
  Plus,
  Pencil,
  MoreVertical,
  Check,
  ChevronLeft,
  ChevronRight,
  Target,
  Copy,
  Layers,
  ArrowUpRight,
  TrendingDown,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { orcamentoService } from '@/services/sap'
import {
  OrcamentoConsolidado,
  OrcamentoCategoriaItem,
  OrcamentoSubcategoriaItem,
  LancamentoPeriodoAnteriorItem,
} from '@/types/sap'
import { CardMetaPoupanca, MetaPoupancaDados } from '@/components/CardMetaPoupanca'
import { formatMoneyBRL, getCurrentAnoMes, formatAnoMesPT } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModalLancamentosPeriodoAnterior } from '@/components/ModalLancamentosPeriodoAnterior'
import { toast } from 'sonner'

// CARD 4: Barra de Consumo (Padrão para TODAS as barras da tela)
// Regra:
// - Até 50%: verde (#16A34A / bg-emerald-500)
// - 51% a 70%: toda pintada de amarelo ou laranja (#EAB308 / #F97316 / bg-amber-500)
// - Mais de 70%: toda pintada de vermelho (#DC2626 / bg-rose-600)
// A cor muda por faixa, SEM pintura parcial/gradiente por dentro.
export const getBarraConsumoClass = (pct: number) => {
  if (pct > 70) return 'bg-rose-600'
  if (pct > 50) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export const getBarraConsumoHex = (pct: number) => {
  if (pct > 70) return '#DC2626'
  if (pct > 50) return '#F59E0B'
  return '#10B981'
}

export default function OrcamentosPage() {
  const { currentWorkspace, user } = useAuth()
  const [anoMes, setAnoMes] = useState(getCurrentAnoMes())
  const [consolidado, setConsolidado] = useState<OrcamentoConsolidado | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [modoPreenchimentoZero, setModoPreenchimentoZero] = useState(false)

  // CARD 5: Filtro de subcategorias (combobox)
  const [filtroSubcatInput, setFiltroSubcatInput] = useState('')
  const [filtroSubcatOpen, setFiltroSubcatOpen] = useState(false)
  const [categoriaSelecionadaId, setCategoriaSelecionadaId] = useState<string | null>(null)
  const filtroSubcatContainerRef = useRef<HTMLDivElement>(null)

  // CARD 6: Lupa de texto
  const [buscaTexto, setBuscaTexto] = useState('')

  // Requisito 9.9: Novos filtros de despesas no card de filtros
  // "Por classificação" (Todas / Essencial / Ajustável / Discricionária / Supérflua)
  // "Por natureza" (Todas / Consumo / Patrimonial)
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todas')
  const [filtroNatureza, setFiltroNatureza] = useState<string>('todas')

  // Requisito 9: Estado do Card Meta de Poupança (RPC atômica no banco)
  const [metaPoupancaDados, setMetaPoupancaDados] = useState<MetaPoupancaDados | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)

  // Edição inline de limite da subcategoria (Card 7.5)
  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null)
  const [editValorInput, setEditValorInput] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Modal dos 3 pontinhos (Card 7.7)
  const [modalLancamentosOpen, setModalLancamentosOpen] = useState(false)
  const [modalLancamentosTitulo, setModalLancamentosTitulo] = useState('')
  const [modalLancamentosSubtitulo, setModalLancamentosSubtitulo] = useState('')
  const [modalLancamentosTotal, setModalLancamentosTotal] = useState(0)
  const [modalLancamentosLista, setModalLancamentosLista] = useState<
    LancamentoPeriodoAnteriorItem[]
  >([])
  const [modalLancamentosLoading, setModalLancamentosLoading] = useState(false)

  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || undefined

  // Carregar consolidado do banco (RPC)
  const carregarDados = async (showToastError = true) => {
    if (!wsId) return
    setLoading(true)
    setLoadingMeta(true)
    try {
      const [data, metaData] = await Promise.all([
        orcamentoService.obterConsolidado(wsId, anoMes),
        orcamentoService.calcularMetaPoupanca(wsId, anoMes),
      ])
      setConsolidado(data)
      setMetaPoupancaDados(metaData)
    } catch (err: any) {
      console.error('Erro ao carregar orçamento:', err)
      if (showToastError) {
        toast.error('Erro ao carregar orçamento: ' + (err.message || 'tente novamente'))
      }
    } finally {
      setLoading(false)
      setLoadingMeta(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [wsId, anoMes])

  // Salvar Meta de Poupança por competência de forma idempotente com RPC atômica
  const handleSalvarMetaPoupanca = async (
    novaMeta: number | null,
    percentual: number,
    subcategoriasIds: string[],
  ) => {
    if (!wsId) return
    try {
      await orcamentoService.gravarMetaPoupanca({
        workspace_id: wsId,
        competencia: anoMes,
        meta_poupanca: novaMeta,
        percentual_minimo: percentual,
        subcategorias_selecionadas: subcategoriasIds,
        user_id: user?.id,
      })
      toast.success('Meta de poupança atualizada!')
      // Recarregar cálculo atualizado do banco
      const metaAtualizada = await orcamentoService.calcularMetaPoupanca(
        wsId,
        anoMes,
        subcategoriasIds,
        percentual,
      )
      setMetaPoupancaDados(metaAtualizada)
    } catch (e: any) {
      toast.error('Erro ao salvar meta de poupança: ' + (e.message || 'tente novamente'))
      throw e
    }
  }

  // Fechar dropdown do filtro de subcategorias ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filtroSubcatContainerRef.current &&
        !filtroSubcatContainerRef.current.contains(e.target as Node)
      ) {
        setFiltroSubcatOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Auto focus quando abrir caixinha de edição de limite
  useEffect(() => {
    if (editingSubcatId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingSubcatId])

  // Navegar mês (Fuso -4 / mesma lógica dos períodos de Lançamentos)
  const navegarMes = (delta: number) => {
    const [anoStr, mesStr] = anoMes.split('-')
    let ano = parseInt(anoStr, 10)
    let mes = parseInt(mesStr, 10) + delta
    if (mes > 12) {
      mes = 1
      ano++
    } else if (mes < 1) {
      mes = 12
      ano--
    }
    setAnoMes(`${ano}-${String(mes).padStart(2, '0')}`)
    setModoPreenchimentoZero(false)
    setCategoriaSelecionadaId(null)
    setFiltroSubcatInput('')
    setBuscaTexto('')
    setEditingSubcatId(null)
  }

  // Lista plana de todas as subcategorias para o Card 5
  const todasSubcategorias = useMemo(() => {
    if (!consolidado?.categorias) return []
    const list: Array<{
      id: string
      nome: string
      categoriaId: string
      categoriaNome: string
      limite_definido: number
      valor_efetivado: number
    }> = []

    for (const cat of consolidado.categorias) {
      for (const sub of cat.subcategorias || []) {
        list.push({
          id: sub.id,
          nome: sub.nome,
          categoriaId: cat.id,
          categoriaNome: cat.nome,
          limite_definido: sub.limite_definido || 0,
          valor_efetivado: sub.valor_efetivado || 0,
        })
      }
    }

    return list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [consolidado])

  // Subcategorias filtradas para o dropdown do Card 5
  const subcategoriasSugeridas = useMemo(() => {
    if (!filtroSubcatInput.trim()) return todasSubcategorias
    const termo = filtroSubcatInput.toLowerCase().trim()
    return todasSubcategorias.filter(
      (s) => s.nome.toLowerCase().includes(termo) || s.categoriaNome.toLowerCase().includes(termo),
    )
  }, [todasSubcategorias, filtroSubcatInput])

  // Gravação de limite (Card 7.5 - RPC atômica idempotente com anti duplo clique)
  const salvarLimiteSubcategoria = async (subcatId: string, valorStr: string) => {
    if (!wsId || isProcessing) return

    const limNum = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'))
    if (isNaN(limNum) || limNum < 0) {
      toast.error('Informe um valor de limite válido (não pode ser negativo).')
      return
    }

    setIsProcessing(true)
    try {
      await orcamentoService.gravarLimiteSubcategoria({
        workspace_id: wsId,
        subcategoria_id: subcatId,
        competencia: anoMes,
        limite: limNum,
        user_id: user?.id,
      })

      toast.success('Limite salvo com sucesso!')
      setEditingSubcatId(null)
      await carregarDados(false)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar limite: verifique a conexão e tente novamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Ação da tela vazia: Copiar do período anterior
  const handleCopiarPeriodoAnterior = async () => {
    if (!wsId || isProcessing || !consolidado) return

    setIsProcessing(true)
    try {
      const res = await orcamentoService.copiarLimitesPeriodoAnterior({
        workspace_id: wsId,
        competencia_origem: consolidado.competencia_anterior,
        competencia_destino: anoMes,
        user_id: user?.id,
      })

      if (res?.copiados === 0) {
        toast.info(
          `Nenhum limite foi encontrado no período anterior (${formatAnoMesPT(
            consolidado.competencia_anterior,
          )}). A tela foi aberta para definição do zero.`,
        )
        setModoPreenchimentoZero(true)
      } else {
        toast.success(`${res.copiados} limites copiados do período anterior com sucesso!`)
      }
      await carregarDados(false)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao copiar limites do mês anterior: tente definir do zero.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Ação da tela vazia: Definir limite do zero
  const handleDefinirDoZero = () => {
    setModoPreenchimentoZero(true)
  }

  // Abrir modal de lançamentos do período anterior (Card 7.7)
  const abrirLancamentosPeriodoAnterior = async (
    categoriaId: string,
    categoriaNome: string,
    subcategoriaId?: string,
    subcategoriaNome?: string,
    totalGastoRef = 0,
  ) => {
    if (!wsId) return

    setModalLancamentosTitulo(subcategoriaNome ? subcategoriaNome : categoriaNome)
    setModalLancamentosSubtitulo(
      subcategoriaNome ? `Categoria: ${categoriaNome}` : 'Todos os lançamentos da categoria',
    )
    setModalLancamentosTotal(totalGastoRef)
    setModalLancamentosLista([])
    setModalLancamentosOpen(true)
    setModalLancamentosLoading(true)

    try {
      const res = await orcamentoService.listarLancamentosPeriodoAnterior({
        workspace_id: wsId,
        competencia: anoMes,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId || null,
      })

      setModalLancamentosLista(res.lancamentos || [])
      setModalLancamentosTotal(Number(res.total || 0))
    } catch (err: any) {
      console.error('Erro ao listar lançamentos do período anterior:', err)
      toast.error('Erro ao carregar lançamentos do período anterior.')
    } finally {
      setModalLancamentosLoading(false)
    }
  }

  // Iniciar edição de subcategoria (Requisito 9.11: recorrentes pré-preenchem o limite quando limite for 0)
  const iniciarEdicao = (sub: any) => {
    setEditingSubcatId(sub.id)
    if (sub.limite_definido > 0) {
      setEditValorInput(sub.limite_definido.toFixed(2).replace('.', ','))
    } else if (sub.valor_recorrente_periodo && sub.valor_recorrente_periodo > 0) {
      // Requisito 9.11: trazer preenchido em "R$yy" o referido valor quando houver lançamento recorrente para aquela subcategoria
      setEditValorInput(sub.valor_recorrente_periodo.toFixed(2).replace('.', ','))
    } else {
      setEditValorInput('')
    }
  }

  // Categorias filtradas pela busca de texto (Card 6), seleção de categoria (Card 5)
  // e novos filtros: "Por classificação" e "Por natureza" (Requisito 9.9)
  const categoriasExibicao = useMemo(() => {
    if (!consolidado?.categorias) return []

    let list = consolidado.categorias

    // Filtro do Card 5 (ao selecionar categoria via clique em item de subcategoria)
    if (categoriaSelecionadaId) {
      list = list.filter((c) => c.id === categoriaSelecionadaId)
    }

    // Filtro por classificação e por natureza (Requisito 9.9)
    if (filtroClassificacao !== 'todas' || filtroNatureza !== 'todas') {
      list = list
        .map((cat) => {
          const subsFiltradas = (cat.subcategorias || []).filter((sub: any) => {
            const matchClass =
              filtroClassificacao === 'todas' ||
              (sub.classificacao &&
                sub.classificacao.toLowerCase() === filtroClassificacao.toLowerCase())
            const matchNat =
              filtroNatureza === 'todas' ||
              (sub.natureza && sub.natureza.toLowerCase() === filtroNatureza.toLowerCase())
            return matchClass && matchNat
          })

          if (subsFiltradas.length > 0) {
            return {
              ...cat,
              subcategorias: subsFiltradas,
            }
          }
          return null
        })
        .filter(Boolean) as OrcamentoCategoriaItem[]
    }

    // Filtro do Card 6 (lupa de texto)
    if (buscaTexto.trim()) {
      const termo = buscaTexto.toLowerCase().trim()
      list = list
        .map((cat) => {
          const matchCat = cat.nome.toLowerCase().includes(termo)
          const subMatch = (cat.subcategorias || []).filter((sub) =>
            sub.nome.toLowerCase().includes(termo),
          )

          if (matchCat) {
            // Se o nome da categoria casou, mantém ela inteira
            return cat
          } else if (subMatch.length > 0) {
            // Se apenas subcategorias casaram, exibe a categoria com as subcategorias filtradas
            return {
              ...cat,
              subcategorias: subMatch,
            }
          }
          return null
        })
        .filter(Boolean) as OrcamentoCategoriaItem[]
    }

    return list
  }, [consolidado, categoriaSelecionadaId, buscaTexto, filtroClassificacao, filtroNatureza])

  // Verificação de tela vazia:
  // Se não tem limites definidos e o usuário NÃO clicou em "Definir limite de gastos"
  const ehTelaVazia =
    consolidado &&
    !consolidado.tem_limites &&
    !modoPreenchimentoZero &&
    consolidado.despesas_limite === 0

  // Cálculo da barra de consumo global (Card 3 e 4)
  const totalEfetivadoGeral = consolidado?.despesas_efetivado || 0
  const totalLimiteGeral = consolidado?.despesas_limite || 0
  const pctGeral =
    totalLimiteGeral > 0 ? Math.round((totalEfetivadoGeral / totalLimiteGeral) * 100) : 0
  const barraCorGeral = getBarraConsumoClass(pctGeral)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      {/* CARD 1 — TÍTULO: "Orçamento Familiar Mensal" */}
      <div className="py-0.5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
            Orçamento Familiar Mensal
          </h1>
        </div>
        {isProcessing && (
          <div className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-pulse font-medium">
            Gravando no banco...
          </div>
        )}
      </div>

      {/* CARD 2 — REGIME E COMPETÊNCIA (MESMA LINHA) */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* À esquerda: "Regime de Competência Integral" */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Regime de</span>
          <span className="text-xs font-bold text-slate-800">Competência Integral</span>
        </div>

        {/* À direita: Navegação entre os meses pelas laterais < Outubro de 2026 > */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarMes(-1)}
            disabled={isProcessing}
            className="h-8 w-8 text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <span className="px-3 py-1 text-xs sm:text-sm font-bold text-slate-800 min-w-[140px] text-center select-none">
            {formatAnoMesPT(anoMes)}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarMes(1)}
            disabled={isProcessing}
            className="h-8 w-8 text-slate-700 hover:bg-slate-100 rounded-lg"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* CARD META DE POUPANÇA (Posicionado exatamente entre o card Regime/Período e o card Despesas) */}
      <CardMetaPoupanca
        dados={metaPoupancaDados}
        loading={loadingMeta}
        onSalvarMeta={handleSalvarMetaPoupanca}
        onRecarregar={carregarDados}
      />

      {/* CASO: TELA SEM LIMITES DEFINIDOS (Competência vazia) */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200/80 text-center text-xs text-slate-400">
          Carregando informações do orçamento...
        </div>
      ) : ehTelaVazia ? (
        <div className="bg-white rounded-2xl p-8 sm:p-14 border border-slate-200/80 shadow-xs text-center space-y-6">
          {/* Skeleton visual conforme print do OrganiZe no PDF */}
          <div className="max-w-md mx-auto space-y-3 opacity-30 select-none pointer-events-none">
            <div className="h-3 bg-slate-200 rounded w-3/4 mx-auto" />
            <div className="h-3 bg-slate-100 rounded w-1/2 mx-auto" />
            <div className="h-3 bg-slate-100 rounded w-2/3 mx-auto" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-800">
              Nenhum limite de gastos no período
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Defina um limite ou copie os do mês anterior
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            {/* Opção 1: Definir limite de gastos do zero */}
            <Button
              type="button"
              onClick={handleDefinirDoZero}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Definir limite de gastos
            </Button>

            {/* Opção 2: Copiar os últimos definidos / período anterior */}
            <Button
              type="button"
              variant="outline"
              onClick={handleCopiarPeriodoAnterior}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-2.5 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs sm:text-sm rounded-xl shadow-2xs"
            >
              <Copy className="w-4 h-4 mr-1.5 text-slate-500" />
              Copiar os últimos definidos
            </Button>
          </div>

          {consolidado?.tem_limites_anterior && (
            <p className="text-[11px] text-slate-400">
              💡 Existem limites configurados em {formatAnoMesPT(consolidado.competencia_anterior)}.
              Você pode copiá-los e editá-los normalmente.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* CARD 3 & CARD 4 — DESPESAS (RESUMO) + BARRA DE CONSUMO GERAL */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col items-center justify-center text-center space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Despesas
              </span>
              <div className="text-base sm:text-lg font-bold text-slate-900">
                <span>{formatMoneyBRL(totalEfetivadoGeral)}</span>
                <span className="text-slate-400 font-normal"> de </span>
                <span>{formatMoneyBRL(totalLimiteGeral)}</span>
              </div>
            </div>

            {/* CARD 4: Barra de consumo geral */}
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${barraCorGeral}`}
                style={{ width: `${Math.min(100, pctGeral)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 px-0.5">
              <span>0%</span>
              <span className="font-semibold text-slate-600">{pctGeral}% consumido</span>
              <span>100%</span>
            </div>
          </div>

          {/* LINHA DOS FILTROS: CARD 5 (Filtro de subcategorias) + CARD 6 (Lupa de texto) + Requisito 9.9 (Por classificação e por natureza) */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* CARD 5 — Filtro de subcategorias */}
              <div className="relative" ref={filtroSubcatContainerRef}>
                <div className="relative">
                  <Input
                    type="text"
                    value={filtroSubcatInput}
                    onChange={(e) => {
                      setFiltroSubcatInput(e.target.value)
                      setFiltroSubcatOpen(true)
                    }}
                    onFocus={() => setFiltroSubcatOpen(true)}
                    placeholder="Filtrar por subcategoria..."
                    className="text-xs h-9 pl-3 pr-8 bg-slate-50 border-slate-200 focus:border-slate-400"
                  />
                  {categoriaSelecionadaId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoriaSelecionadaId(null)
                        setFiltroSubcatInput('')
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      title="Limpar filtro de categoria"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>

                {categoriaSelecionadaId && (
                  <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <span>
                      Filtrando categoria:{' '}
                      <strong>
                        {consolidado?.categorias.find((c) => c.id === categoriaSelecionadaId)?.nome}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCategoriaSelecionadaId(null)}
                      className="text-emerald-700 hover:text-emerald-950 font-bold ml-2"
                    >
                      Exibir todas
                    </button>
                  </div>
                )}

                {filtroSubcatOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 divide-y divide-slate-100">
                    {subcategoriasSugeridas.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Nenhuma subcategoria encontrada
                      </div>
                    ) : (
                      subcategoriasSugeridas.map((item) => {
                        const itemPct =
                          item.limite_definido > 0
                            ? Math.round((item.valor_efetivado / item.limite_definido) * 100)
                            : 0
                        const itemBarraCor = getBarraConsumoClass(itemPct)

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setCategoriaSelecionadaId(item.categoriaId)
                              setFiltroSubcatInput(item.categoriaNome)
                              setFiltroSubcatOpen(false)
                            }}
                            className="w-full text-left p-2.5 hover:bg-slate-50 transition flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] text-slate-400 uppercase font-medium truncate">
                                {item.categoriaNome}
                              </div>
                              <div className="text-xs font-semibold text-slate-800 truncate">
                                {item.nome}
                              </div>
                            </div>

                            <div className="shrink-0 text-right space-y-1 w-24">
                              <div className="text-[10px] font-medium text-slate-600 truncate">
                                {formatMoneyBRL(item.valor_efetivado)} /{' '}
                                {formatMoneyBRL(item.limite_definido)}
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${itemBarraCor}`}
                                  style={{
                                    width: `${Math.min(100, itemPct)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* CARD 6 — Lupa de texto */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="text"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  placeholder="Pesquisar categoria ou subcategoria..."
                  className="text-xs h-9 pl-8 pr-8 bg-slate-50 border-slate-200 focus:border-slate-400"
                />
                {buscaTexto && (
                  <button
                    type="button"
                    onClick={() => setBuscaTexto('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="Limpar pesquisa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Requisito 9.9: Novos Filtros de Despesas (Por Classificação e Por Natureza) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Filtro Por Classificação */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">Classificação:</span>
                  <select
                    value={filtroClassificacao}
                    onChange={(e) => setFiltroClassificacao(e.target.value)}
                    className="h-7 text-[11px] rounded-lg border border-slate-200 bg-white px-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="todas">Todas as Classificações</option>
                    <option value="Essencial">Essencial</option>
                    <option value="Ajustável">Ajustável</option>
                    <option value="Discricionária">Discricionária</option>
                    <option value="Supérflua">Supérflua</option>
                  </select>
                </div>

                {/* Filtro Por Natureza */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">Natureza:</span>
                  <select
                    value={filtroNatureza}
                    onChange={(e) => setFiltroNatureza(e.target.value)}
                    className="h-7 text-[11px] rounded-lg border border-slate-200 bg-white px-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="todas">Todas as Naturezas</option>
                    <option value="Consumo">Consumo</option>
                    <option value="Patrimonial">Patrimonial</option>
                  </select>
                </div>
              </div>

              {(filtroClassificacao !== 'todas' || filtroNatureza !== 'todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroClassificacao('todas')
                    setFiltroNatureza('todas')
                  }}
                  className="text-[11px] text-emerald-700 hover:underline font-semibold"
                >
                  Limpar filtros analíticos
                </button>
              )}
            </div>
          </div>

          {/* CARD 7 — LISTAGEM (O CORAÇÃO DA TELA) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {categoriasExibicao.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-1">
                <p>Nenhuma categoria ou subcategoria encontrada para os filtros aplicados.</p>
                {(buscaTexto || categoriaSelecionadaId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setBuscaTexto('')
                      setCategoriaSelecionadaId(null)
                      setFiltroSubcatInput('')
                    }}
                    className="text-emerald-700 hover:underline font-semibold text-xs mt-2"
                  >
                    Limpar todos os filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {categoriasExibicao.map((cat) => {
                  const catPct =
                    cat.limite_definido > 0
                      ? Math.round((cat.valor_efetivado / cat.limite_definido) * 100)
                      : 0
                  const catBarraCor = getBarraConsumoClass(catPct)

                  return (
                    <div
                      key={cat.id}
                      className="p-3 sm:p-4 space-y-2 hover:bg-slate-50/50 transition"
                    >
                      {/* LINHA DA CATEGORIA:
                          - Coluna 1: Símbolo/ícone neutro
                          - Coluna 2: Nome da categoria
                          - Coluna 4: "{Valor Efetivado} de {Limite Definido}" alinhado à margem direita
                          - Coluna 6: Gasto efetivado período anterior
                          - Coluna 7: 3 pontinhos
                          - Barra de consumo (Card 4) embaixo da categoria
                      */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* 1. Símbolo/ícone da categoria */}
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 shadow-2xs"
                            style={{ backgroundColor: cat.cor || '#64748B' }}
                          >
                            <Target className="w-3.5 h-3.5" />
                          </div>

                          {/* 2. Nome da categoria */}
                          <div className="min-w-0">
                            <h2 className="text-sm font-bold text-slate-900 truncate break-words">
                              {cat.nome}
                            </h2>
                            <span className="text-[10px] text-slate-400 block font-normal">
                              {cat.subcategorias.length}{' '}
                              {cat.subcategorias.length === 1 ? 'subcategoria' : 'subcategorias'}
                            </span>
                          </div>
                        </div>

                        {/* Direita da Categoria: Gasto anterior + {Valor Efetivado} de {Limite Definido} + 3 pontinhos */}
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                          {/* Coluna 6: Gasto período anterior na Categoria */}
                          <div className="text-right hidden sm:block">
                            <span className="text-[10px] text-slate-400 block font-normal">
                              Gasto mês anterior
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              {formatMoneyBRL(cat.gasto_periodo_anterior)}
                            </span>
                          </div>

                          {/* Coluna 4: "{Valor Efetivado} de {Limite Definido}" alinhada à margem direita */}
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-bold text-slate-900">
                              <span>{formatMoneyBRL(cat.valor_efetivado)}</span>
                              <span className="text-slate-400 font-normal"> de </span>
                              <span>{formatMoneyBRL(cat.limite_definido)}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 block sm:hidden">
                              Ant: {formatMoneyBRL(cat.gasto_periodo_anterior)}
                            </span>
                          </div>

                          {/* Coluna 7: 3 pontinhos da Categoria */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg"
                                title="Mais opções da categoria"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="text-xs bg-white border-slate-200"
                            >
                              <DropdownMenuItem
                                onClick={() =>
                                  abrirLancamentosPeriodoAnterior(
                                    cat.id,
                                    cat.nome,
                                    undefined,
                                    undefined,
                                    cat.gasto_periodo_anterior,
                                  )
                                }
                                className="cursor-pointer font-medium"
                              >
                                Visualizar Lançamentos do período anterior
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Barra de consumo da CATEGORIA (soma das subvinculadas) */}
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${catBarraCor}`}
                          style={{ width: `${Math.min(100, catPct)}%` }}
                        />
                      </div>

                      {/* 3º Subcategorias agrupadas em ordem alfabética com pequeno recuo */}
                      <div className="pl-4 sm:pl-7 pt-2 space-y-3 border-l-2 border-slate-100 ml-3.5 sm:ml-4">
                        {cat.subcategorias.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic py-1">
                            Nenhuma subcategoria cadastrada para esta categoria.
                          </div>
                        ) : (
                          cat.subcategorias.map((sub) => {
                            const subPct =
                              sub.limite_definido > 0
                                ? Math.round((sub.valor_efetivado / sub.limite_definido) * 100)
                                : 0
                            const subBarraCor = getBarraConsumoClass(subPct)
                            const isEditing = editingSubcatId === sub.id

                            const temLimiteInformado = sub.limite_definido > 0

                            return (
                              <div
                                key={sub.id}
                                className={`space-y-1.5 p-1.5 rounded-lg hover:bg-slate-100/60 transition ${
                                  !temLimiteInformado ? 'opacity-60 text-slate-400' : 'opacity-100'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  {/* Requisito 9.12: Subcategorias sem limite de gasto informado mantêm contraste por volta de 50%, tom cinza, e voltam ao contraste normal de 100% ao preencher um valor */}
                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={`text-xs font-semibold break-words ${
                                        temLimiteInformado ? 'text-slate-800' : 'text-slate-500'
                                      }`}
                                    >
                                      {sub.nome}
                                    </span>
                                  </div>

                                  {/* Coluna 6 (Subcategoria): Gasto período anterior */}
                                  <div className="text-right hidden sm:block shrink-0 pr-2">
                                    <span className="text-[11px] text-slate-500 font-medium">
                                      {formatMoneyBRL(sub.gasto_periodo_anterior)}
                                    </span>
                                  </div>

                                  {/* Coluna 4 (Subcategoria): "{Valor Efetivado} de {Limite Definido}"
                                      recuado a uma distância da margem direita para não confundir com a categoria
                                      Requisito 9.11: Na coluna imediatamente antes de "+", onde tem "R$ xx de R$yy",
                                      trazer preenchido em "R$yy" o referido valor quando houver lançamento recorrente para aquela subcategoria
                                      no período selecionado, independente se efetivado ou não. */}
                                  <div className="text-right shrink-0 pr-1">
                                    <div
                                      className={`text-xs ${
                                        temLimiteInformado ? 'text-slate-700' : 'text-slate-500'
                                      }`}
                                    >
                                      <span className="font-semibold">
                                        {formatMoneyBRL(sub.valor_efetivado)}
                                      </span>
                                      <span className="text-slate-400"> de </span>
                                      <span
                                        className={`font-semibold ${
                                          temLimiteInformado ? 'text-slate-900' : 'text-slate-500'
                                        }`}
                                      >
                                        {sub.limite_definido > 0
                                          ? formatMoneyBRL(sub.limite_definido)
                                          : sub.valor_recorrente_periodo &&
                                              sub.valor_recorrente_periodo > 0
                                            ? formatMoneyBRL(sub.valor_recorrente_periodo)
                                            : 'R$ 0,00'}
                                      </span>
                                    </div>
                                    <span className="text-[9px] text-slate-400 block sm:hidden">
                                      Ant: {formatMoneyBRL(sub.gasto_periodo_anterior)}
                                    </span>
                                  </div>

                                  {/* Coluna 5: Lápis de edição / sinal de + (APENAS na subcategoria) */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-300 shadow-sm z-10">
                                        <span className="text-[11px] text-slate-400 pl-1">R$</span>
                                        <input
                                          ref={editInputRef}
                                          type="text"
                                          value={editValorInput}
                                          onChange={(e) => setEditValorInput(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              salvarLimiteSubcategoria(sub.id, editValorInput)
                                            } else if (e.key === 'Escape') {
                                              setEditingSubcatId(null)
                                            }
                                          }}
                                          placeholder="0,00"
                                          disabled={isProcessing}
                                          className="w-20 text-xs font-bold text-slate-900 h-6 px-1 border-0 focus:outline-none focus:ring-0"
                                        />
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() =>
                                            salvarLimiteSubcategoria(sub.id, editValorInput)
                                          }
                                          disabled={isProcessing}
                                          className="h-6 w-6 text-emerald-700 hover:bg-emerald-50"
                                          title="Confirmar"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => setEditingSubcatId(null)}
                                          disabled={isProcessing}
                                          className="h-6 w-6 text-slate-400 hover:bg-slate-100"
                                          title="Cancelar"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              onClick={() => iniciarEdicao(sub)}
                                              disabled={isProcessing}
                                              className="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition"
                                            >
                                              {sub.limite_definido > 0 ? (
                                                <Pencil className="w-3.5 h-3.5" />
                                              ) : (
                                                <Plus className="w-3.5 h-3.5 font-bold text-emerald-700" />
                                              )}
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            className="text-xs bg-slate-900 text-white font-medium"
                                          >
                                            {sub.limite_definido > 0
                                              ? 'Clique para editar o valor deste limite de gastos'
                                              : 'Clique para adicionar este limite de gastos'}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}

                                    {/* Coluna 7: 3 pontinhos da Subcategoria */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-slate-400 hover:text-slate-800 rounded-lg"
                                          title="Mais opções da subcategoria"
                                        >
                                          <MoreVertical className="w-3.5 h-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="text-xs bg-white border-slate-200"
                                      >
                                        <DropdownMenuItem
                                          onClick={() =>
                                            abrirLancamentosPeriodoAnterior(
                                              cat.id,
                                              cat.nome,
                                              sub.id,
                                              sub.nome,
                                              sub.gasto_periodo_anterior,
                                            )
                                          }
                                          className="cursor-pointer font-medium"
                                        >
                                          Visualizar Lançamentos do período anterior
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                {/* Barra de consumo da SUBCATEGORIA */}
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${subBarraCor}`}
                                    style={{
                                      width: `${Math.min(100, subPct)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Card 7.7: Visualizar Lançamentos do período anterior */}
      <ModalLancamentosPeriodoAnterior
        open={modalLancamentosOpen}
        onOpenChange={setModalLancamentosOpen}
        titulo={modalLancamentosTitulo}
        subtitulo={modalLancamentosSubtitulo}
        competenciaAnterior={consolidado?.competencia_anterior || ''}
        totalGasto={modalLancamentosTotal}
        lancamentos={modalLancamentosLista}
        loading={modalLancamentosLoading}
      />
    </div>
  )
}
