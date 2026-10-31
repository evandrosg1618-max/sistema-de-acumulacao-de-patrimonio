import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  TrendingUp,
  Percent,
  Check,
  Pencil,
  X,
  AlertCircle,
  HelpCircle,
  Plus,
} from 'lucide-react'
import { formatMoneyBRL } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

export interface MetaPoupancaDados {
  competencia: string
  renda_considerada: number
  salario_subcategoria_id: string | null
  salario_efetivado: number
  poupanca_minima: number
  percentual_minimo: number
  meta_poupanca: number | null
  orcamento_total_despesas: number
  capacidade_poupanca: number
  situacao: string
  status_cor: 'verde' | 'azul' | 'laranja' | 'vermelho'
  status_titulo: string
  status_mensagem: string
  status_diferenca: number
  subcategorias_selecionadas_ids: string[]
  receitas_disponiveis: Array<{
    id: string
    nome: string
    categoria_id: string
    categoria_nome: string
    icone: string | null
    cor: string | null
    is_salario: boolean
    selecionada: boolean
    total_efetivado: number
  }>
}

interface CardMetaPoupancaProps {
  dados: MetaPoupancaDados | null
  loading: boolean
  onSalvarMeta: (
    novaMeta: number | null,
    percentual: number,
    subcategoriasIds: string[],
  ) => Promise<void>
  onRecarregar: () => Promise<void>
}

