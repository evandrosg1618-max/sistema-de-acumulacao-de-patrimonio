/**
 * Linha editável de um candidato da revisão de NFC-e (BLOCO 12/13).
 * Campos = os do lançamento normal, com SeletoresClassificacaoFatura.
 */
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SeletorCategoriaFatura,
  SeletorSubcategoriaFatura,
} from '@/components/SeletoresClassificacaoFatura'
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import { MeioPagamento, Categoria, Subcategoria, ModalidadeSaida } from '@/types/sap'
import { formatMoneyBRL } from '@/lib/formatters'
import { CapturaItemRevisao } from '@/components/captura/tiposRevisao'
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

interface Props {
  item: CapturaItemRevisao
  indice: number
  atualizado: boolean
  categorias: Categoria[]
  subcategorias: Subcategoria[]
  meiosPagamento: MeioPagamento[]
  onEditar: (id: string, patch: Partial<CapturaItemRevisao>) => void
  onAlternarSelecao: (id: string) => void
  onExcluir: (id: string) => void
}

export function LinhaRevisaoCaptura({
  item,
  indice,
  atualizado,
  categorias,
  subcategorias,
  meiosPagamento,
  onEditar,
  onAlternarSelecao,
  onExcluir,
}: Props) {
  const [expandida, setExpandida] = useState(false)

  const subcategoriasDaCategoria = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === item.categoria_id),
    [subcategorias, item.categoria_id],
  )

  const rotuloStatus =
    item.status === 'erro'
      ? 'Erro'
      : item.status === 'repetido'
        ? 'Possível item repetido entre capturas'
        : item.status === 'revisar' || item.confianca === 'baixa'
          ? 'Revisar'
          : 'Pronto'

  const corStatus =
    item.status === 'erro'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : item.status === 'repetido'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : item.status === 'revisar' || item.confianca === 'baixa'
          ? 'bg-orange-50 text-orange-700 border-orange-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  return (
    <div
      className={`rounded-xl border p-3 bg-white transition-colors ${
        atualizado ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200'
      }`}
    >
      {/* Linha compacta: checkbox, descrição, valor, status */}
      <div className="flex items-start gap-2.5">
        <Checkbox
          className="mt-1"
          checked={item.selecionado}
          onCheckedChange={() => onAlternarSelecao(item.id)}
          aria-label={`Selecionar item ${indice + 1}`}
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 shrink-0">{indice + 1}.</span>
            <Input
              value={item.descricao}
              onChange={(e) => onEditar(item.id, { descricao: e.target.value })}
              className="h-8 text-sm font-medium"
              placeholder="Descrição"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-28">
              <ValorCalculadoraInput
                value={item.valor}
                onChange={(v) => onEditar(item.id, { valor: Number(v) || 0 })}
                compact
              />
            </div>
            <Badge variant="outline" className={`text-[10px] ${corStatus}`}>
              {rotuloStatus}
            </Badge>
            {item.agrupado && (
              <Badge
                variant="outline"
                className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200"
              >
                Agrupado
              </Badge>
            )}
            <button
              type="button"
              onClick={() => setExpandida((e) => !e)}
              className="text-xs text-emerald-700 font-semibold flex items-center gap-1 ml-auto"
            >
              Detalhes{' '}
              {expandida ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          {item.status === 'repetido' && !expandida && (
            <p className="text-[11px] text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Confirme se não é o mesmo item reconhecido em duas capturas sobrepostas.
            </p>
          )}
        </div>
      </div>

      {expandida && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5 pl-8">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Data
              </label>
              <Input
                type="date"
                value={item.data || ''}
                onChange={(e) => onEditar(item.id, { data: e.target.value || null })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Pago com
              </label>
              <Select
                value={item.meio_pagamento_id || ''}
                onValueChange={(v) => {
                  const m = meiosPagamento.find((x) => x.id === v)
                  onEditar(item.id, {
                    meio_pagamento_id: v,
                    meio_pagamento_tipo: m?.tipo || null,
                    meio_pagamento_nome: m?.nome || null,
                  })
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-white max-h-56">
                  {meiosPagamento
                    .filter((m) => m.ativo)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SeletorCategoriaFatura
            categorias={categorias}
            value={item.categoria_id || ''}
            onChange={(v) => onEditar(item.id, { categoria_id: v || null, subcategoria_id: null })}
            placeholder="— Nenhuma —"
          />
          <SeletorSubcategoriaFatura
            subcategorias={subcategoriasDaCategoria}
            value={item.subcategoria_id || ''}
            onChange={(v) => onEditar(item.id, { subcategoria_id: v || null })}
            placeholder="— Nenhuma —"
            disabled={!item.categoria_id}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Modalidade
              </label>
              <Select
                value={item.modalidade_saida || 'compra_propria'}
                onValueChange={(v) => onEditar(item.id, { modalidade_saida: v as ModalidadeSaida })}
              >
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="compra_propria">Compra própria</SelectItem>
                  <SelectItem value="compra_compartilhada">Compra compartilhada</SelectItem>
                  <SelectItem value="compra_terceiros">Compra a terceiros</SelectItem>
                  <SelectItem value="emprestimo_terceiros">Empréstimo a terceiros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Valor Próprio
              </label>
              <ValorCalculadoraInput
                value={item.valor_proprio ?? item.valor}
                onChange={(v) => onEditar(item.id, { valor_proprio: Number(v) || 0 })}
                compact
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Valor de Terceiros
              </label>
              <ValorCalculadoraInput
                value={item.valor_terceiros ?? 0}
                onChange={(v) => onEditar(item.id, { valor_terceiros: Number(v) || 0 })}
                compact
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Afeta Resultado
              </label>
              <Select
                value={item.afeta_resultado ? 'true' : 'false'}
                onValueChange={(v) => onEditar(item.id, { afeta_resultado: v === 'true' })}
              >
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              Afeta Orçamento
            </label>
            <Select
              value={item.afeta_orcamento ? 'true' : 'false'}
              onValueChange={(v) => onEditar(item.id, { afeta_orcamento: v === 'true' })}
            >
              <SelectTrigger className="h-8 text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              Observação
            </label>
            <Textarea
              value={item.observacao || ''}
              onChange={(e) => onEditar(item.id, { observacao: e.target.value || null })}
              className="text-xs min-h-[52px]"
              placeholder="Observação do lançamento (opcional)"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onExcluir(item.id)}
            className="h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir item
          </Button>
        </div>
      )}

      {!expandida && item.status !== 'repetido' && (
        <p className="text-[11px] text-slate-400 mt-1.5 pl-8">
          {item.meio_pagamento_nome ? `Pago com ${item.meio_pagamento_nome} • ` : ''}
          {formatMoneyBRL(item.valor)}
        </p>
      )}
    </div>
  )
}
