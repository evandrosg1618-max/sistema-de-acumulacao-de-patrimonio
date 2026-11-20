/**
 * T3 (TESTE CAPTURA 5 v2) — Lote = Detalhes: o Lote abre a MESMA configuração
 * de lançamento do Detalhes, com descrição, data, valor, categoria e
 * subcategoria DESABILITADOS (são do conteúdo de cada item) e editáveis
 * apenas os campos comuns do lote:
 *  - "Pago com" (T1): lista de meios com ids REAIS de contas/cartoes
 *    (meiosReais da página) — id de meios_pagamento nunca sai daqui;
 *  - toggle "Pago" (conta/dinheiro) e botão "Repetir" (cartão);
 *  - "Observações".
 * O patch segue parcial: só o que o usuário marcar/preencher é aplicado.
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { PatchLoteCaptura } from '@/components/captura/tiposRevisao'
import { formatMoneyBRL } from '@/lib/formatters'

/** Meio do lote: id REAL de contas/cartoes (ou linha dinheiro), já validado. */
export interface MeioLoteCaptura {
  id: string
  nome: string
  tipo: string
  ativo: boolean
}

/** Resumo comum dos itens selecionados (campos desabilitados). */
export interface ResumoLoteCaptura {
  descricao: string | null
  data: string | null
  valor: number
  categoria: string | null
  subcategoria: string | null
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onAplicar: (patch: PatchLoteCaptura) => void
  meiosPagamento: MeioLoteCaptura[]
  /** Tipos de meio dos itens SELECIONADOS (distintos, em maiúsculas). */
  tiposMeioSelecionados?: string[]
  quantidadeItens: number
  resumo: ResumoLoteCaptura | null
}

export function ModalLoteCaptura({
  aberto,
  onFechar,
  onAplicar,
  meiosPagamento,
  tiposMeioSelecionados,
  quantidadeItens,
  resumo,
}: Props) {
  const [meioId, setMeioId] = useState('')
  const [pago, setPago] = useState(true)
  const [repetir, setRepetir] = useState(true)
  const [observacao, setObservacao] = useState('')

  // Tipo do meio escolhido define qual controle extra aparece:
  // conta/dinheiro → "Pago"; cartão (e similares) → "Repetir".
  // Sem meio escolhido, vale o tipo COMUM dos itens selecionados
  // (tipos divergentes → nenhum dos dois controles aparece).
  const meioSelecionado = meiosPagamento.find((m) => m.id === meioId)
  const tipoMeioEscolhido = String(meioSelecionado?.tipo || '').toUpperCase()
  const tiposItens = Array.from(
    new Set((tiposMeioSelecionados || []).map((t) => String(t || '').toUpperCase())),
  )
  const tipoComumItens = tiposItens.length === 1 ? tiposItens[0] : null
  const tipoEfetivo = tipoMeioEscolhido || tipoComumItens || ''
  const meioEhCartao = tipoEfetivo.includes('CARTAO') || tipoEfetivo.includes('CARTÃO')
  const meioEhContaDinheiro = tipoEfetivo === 'CONTA' || tipoEfetivo === 'DINHEIRO'

  /** Ao trocar o meio no Lote, as marcações pago/repetir voltam ao padrão. */
  const trocarMeio = (id: string) => {
    setMeioId(id)
    setPago(true)
    setRepetir(true)
  }

  const aplicar = () => {
    const patch: PatchLoteCaptura = {}
    if (meioSelecionado) {
      // T1 — o id do meio vai VALIDADO (lista meiosReais da página: ids reais
      // de contas/cartoes). Tipo/nome acompanham: a importação roteia por tipo.
      patch.meioPagamentoId = meioSelecionado.id
      patch.meioPagamentoTipo = meioSelecionado.tipo
      patch.meioPagamentoNome = meioSelecionado.nome
      if (meioEhContaDinheiro) patch.pago = pago
      if (meioEhCartao) patch.repetir = repetir
    }
    // Pago/Repetir aplicáveis também SEM reescolher o meio, quando os itens
    // selecionados já têm um tipo comum (conta/dinheiro ou cartão).
    if (!meioSelecionado) {
      if (meioEhContaDinheiro) patch.pago = pago
      if (meioEhCartao) patch.repetir = repetir
    }
    if (observacao.trim()) patch.observacao = observacao.trim()
    if (Object.keys(patch).length === 0) {
      onFechar()
      return
    }
    onAplicar(patch)
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Lote — {quantidadeItens} item(ns)</DialogTitle>
          <DialogDescription>
            Mesma configuração dos Detalhes. Descrição, data, valor, categoria e subcategoria são de
            cada item (desabilitados); o lote define o meio de pagamento e as marcações comuns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Campos de CONTEÚDO — desabilitados (vêm de cada item) */}
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">Descrição</Label>
            <Input
              value={resumo?.descricao ?? '(diverge entre itens)'}
              disabled
              className="h-9 bg-slate-50 text-slate-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Data</Label>
              <Input
                value={resumo?.data ?? '(diverge)'}
                disabled
                className="h-9 bg-slate-50 text-slate-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Valor (soma)</Label>
              <Input
                value={formatMoneyBRL(resumo?.valor ?? 0)}
                disabled
                className="h-9 bg-slate-50 text-slate-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Categoria</Label>
              <Input
                value={resumo?.categoria ?? '(diverge)'}
                disabled
                className="h-9 bg-slate-50 text-slate-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Subcategoria</Label>
              <Input
                value={resumo?.subcategoria ?? '(diverge)'}
                disabled
                className="h-9 bg-slate-50 text-slate-500"
              />
            </div>
          </div>

          {/* "Pago com" — ids REAIS de contas/cartoes (T1) */}
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">Pago com (aplicado a todos)</Label>
            <Select value={meioId} onValueChange={trocarMeio}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="bg-white">
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

          {/* "Pago": visível quando o meio (escolhido OU o comum dos itens) é
              conta ou dinheiro. */}
          {meioEhContaDinheiro && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Status</Label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-0.5">
                <Checkbox checked={pago} onCheckedChange={(v) => setPago(v === true)} />
                Pago (lançamento já quitado)
              </label>
            </div>
          )}
          {/* "Repetir": visível quando o meio é cartão. */}
          {meioEhCartao && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Repetição</Label>
              <Button
                type="button"
                variant={repetir ? 'default' : 'outline'}
                onClick={() => setRepetir((v) => !v)}
                className={`h-9 ${repetir ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
              >
                {repetir ? 'Repetir: Sim' : 'Repetir: Não'}
              </Button>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-slate-600">Observações</Label>
            <Input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação para os itens selecionados (opcional)"
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} className="h-9">
            Cancelar
          </Button>
          <Button onClick={aplicar} className="h-9 bg-indigo-600 hover:bg-indigo-700">
            Salvar no lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
