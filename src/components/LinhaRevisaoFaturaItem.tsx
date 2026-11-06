import React, { useState } from 'react'
import { FaturaImportacaoLinhaRegistro } from '@/services/faturaImportacaoService'
import { Categoria, Subcategoria } from '@/types/sap'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoneyBRL } from '@/lib/formatters'
import {
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Layers,
} from 'lucide-react'

export interface LinhaRevisaoFaturaItemProps {
  linha: FaturaImportacaoLinhaRegistro
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  aoAlterar: (linhaId: string, dados: Partial<FaturaImportacaoLinhaRegistro>) => void
  aoAlternarSelecao: (linhaId: string, selecionado: boolean) => void
}

export const LinhaRevisaoFaturaItem: React.FC<LinhaRevisaoFaturaItemProps> = ({
  linha,
  categorias,
  subcategorias,
  aoAlterar,
  aoAlternarSelecao,
}) => {
  const [expandido, setExpandido] = useState(false)

  const subcategoriasDaCategoria = subcategorias.filter(
    (s) => s.categoria_id === linha.categoria_id,
  )

  const renderBadgeStatus = () => {
    switch (linha.status) {
      case 'preenchido_regra':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded">
            <Sparkles className="w-3 h-3" /> Preenchido por regra
          </span>
        )
      case 'conciliado':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 bg-sky-950/50 border border-sky-800/60 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" /> Conciliado
          </span>
        )
      case 'provavel_duplicado':
      case 'duplicado':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-300 bg-rose-950/50 border border-rose-800/60 px-2 py-0.5 rounded">
            <AlertCircle className="w-3 h-3" /> Provável duplicado
          </span>
        )
      case 'requer_revisao':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-950/40 border border-amber-700/60 px-2 py-0.5 rounded">
            <HelpCircle className="w-3 h-3" /> Requer revisão
          </span>
        )
      case 'pronto':
      case 'importado':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-300 bg-teal-950/50 border border-teal-800/60 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" /> Pronto
          </span>
        )
      case 'ignorado':
        return (
          <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            Ignorado
          </span>
        )
      default:
        return (
          <span className="text-[10px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            Novo
          </span>
        )
    }
  }

  return (
    <div
      className={`border rounded-lg transition-colors ${
        linha.selecionado
          ? 'bg-slate-900/90 border-slate-700/90'
          : 'bg-slate-950/50 border-slate-800/60 opacity-60'
      }`}
    >
      {/* Linha Resumida Principal */}
      <div className="p-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={linha.selecionado}
            onCheckedChange={(checked) => aoAlternarSelecao(linha.id, !!checked)}
            className="data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600 border-slate-600"
          />

          <span className="font-mono text-slate-400 min-w-[70px]">
            {linha.data.split('-').reverse().slice(0, 2).join('/')}
          </span>

          <div className="flex flex-col">
            <span className="font-medium text-slate-200">
              {linha.descricao_editavel || linha.descricao_normalizada}
            </span>
            <span className="text-[10px] text-slate-400 line-clamp-1">
              {linha.descricao_original}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Parcela */}
          {linha.total_parcelas && linha.total_parcelas > 1 ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-teal-400 bg-teal-950/60 border border-teal-800/50 px-2 py-0.5 rounded">
              <Layers className="w-3 h-3" />
              {linha.parcela_atual}/{linha.total_parcelas}
            </span>
          ) : (
            <span className="text-slate-500 font-mono text-[11px]">-</span>
          )}

          {/* Valor */}
          <span
            className={`font-semibold font-mono text-xs min-w-[85px] text-right ${
              linha.tipo_linha === 'credito' ? 'text-emerald-400' : 'text-slate-100'
            }`}
          >
            {linha.tipo_linha === 'credito' ? '-' : ''}
            {formatMoneyBRL(linha.valor)}
          </span>

          {/* Status Badge */}
          <div className="hidden sm:block min-w-[120px]">{renderBadgeStatus()}</div>

          {/* Botão Expandir */}
          <button
            type="button"
            onClick={() => setExpandido(!expandido)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            title="Ver detalhes da linha"
          >
            {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Painel Expandido com Detalhes Editáveis */}
      {expandido && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 rounded-b-lg space-y-4 text-xs">
          {/* Seção 1: Dados Básicos e Reconstrução */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-slate-400 text-[11px]">Data Original / Compra</Label>
              <Input
                type="date"
                value={linha.data}
                onChange={(e) => aoAlterar(linha.id, { data: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-slate-400 text-[11px]">Descrição Editável</Label>
              <Input
                value={linha.descricao_editavel}
                onChange={(e) => aoAlterar(linha.id, { descricao_editavel: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-slate-400 text-[11px]">Valor da Parcela (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={linha.valor}
                onChange={(e) =>
                  aoAlterar(linha.id, {
                    valor: parseFloat(e.target.value) || 0,
                    valor_proprio: parseFloat(e.target.value) || 0,
                  })
                }
                className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Seção Reconstrução de Parcelada Antiga (BLOCO G 11-13) */}
          {linha.tipo_linha === 'parcelado' && (
            <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-semibold text-[11px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Reconstrução do Lançamento Pai
                </span>
                <span className="text-[10px] text-amber-300 font-medium">
                  Confirme antes de importar
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-slate-400 text-[10px]">Parcela Atual</Label>
                  <Input
                    type="number"
                    value={linha.parcela_atual || 1}
                    onChange={(e) =>
                      aoAlterar(linha.id, { parcela_atual: parseInt(e.target.value, 10) || 1 })
                    }
                    className="bg-slate-800 border-slate-700 text-slate-200 h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-[10px]">Total Parcelas</Label>
                  <Input
                    type="number"
                    value={linha.total_parcelas || 1}
                    onChange={(e) => {
                      const total = parseInt(e.target.value, 10) || 1
                      const estimado = Math.round(linha.valor * total * 100) / 100
                      aoAlterar(linha.id, {
                        total_parcelas: total,
                        valor_total_estimado: estimado,
                      })
                    }}
                    className="bg-slate-800 border-slate-700 text-slate-200 h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-[10px]">Valor Total Pai (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={linha.valor_total_estimado || linha.valor}
                    onChange={(e) =>
                      aoAlterar(linha.id, {
                        valor_total_estimado: parseFloat(e.target.value) || linha.valor,
                      })
                    }
                    className="bg-slate-800 border-slate-700 text-slate-200 h-7 text-xs font-mono font-semibold text-teal-300"
                  />
                </div>
                <div className="flex items-center pt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`hist-${linha.id}`}
                      checked={linha.marcar_historicas_anteriores}
                      onCheckedChange={(checked) =>
                        aoAlterar(linha.id, { marcar_historicas_anteriores: !!checked })
                      }
                      className="data-[state=checked]:bg-teal-600 border-slate-600"
                    />
                    <Label
                      htmlFor={`hist-${linha.id}`}
                      className="text-[10px] text-slate-300 cursor-pointer font-normal"
                    >
                      Marcar anteriores como históricas/pagas
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Seção 2: Categoria, Subcategoria e Modalidades de Saída */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-slate-400 text-[11px]">Categoria</Label>
              <Select
                value={linha.categoria_id || ''}
                onValueChange={(val) =>
                  aoAlterar(linha.id, {
                    categoria_id: val,
                    subcategoria_id: null,
                    status: 'pronto',
                  })
                }
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs">
                  <SelectValue placeholder="Selecione categoria..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-400 text-[11px]">Subcategoria</Label>
              <Select
                value={linha.subcategoria_id || ''}
                onValueChange={(val) => aoAlterar(linha.id, { subcategoria_id: val })}
                disabled={!linha.categoria_id}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs">
                  <SelectValue placeholder="Selecione subcategoria..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {subcategoriasDaCategoria.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-400 text-[11px]">Modalidade de Saída</Label>
              <Select
                value={linha.modalidade_saida}
                onValueChange={(val) => {
                  const valorTotal = linha.valor
                  const proprio =
                    val === 'compra_propria' ? valorTotal : linha.valor_proprio || valorTotal
                  aoAlterar(linha.id, {
                    modalidade_saida: val,
                    valor_proprio: proprio,
                    valor_terceiros: valorTotal - proprio,
                  })
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="compra_propria">Compra Própria (100%)</SelectItem>
                  <SelectItem value="compra_compartilhada">Compra Compartilhada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {linha.modalidade_saida === 'compra_compartilhada' && (
              <div className="space-y-1">
                <Label className="text-slate-400 text-[11px]">Valor Próprio (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={linha.valor_proprio || 0}
                  onChange={(e) => {
                    const proprio = parseFloat(e.target.value) || 0
                    aoAlterar(linha.id, {
                      valor_proprio: proprio,
                      valor_terceiros: Math.max(0, linha.valor - proprio),
                    })
                  }}
                  className="bg-slate-800 border-slate-700 text-slate-200 h-8 text-xs"
                />
              </div>
            )}
          </div>

          {/* Metadados do Cartão e Rastreabilidade */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
            <div>
              Titular do PDF: <strong className="text-slate-300">{linha.titular || 'N/D'}</strong> |
              Final do Cartão:{' '}
              <strong className="text-slate-300">{linha.final_cartao || 'N/D'}</strong>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linha.afeta_resultado}
                  onChange={(e) => aoAlterar(linha.id, { afeta_resultado: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-0"
                />
                Afeta Resultado
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linha.afeta_orcamento}
                  onChange={(e) => aoAlterar(linha.id, { afeta_orcamento: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-0"
                />
                Afeta Orçamento
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
