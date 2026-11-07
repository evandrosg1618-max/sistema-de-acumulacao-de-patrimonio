import React, { useState } from 'react'
import { FaturaImportacaoLinhaRegistro } from '@/services/faturaImportacaoService'
import { Categoria, Subcategoria } from '@/types/sap'
import { formatMoneyBRL } from '@/lib/formatters'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  Sparkles,
  Repeat,
  PlusCircle,
  Gift,
  Percent,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react'

export interface LinhaRevisaoFaturaItemProps {
  linha: FaturaImportacaoLinhaRegistro
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  aoAlterar: (id: string, dados: Partial<FaturaImportacaoLinhaRegistro>) => Promise<void>
  aoAlternarSelecao: (id: string, selecionado: boolean) => Promise<void>
}

// Metadados de tipo de linha
const TIPO_META: Record<
  string,
  { label: string; badgeClass: string; icon: React.ReactNode | null }
> = {
  compra: {
    label: 'Compra',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: null,
  },
  parcelado: {
    label: 'Parcelado',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: <Repeat className="w-3 h-3 mr-1" />,
  },
  credito: {
    label: 'Crédito/Estorno',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <Gift className="w-3 h-3 mr-1" />,
  },
  encargo: {
    label: 'Encargo',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: <Percent className="w-3 h-3 mr-1" />,
  },
  ajuste: {
    label: 'Ajuste',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <ShieldAlert className="w-3 h-3 mr-1" />,
  },
}

