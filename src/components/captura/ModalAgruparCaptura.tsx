/**
 * Modal de agrupamento de itens selecionados da revisão de NFC-e (BLOCO 15):
 * vira UM candidato com descrição e soma informadas pelo usuário. Exclusivo:
 * ou o grupo existe, ou os itens individuais — nunca ambos.
 */
import { useEffect, useState } from 'react'
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
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import { formatMoneyBRL } from '@/lib/formatters'

interface Props {
  aberto: boolean
  onFechar: () => void
  onConfirmar: (descricao: string, valor: number) => void
  quantidadeItens: number
  somaSelecionados: number
}

export function ModalAgruparCaptura({
  aberto,
  onFechar,
  onConfirmar,
  quantidadeItens,
  somaSelecionados,
}: Props) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState<number>(0)

  useEffect(() => {
    if (aberto) {
      setDescricao('')
      setValor(Number(somaSelecionados.toFixed(2)))
    }
  }, [aberto, somaSelecionados])

  const confirmar = () => {
    if (!descricao.trim()) return
    if (!(valor > 0)) return
    onConfirmar(descricao.trim(), Number(valor.toFixed(2)))
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Agrupar itens selecionados</DialogTitle>
          <DialogDescription>
            {quantidadeItens} item(ns) viram UM único candidato para importação. Os itens
            individuais saem da seleção (exclusivo: ou agrupado, ou individuais).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Soma atual dos selecionados</Label>
            <p className="text-lg font-bold text-slate-900">{formatMoneyBRL(somaSelecionados)}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Descrição do grupo (obrigatória)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Compras do mercado"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Valor do grupo (editável)</Label>
            <ValorCalculadoraInput
              value={String(valor).replace('.', ',')}
              onChange={(v) => setValor(Number(String(v).replace(',', '.')) || 0)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} className="h-9">
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={!descricao.trim() || !(valor > 0)}
            className="h-9 bg-indigo-600 hover:bg-indigo-700"
          >
            Agrupar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
