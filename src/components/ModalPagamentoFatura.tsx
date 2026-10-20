import React, { useState } from 'react'
import { useGlobalLoading } from '@/contexts/LoadingContext'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import { formatMoneyBRL } from '@/lib/formatters'
import { Conta, Fatura } from '@/types/sap'
import { CreditCard, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface ModalPagamentoFaturaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fatura: Fatura | null
  nomeCartao?: string
  contas: Conta[]
  onConfirmar: (dados: {
    faturaId: string
    contaId: string
    valor: number
    dataPagamento: string
  }) => Promise<void>
}

export function ModalPagamentoFatura({
  open,
  onOpenChange,
  fatura,
  nomeCartao = 'Cartão de Crédito',
  contas,
  onConfirmar,
}: ModalPagamentoFaturaProps) {
  const { isProcessing } = useGlobalLoading()
  const [contaId, setContaId] = useState(contas.length > 0 ? contas[0].id : '')
  const [valor, setValor] = useState(
    fatura?.valor_total ? fatura.valor_total.toFixed(2).replace('.', ',') : '',
  )
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().split('T')[0])
  const [processando, setProcessando] = useState(false)

  // Atualizar valor quando a fatura mudar
  React.useEffect(() => {
    if (fatura) {
      setValor(fatura.valor_total ? fatura.valor_total.toFixed(2).replace('.', ',') : '')
    }
  }, [fatura])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fatura) return
    if (!contaId) {
      toast.error('Selecione uma conta bancária para debitar o pagamento')
      return
    }

    const valorNum = parseFloat(valor.replace(/\./g, '').replace(',', '.'))
    if (!valorNum || valorNum <= 0) {
      toast.error('Informe um valor de pagamento válido')
      return
    }

    setProcessando(true)
    try {
      await onConfirmar({
        faturaId: fatura.id,
        contaId,
        valor: valorNum,
        dataPagamento,
      })
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Erro ao pagar fatura: ' + (err.message || ''))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              <span>Pagar Fatura de {nomeCartao}</span>
            </DialogTitle>
            <DialogDescription>
              A quitação da fatura debita a conta bancária e recompõe o limite do cartão sem
              duplicar despesas.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
              <span className="text-slate-500">Competência da fatura:</span>
              <span className="font-bold text-slate-800">{fatura?.competencia}</span>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Conta de Saída *</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Selecione a conta bancária" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} (Saldo atual: {formatMoneyBRL(c.saldo_atual)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Data do Pagamento *</Label>
                <Input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Valor a Pagar (R$) *</Label>
                <div className="mt-1">
                  <ValorCalculadoraInput
                    value={valor}
                    onChange={setValor}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={processando}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              {processando ? 'Processando...' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