export function CardMetaPoupanca({
  dados,
  loading,
  onSalvarMeta,
  onRecarregar,
}: CardMetaPoupancaProps) {
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [inputMeta, setInputMeta] = useState('')
  const [editandoPerc, setEditandoPerc] = useState(false)
  const [inputPerc, setInputPerc] = useState('10')
  const [subcatsSelecionadas, setSubcatsSelecionadas] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  // Sincroniza com dados recebidos do backend
  useEffect(() => {
    if (dados) {
      if (dados.meta_poupanca !== null && dados.meta_poupanca !== undefined) {
        setInputMeta(dados.meta_poupanca.toFixed(2).replace('.', ','))
      } else {
        setInputMeta('')
      }
      setInputPerc(String(dados.percentual_minimo || 10))
      setSubcatsSelecionadas(dados.subcategorias_selecionadas_ids || [])
    }
  }, [dados])

  if (loading && !dados) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/4 mb-4" />
        <div className="h-8 bg-slate-100 rounded w-1/2 mb-6" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-12 bg-slate-100 rounded" />
          <div className="h-12 bg-slate-100 rounded" />
          <div className="h-12 bg-slate-100 rounded" />
        </div>
      </div>
    )
  }

  if (!dados) return null

  // Paleta de cores para o status (sempre texto + cor)
  // verde = positivo, azul = neutro/meta, laranja = ajuste necessário, vermelho = orçamento superior à renda
  const getEstiloStatus = (cor: string) => {
    switch (cor) {
      case 'vermelho':
        return {
          container: 'bg-rose-50 border-rose-200 text-rose-900',
          titulo: 'text-rose-700',
          badge: 'bg-rose-600 text-white',
        }
      case 'laranja':
        return {
          container: 'bg-amber-50 border-amber-200 text-amber-900',
          titulo: 'text-amber-700',
          badge: 'bg-amber-500 text-white',
        }
      case 'azul':
        return {
          container: 'bg-blue-50 border-blue-200 text-blue-900',
          titulo: 'text-blue-700',
          badge: 'bg-blue-600 text-white',
        }
      case 'verde':
      default:
        return {
          container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          titulo: 'text-emerald-700',
          badge: 'bg-emerald-600 text-white',
        }
    }
  }

  const estilo = getEstiloStatus(dados.status_cor)

  // Alternar seleção de receita
  const toggleReceita = async (subcatId: string) => {
    let novas: string[]
    if (subcatsSelecionadas.includes(subcatId)) {
      novas = subcatsSelecionadas.filter((id) => id !== subcatId)
    } else {
      novas = [...subcatsSelecionadas, subcatId]
    }
    setSubcatsSelecionadas(novas)
    try {
      setSalvando(true)
      await onSalvarMeta(dados.meta_poupanca, dados.percentual_minimo, novas)
    } finally {
      setSalvando(false)
    }
  }

  // Remover subcategoria diretamente no chip [Salário ×]
  const removerReceita = async (subcatId: string) => {
    const novas = subcatsSelecionadas.filter((id) => id !== subcatId)
    setSubcatsSelecionadas(novas)
    try {
      setSalvando(true)
      await onSalvarMeta(dados.meta_poupanca, dados.percentual_minimo, novas)
    } finally {
      setSalvando(false)
    }
  }

  // Salvar percentual da Poupança Mínima
  const handleSalvarPercentual = async () => {
    const p = parseFloat(inputPerc.replace(',', '.'))
    if (isNaN(p) || p < 0 || p > 100) {
      toast.error('Informe um percentual válido entre 0 e 100%.')
      return
    }
    try {
      setSalvando(true)
      await onSalvarMeta(dados.meta_poupanca, p, subcatsSelecionadas)
      setEditandoPerc(false)
    } finally {
      setSalvando(false)
    }
  }

  // Salvar valor da Meta de Poupança
  const handleSalvarMeta = async () => {
    if (!inputMeta.trim()) {
      // Deixar sem meta
      try {
        setSalvando(true)
        await onSalvarMeta(null, dados.percentual_minimo, subcatsSelecionadas)
        setEditandoMeta(false)
      } finally {
        setSalvando(false)
      }
      return
    }

    const m = parseFloat(inputMeta.replace(/\./g, '').replace(',', '.'))
    if (isNaN(m) || m < 0) {
      toast.error('Informe um valor de meta válido (não negativo).')
      return
    }
    try {
      setSalvando(true)
      await onSalvarMeta(m, dados.percentual_minimo, subcatsSelecionadas)
      setEditandoMeta(false)
    } finally {
      setSalvando(false)
    }
  }

  // Subcategorias atualmente selecionadas detalhadas
  const selecionadasDetalhe = dados.receitas_disponiveis.filter((r) =>
    subcatsSelecionadas.includes(r.id),
  )

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
      {/* 9.8 Estrutura visual: Cabeçalho do Card */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold tracking-tight text-slate-800 uppercase">
              Meta de Poupança
            </h2>
            <p className="text-[11px] text-slate-500">
              Capacidade e meta familiar para {dados.competencia}
            </p>
          </div>
        </div>

        {salvando && (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md animate-pulse">
            Atualizando...
          </span>
        )}
      </div>

      {/* Renda Considerada */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Renda Considerada
          </span>
          <span className="text-[11px] text-slate-400">
            Apenas receitas selecionadas e efetivadas
          </span>
        </div>

        <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {formatMoneyBRL(dados.renda_considerada)}
        </div>

        {/* Chips de subcategorias de receita selecionadas + Seletor de Receitas (Requisito 9.1) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {selecionadasDetalhe.length === 0 ? (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
              Nenhuma receita selecionada. Adicione Salário ou outras fontes.
            </span>
          ) : (
            selecionadasDetalhe.map((sub) => (
              <Badge
                key={sub.id}
                variant="secondary"
                className="bg-slate-100 text-slate-800 hover:bg-slate-200 font-medium text-xs py-1 px-2.5 rounded-lg flex items-center gap-1 border border-slate-200"
              >
                <span>{sub.nome}</span>
                {sub.total_efetivado > 0 && (
                  <span className="text-[10px] text-emerald-700 font-semibold ml-0.5">
                    ({formatMoneyBRL(sub.total_efetivado)})
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removerReceita(sub.id)}
                  className="hover:text-rose-600 transition ml-0.5"
                  title={`Remover ${sub.nome}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))
          )}

          {/* Dropdown com seleção múltipla das subcategorias de Receita */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-medium rounded-lg border-dashed border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              >
                <Plus className="w-3 h-3 mr-1 text-emerald-600" />
                Selecionar receitas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto bg-white">
              <DropdownMenuLabel className="text-xs text-slate-600">
                Fontes de Receita Efetivadas
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dados.receitas_disponiveis.length === 0 ? (
                <div className="p-2 text-xs text-slate-400 text-center">
                  Nenhuma subcategoria de receita cadastrada.
                </div>
              ) : (
                dados.receitas_disponiveis.map((rec) => {
                  const isChecked = subcatsSelecionadas.includes(rec.id)
                  return (
                    <DropdownMenuCheckboxItem
                      key={rec.id}
                      checked={isChecked}
                      onCheckedChange={() => toggleReceita(rec.id)}
                      className="text-xs cursor-pointer flex items-center justify-between"
                    >
                      <span className="truncate pr-2">{rec.nome}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {rec.total_efetivado > 0 ? formatMoneyBRL(rec.total_efetivado) : 'R$ 0,00'}
                      </span>
                    </DropdownMenuCheckboxItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Grid de 3 colunas: Poupança Mínima | Meta de Poupança | Capacidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {/* Coluna 1: Poupança Mínima (Requisito 9.2) */}
        <div className="bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Poupança Mínima ({dados.percentual_minimo}%)
            </span>
            {editandoPerc ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={inputPerc}
                  onChange={(e) => setInputPerc(e.target.value)}
                  className="w-12 h-6 text-xs text-center border border-slate-300 rounded font-bold"
                  placeholder="10"
                />
                <button
                  type="button"
                  onClick={handleSalvarPercentual}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditandoPerc(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditandoPerc(true)}
                className="text-slate-400 hover:text-slate-700"
                title="Alterar percentual"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="text-lg font-bold text-slate-800">
            {formatMoneyBRL(dados.poupanca_minima)}
          </div>

          <p className="text-[10px] text-slate-400">
            {dados.salario_efetivado > 0
              ? `${dados.percentual_minimo}% do salário efetivado (${formatMoneyBRL(dados.salario_efetivado)})`
              : 'Sem salário efetivado no período'}
          </p>
        </div>

        {/* Coluna 2: Meta de Poupança (Requisito 9.3) */}
        <div className="bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Meta de Poupança</span>
            {editandoMeta ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={inputMeta}
                  onChange={(e) => setInputMeta(e.target.value)}
                  className="w-20 h-6 text-xs text-right pr-1 border border-slate-300 rounded font-bold"
                  placeholder="0,00"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSalvarMeta}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditandoMeta(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditandoMeta(true)}
                className="text-slate-400 hover:text-slate-700"
                title="Editar meta"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="text-lg font-bold text-slate-800">
            {dados.meta_poupanca !== null && dados.meta_poupanca !== undefined ? (
              formatMoneyBRL(dados.meta_poupanca)
            ) : (
              <span className="text-xs font-semibold text-slate-400 italic">Não definida</span>
            )}
          </div>

          <p className="text-[10px] text-slate-400">Meta mensal da família</p>
        </div>

        {/* Coluna 3: Capacidade de Poupança (Requisito 9.4) */}
        <div className="bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Capacidade de Poupança</span>
          </div>

          <div
            className={`text-lg font-bold ${
              dados.capacidade_poupanca < 0 ? 'text-rose-600' : 'text-slate-800'
            }`}
          >
            {formatMoneyBRL(dados.capacidade_poupanca)}
          </div>

          <p className="text-[10px] text-slate-400">
            Renda ({formatMoneyBRL(dados.renda_considerada)}) − Orçado (
            {formatMoneyBRL(dados.orcamento_total_despesas)})
          </p>
        </div>
      </div>

      {/* 9.5 & 9.6: Mensagem/Status Correspondente (Sempre texto + cor) */}
      <div className={`p-3.5 rounded-xl border ${estilo.container} space-y-1`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${estilo.titulo}`}>{dados.status_titulo}</span>
        </div>
        <p className="text-xs font-medium leading-relaxed">{dados.status_mensagem}</p>
      </div>
    </div>
  )
}