export const LinhaRevisaoFaturaItem: React.FC<LinhaRevisaoFaturaItemProps> = ({
  linha,
  categorias,
  subcategorias,
  aoAlterar,
  aoAlternarSelecao,
}) => {
  const [editandoDescricao, setEditandoDescricao] = useState(false)
  const [descricaoTemp, setDescricaoTemp] = useState(linha.descricao_editavel || '')
  const [editandoValor, setEditandoValor] = useState(false)
  const [valorTemp, setValorTemp] = useState(String(linha.valor || ''))
  const [editandoParcelado, setEditandoParcelado] = useState(false)
  const [totalParcelasTemp, setTotalParcelasTemp] = useState(
    linha.total_parcelas ? String(linha.total_parcelas) : '',
  )

  const categoriaSelecionada = categorias.find((c) => c.id === linha.categoria_id)
  const subcategoriasFiltradas = subcategorias.filter((s) => s.categoria_id === linha.categoria_id)
  const subcategoriaSelecionada = subcategoriasFiltradas.find((s) => s.id === linha.subcategoria_id)

  const classificado = !!linha.categoria_id
  const ignorado = linha.status === 'ignorado'
  const provavelDuplicado = linha.status === 'provavel_duplicado' || linha.status === 'duplicado'

  const salvarDescricao = async () => {
    if (descricaoTemp !== (linha.descricao_editavel || '')) {
      await aoAlterar(linha.id, { descricao_editavel: descricaoTemp })
    }
    setEditandoDescricao(false)
  }

  const salvarValor = async () => {
    const novoValor = parseFloat(valorTemp.replace(',', '.'))
    if (!isNaN(novoValor) && novoValor !== linha.valor) {
      await aoAlterar(linha.id, { valor: novoValor })
    }
    setEditandoValor(false)
  }

  const salvarParcelas = async (novaQtdStr: string) => {
    const qtdNum = parseInt(novaQtdStr, 10)
    if (!isNaN(qtdNum) && qtdNum > 1) {
      const parcelaAtual = linha.parcela_atual || 1
      const valorEstimado = Math.round(linha.valor * qtdNum * 100) / 100
      await aoAlterar(linha.id, {
        tipo_linha: 'parcelado',
        parcela_atual: Math.min(parcelaAtual, qtdNum),
        total_parcelas: qtdNum,
        valor_parcela: linha.valor,
        valor_total_estimado: valorEstimado,
      })
    } else if (qtdNum === 1 || novaQtdStr.trim() === '') {
      // Volta para compra à vista
      await aoAlterar(linha.id, {
        tipo_linha: 'compra',
        parcela_atual: null,
        total_parcelas: null,
        valor_parcela: null,
        valor_total_estimado: linha.valor,
      })
      setTotalParcelasTemp('')
    }
    setEditandoParcelado(false)
  }

  const handleModalidade = async (val: string) => {
    if (val === 'compra_propria') {
      await aoAlterar(linha.id, {
        modalidade_saida: 'compra_propria',
        valor_proprio: linha.valor,
        valor_terceiros: 0,
      })
    } else {
      await aoAlterar(linha.id, { modalidade_saida: val as any })
    }
  }

  const meta = TIPO_META[linha.tipo_linha] || {
    label: linha.tipo_linha,
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: null,
  }

  return (
    <div
      className={`bg-white border rounded-xl p-3.5 flex flex-col gap-2.5 transition-colors ${
        provavelDuplicado
          ? 'border-amber-300 bg-amber-50/40'
          : ignorado
            ? 'border-slate-200 bg-slate-50 opacity-70'
            : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start gap-3">
        {/* Checkbox seleção */}
        <div className="flex items-center pt-1 shrink-0">
          <Checkbox
            checked={linha.selecionado}
            onCheckedChange={(checked) => aoAlternarSelecao(linha.id, !!checked)}
            disabled={ignorado}
            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 border-slate-300"
          />
        </div>

        {/* Descrição / Estabelecimento */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {editandoDescricao ? (
              <input
                autoFocus
                value={descricaoTemp}
                onChange={(e) => setDescricaoTemp(e.target.value)}
                onBlur={salvarDescricao}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvarDescricao()
                  if (e.key === 'Escape') {
                    setDescricaoTemp(linha.descricao_editavel || '')
                    setEditandoDescricao(false)
                  }
                }}
                className="text-sm font-semibold text-slate-900 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditandoDescricao(true)}
                className="text-sm font-semibold text-slate-900 text-left hover:text-emerald-700 hover:underline underline-offset-2"
                title="Clique para editar a descrição"
              >
                {linha.descricao_editavel || linha.descricao_original}
              </button>
            )}

            <Badge
              variant="outline"
              className={`text-[10px] font-medium border ${meta.badgeClass}`}
            >
              {meta.icon}
              {meta.label}
            </Badge>

            {linha.modalidade_saida === 'compra_propria' && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Própria 100%
              </Badge>
            )}
            {linha.modalidade_saida === 'compra_compartilhada' && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-blue-200 bg-blue-50 text-blue-700"
              >
                Compartilhada
              </Badge>
            )}
            {provavelDuplicado && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-amber-300 bg-amber-100 text-amber-800"
              >
                <AlertTriangle className="w-3 h-3 mr-1" /> Possível duplicado
              </Badge>
            )}
            {linha.status === 'conciliado' && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Conciliado
              </Badge>
            )}
            {linha.status === 'preenchido_regra' && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-purple-200 bg-purple-50 text-purple-700"
              >
                <Sparkles className="w-3 h-3 mr-1" /> Regra aplicada
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <span>
              {linha.data?.split('-').reverse().join('/')} •{' '}
              {linha.final_cartao ? `•••• ${linha.final_cartao}` : ''}
              {linha.titular && linha.titular.trim() ? ` • ${linha.titular}` : ''}
            </span>

            {/* Opção (Repetir parcelado) pré-preenchida com a quantidade de parcelas da fatura, editável */}
            {editandoParcelado ? (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 rounded px-1.5 py-0.5 text-[11px]">
                <span>Repetir parcelado:</span>
                <input
                  type="number"
                  min="1"
                  max="120"
                  autoFocus
                  placeholder="ex: 10"
                  value={totalParcelasTemp}
                  onChange={(e) => setTotalParcelasTemp(e.target.value)}
                  onBlur={() => salvarParcelas(totalParcelasTemp)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarParcelas(totalParcelasTemp)
                    if (e.key === 'Escape') {
                      setTotalParcelasTemp(linha.total_parcelas ? String(linha.total_parcelas) : '')
                      setEditandoParcelado(false)
                    }
                  }}
                  className="w-12 border border-slate-300 rounded px-1 text-center bg-white text-slate-900 font-semibold"
                />
                <span>x</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTotalParcelasTemp(linha.total_parcelas ? String(linha.total_parcelas) : '')
                  setEditandoParcelado(true)
                }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                  linha.total_parcelas && linha.total_parcelas > 1
                    ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
                title="Clique para editar a repetição parcelada"
              >
                {linha.total_parcelas && linha.total_parcelas > 1 ? (
                  <span>
                    (Repetir parcelado: {linha.parcela_atual || 1}/{linha.total_parcelas}x)
                  </span>
                ) : (
                  <span>+ (Repetir parcelado)</span>
                )}
              </button>
            )}

            {(linha.descricao_original || '') !== (linha.descricao_editavel || '') && (
              <span className="text-slate-400 italic truncate max-w-[240px]">
                original: {linha.descricao_original}
              </span>
            )}
          </div>

          {/* Aviso de conciliação/duplicidade detectada */}
          {linha.correspondencia_tipo === 'parcela' && linha.correspondencia_id && (
            <div className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-2 py-1 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> Parcela conciliada com lançamento existente no
              SAP — não será importada novamente.
            </div>
          )}
          {provavelDuplicado && (
            <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Possível lançamento já existente (linha repetida
              no PDF ou compra já registrada). Revise antes de importar.
            </div>
          )}
        </div>

        {/* Valor */}
        <div className="w-full lg:w-32 shrink-0 text-left lg:text-right">
          {editandoValor ? (
            <input
              autoFocus
              value={valorTemp}
              onChange={(e) => setValorTemp(e.target.value)}
              onBlur={salvarValor}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarValor()
                if (e.key === 'Escape') {
                  setValorTemp(String(linha.valor || ''))
                  setEditandoValor(false)
                }
              }}
              className="w-full lg:w-28 text-sm font-semibold text-slate-900 border border-slate-300 rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditandoValor(true)}
              className={`text-sm font-semibold hover:text-emerald-700 hover:underline underline-offset-2 ${
                linha.tipo_linha === 'credito' ? 'text-emerald-600' : 'text-slate-900'
              }`}
              title="Clique para editar o valor"
            >
              {formatMoneyBRL(linha.valor)}
            </button>
          )}
        </div>

        {/* Coluna de classificação */}
        <div className="w-full lg:w-[300px] shrink-0 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Select
              value={linha.categoria_id || ''}
              onValueChange={(val) => {
                // Ao trocar categoria, limpa subcategoria se não pertencer a ela
                const subsValidas = subcategorias.filter((s) => s.categoria_id === val)
                const subAindaValida = subsValidas.some((s) => s.id === linha.subcategoria_id)
                aoAlterar(linha.id, {
                  categoria_id: val,
                  subcategoria_id: subAindaValida ? linha.subcategoria_id : '',
                })
              }}
            >
              <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-7 text-[11px] flex-1">
                <SelectValue placeholder="Categoria..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-[11px]">
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={linha.subcategoria_id || ''}
              onValueChange={(val) => {
                // Reativa a subcategoria: escolher a subcategoria marca automaticamente a categoria vinculada
                const subObj = subcategorias.find((s) => s.id === val)
                if (subObj) {
                  aoAlterar(linha.id, {
                    categoria_id: subObj.categoria_id,
                    subcategoria_id: val,
                  })
                } else {
                  aoAlterar(linha.id, { subcategoria_id: val })
                }
              }}
            >
              <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-7 text-[11px] flex-1">
                <SelectValue placeholder="Subcat..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {(linha.categoria_id ? subcategoriasFiltradas : subcategorias).map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-[11px]">
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select
            value={linha.modalidade_saida || 'compra_propria'}
            onValueChange={handleModalidade}
          >
            <SelectTrigger className="bg-white border-slate-200 text-slate-900 h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 text-slate-900">
              <SelectItem value="compra_propria" className="text-[11px]">
                <span className="flex items-center gap-1">
                  <PlusCircle className="w-3 h-3" /> Compra Própria (100%)
                </span>
              </SelectItem>
              <SelectItem value="compra_compartilhada" className="text-[11px]">
                Compra Compartilhada
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rodapé para compra compartilhada: proporção próprio × terceiros */}
      {linha.modalidade_saida === 'compra_compartilhada' && !ignorado && (
        <div className="flex flex-wrap items-center gap-3 pl-8 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Divisão:</span>
          <label className="flex items-center gap-1.5">
            <span>Próprio R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={linha.valor_proprio ?? ''}
              onChange={(e) =>
                aoAlterar(linha.id, {
                  valor_proprio: parseFloat(e.target.value),
                  valor_terceiros: Math.max(0, linha.valor - (parseFloat(e.target.value) || 0)),
                })
              }
              className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-right bg-white"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>Terceiros R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={linha.valor_terceiros ?? ''}
              onChange={(e) =>
                aoAlterar(linha.id, {
                  valor_terceiros: parseFloat(e.target.value),
                  valor_proprio: Math.max(0, linha.valor - (parseFloat(e.target.value) || 0)),
                })
              }
              className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-right bg-white"
            />
          </label>
          {Math.abs((linha.valor_proprio || 0) + (linha.valor_terceiros || 0) - linha.valor) >
            0.01 && (
            <span className="text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Soma difere do total
            </span>
          )}
        </div>
      )}
    </div>
  )
}
