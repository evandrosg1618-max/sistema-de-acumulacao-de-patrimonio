import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { AlertCircle, Trash2, Edit3, HelpCircle } from 'lucide-react'

export type EscopoSerie = 'este' | 'este_e_proximos' | 'todos'

interface ModalEscolhaEscopoSerieProps {
  open: boolean
  acao: 'editar' | 'excluir'
  lancamento: any
  onConfirmar: (escopo: EscopoSerie) => void
  onCancelar: () => void
  loading?: boolean
}

export function ModalEscolhaEscopoSerie({
  open,
  acao,
  lancamento,
  onConfirmar,
  onCancelar,
  loading = false,
}: ModalEscolhaEscopoSerieProps) {
  const [escopo, setEscopo] = useState<EscopoSerie>('este')

  if (!lancamento) return null

  const numParcela = lancamento.numero_parcela || 1
  const totalParcelas = lancamento.total_parcelas || lancamento.quantidade_parcelas || 1
  const ehEdicao = acao === 'editar'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancelar()}>
      <DialogContent className="sm:max-w-md bg-white text-slate-900 border-slate-200">
        <DialogHeader>
          <div className="flex items-center gap-2 text-slate-800">
            {ehEdicao ? (
              <Edit3 className="w-5 h-5 text-indigo-600" />
            ) : (
              <Trash2 className="w-5 h-5 text-rose-600" />
            )}
            <DialogTitle className="text-base font-bold">
              {ehEdicao ? 'Alterar lançamento parcelado' : 'Excluir lançamento parcelado'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500 pt-1">
            Este lançamento faz parte de uma compra parcelada (parcela{' '}
            <strong>
              {numParcela}/{totalParcelas}
            </strong>
            : &quot;{lancamento.descricao}&quot;). Como deseja aplicar esta{' '}
            {ehEdicao ? 'alteração' : 'exclusão'}?
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4">
          <RadioGroup
            value={escopo}
            onValueChange={(val) => setEscopo(val as EscopoSerie)}
            className="space-y-2.5"
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <RadioGroupItem value="este" id="escopo-este" className="mt-0.5" />
              <div className="space-y-0.5 cursor-pointer">
                <Label
                  htmlFor="escopo-este"
                  className="font-semibold text-xs text-slate-800 cursor-pointer"
                >
                  {ehEdicao ? 'Alterar apenas este' : 'Excluir apenas este'}
                </Label>
                <p className="text-[11px] text-slate-500">
                  Aplica a ação exclusivamente à parcela atual ({numParcela}/{totalParcelas}). As
                  demais permanecem inalteradas.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <RadioGroupItem value="este_e_proximos" id="escopo-proximos" className="mt-0.5" />
              <div className="space-y-0.5 cursor-pointer">
                <Label
                  htmlFor="escopo-proximos"
                  className="font-semibold text-xs text-slate-800 cursor-pointer"
                >
                  {ehEdicao ? 'Alterar este e os próximos' : 'Excluir este e os próximos'}
                </Label>
                <p className="text-[11px] text-slate-500">
                  Aplica da parcela {numParcela} até a {totalParcelas}. As parcelas anteriores não
                  são afetadas.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <RadioGroupItem value="todos" id="escopo-todos" className="mt-0.5" />
              <div className="space-y-0.5 cursor-pointer">
                <Label
                  htmlFor="escopo-todos"
                  className="font-semibold text-xs text-slate-800 cursor-pointer"
                >
                  {ehEdicao ? 'Alterar todos' : 'Excluir todos'}
                </Label>
                <p className="text-[11px] text-slate-500">
                  Aplica a todas as {totalParcelas} parcelas da série de uma única vez.
                </p>
              </div>
            </div>
          </RadioGroup>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-[11px]">Recálculo de Faturas</p>
              <p className="text-[11px] text-amber-800">
                Se alguma das parcelas pertencer a uma fatura já paga, a operação será bloqueada até
                que o pagamento da referida fatura seja desfeito na tela de Cartões.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancelar}
            disabled={loading}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onConfirmar(escopo)}
            disabled={loading}
            className={`text-xs text-white ${
              ehEdicao ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {loading ? 'Processando...' : 'Confirmar e Recalcular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
