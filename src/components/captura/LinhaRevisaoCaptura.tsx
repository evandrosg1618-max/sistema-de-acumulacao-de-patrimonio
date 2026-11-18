/**
 * Linha de revisão do candidato NFC-e (SAP v0.0.106 — R4/R6).
 * Mobile-first (Samsung S20 FE / Chrome Android, 320 a 430 px).
 *
 * R4 — campo Valor alargado (flex-1, min 120px) e SEM prefixo "R$"
 * (exibirPrefixoMoeda={false}, prop opcional do ValorCalculadoraInput). A
 * linha inferior "valor • pago com" é mantida. O status "Pronto" é DERIVADO
 * dos obrigatórios do lançamento (candidatoEstaCompleto): item incompleto
 * exibe "Revisar" e fica BLOQUEADO de ser importado.
 *
 * R6 — o expandir "Detalhes" não tem mais campos inline: avisa a página via
 * onAbrirDetalhes, que abre o ModalLancamento em MODO CAPTURA (extensão
 * aditiva da 0.0.105) pré-preenchido com o candidato. A gravação volta
 * SOMENTE nos campos do candidato — nunca cria lançamento.
 */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import { candidatoEstaCompleto } from '@/components/captura/tiposRevisao'
import type { CapturaItemRevisao } from '@/components/captura/tiposRevisao'
import { AlertTriangle, ChevronDown, Trash2 } from 'lucide-react'

interface LinhaRevisaoCapturaProps {
  item: CapturaItemRevisao
  indice: number
  categorias: any[]
  meiosPagamento: any[]
  onEditar: (id: string, patch: Partial<CapturaItemRevisao>) => void
  onAlternarSelecao: (id: string) => void
  onExcluir: (id: string) => void
  onAbrirDetalhes: (item: CapturaItemRevisao) => void
}

export function LinhaRevisaoCaptura({
  item,
  indice,
  meiosPagamento,
  onEditar,
  onAlternarSelecao,
  onExcluir,
  onAbrirDetalhes,
}: LinhaRevisaoCapturaProps) {
  const completo = candidatoEstaCompleto(item)
  const importado = item.status === 'importado'
  const bloqueado = !completo && !importado

  // R4 — status derivado: Pronto = obrigatórios preenchidos; Revisar = falta
  // algo. Erro/Repetido/Importado preservam os rótulos originais.
  const rotuloStatus = importado
    ? 'Importado'
    : item.status === 'erro'
      ? 'Erro'
      : item.status === 'repetido'
        ? 'Repetido'
        : completo
          ? 'Pronto'
          : 'Revisar'
  const classeStatus = importado
    ? 'bg-slate-100 text-slate-600 border-slate-200'
    : item.status === 'erro'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : item.status === 'repetido'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : completo
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-amber-50 text-amber-800 border-amber-300'

  return (
    <div
      className={`border rounded-lg p-2.5 space-y-2 transition-colors ${
        item.atualizado
          ? 'border-indigo-300 bg-indigo-50/40'
          : bloqueado
            ? 'border-amber-300 bg-amber-50/40'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={item.selecionado}
          onCheckedChange={() => onAlternarSelecao(item.id)}
          className="mt-1"
          disabled={importado}
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400">#{indice + 1}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 ${classeStatus}`}>
              {rotuloStatus}
            </Badge>
            {item.confianca === 'baixa' && (
              <span className="text-[9px] text-amber-700 flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> confiança baixa
              </span>
            )}
          </div>
          {/* Descrição + Valor na mesma linha; valor ocupa o espaço restante */}
          <div className="flex gap-2">
            <Input
              value={item.descricao}
              onChange={(e) => onEditar(item.id, { descricao: e.target.value })}
              onBlur={(e) => onEditar(item.id, { descricao: e.target.value.trim() })}
              placeholder="Descrição"
              className="h-9 text-sm flex-1 min-w-0"
            />
            <ValorCalculadoraInput
              value={item.valor > 0 ? String(item.valor).replace('.', ',') : ''}
              onChange={(texto: string) =>
                onEditar(item.id, {
                  valor: Number(String(texto).replace(/\./g, '').replace(',', '.')) || 0,
                })
              }
              className="flex-1 min-w-[120px]"
              placeholder="Valor"
              exibirPrefixoMoeda={false}
            />
          </div>
          {/* Linha inferior mantida: valor • pago com */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">
              {item.valor > 0 ? item.valor.toFixed(2).replace('.', ',') : '—'}
            </span>
            <span>•</span>
            <span>
              Pago com:{' '}
              <span className="font-semibold text-slate-700">
                {item.meio_pagamento_nome ||
                  meiosPagamento.find((m) => m.id === item.meio_pagamento_id)?.nome ||
                  '—'}
              </span>
            </span>
            {bloqueado && (
              <span className="text-amber-700">
                — complete os obrigatórios nos Detalhes para importar
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          {/* R6 — Detalhes: abre a janela do Novo Lançamento em modo captura */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] px-2"
            disabled={importado}
            onClick={() => onAbrirDetalhes(item)}
          >
            <ChevronDown className="w-3 h-3" /> Detalhes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-rose-600"
            disabled={importado}
            onClick={() => onExcluir(item.id)}
            aria-label="Excluir item"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
