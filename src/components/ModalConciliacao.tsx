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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import { formatMoneyBRL } from '@/lib/formatters'
import { Conta } from '@/types/sap'
import { Scale, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface ModalConciliacaoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contas: Conta[]
  onSalvar: (dados: {
    contaId: string
    saldoExtrato: number
    dataExtrato: string
    ajustarSaldo: boolean
    observacao?: string
  }) => Promise<void>
}

export function ModalConciliacao({ open, onOpenChange, contas, onSalvar }: ModalConciliacaoProps) {
  const [contaId, setContaId] = useState(contas.length > 0 ? contas[0].id : '')
  const [saldoExtrato, setSaldoExtrato] = useState('')
  const [dataExtrato, setDataExtrato] = useState(() => new Date().toISOString().split('T')[0])
  const [ajustarSaldo, setAjustarSaldo] = useState(true)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const contaSelecionada = contas.find((c) => c.id === contaId) || contas[0]
  const saldoSistema = contaSelecionada ? Number(contaSelecionada.saldo_atual || 0) : 0
  const valorExtratoNum = parseFloat(saldoExtrato.replace(/\./g, '').replace(',', '.')) || 0
  const divergencia = valorExtratoNum - saldoSistema

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contaId) {
      toast.error('Selecione uma conta para conciliar')
      return
    }

    setSalvando(true)
    try {
      await onSalvar({
        contaId,
        saldoExtrato: valorExtratoNum,
        dataExtrato,
        ajustarSaldo,
        observacao: observacao.trim() || undefined,
      })
      onOpenChange(false)
      setSaldoExtrato('')
      setObservacao('')
    } catch (err: any) {
      toast.error('Erro na conciliação: ' + (err.message || 'tente novamente'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-600" />
              <span>Conciliação Bancária de Conta</span>
            </DialogTitle>
            <DialogDescription>
              Compare o saldo no SAP com o extrato do seu banco e ajuste eventuais divergências com
              auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Conta Bancária</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Selecione a conta" />
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
                <Label className="text-xs font-semibold text-slate-700">Data do Extrato *</Label>
                <Input
                  type="date"
                  value={dataExtrato}
                  onChange={(e) => setDataExtrato(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Saldo no Extrato (R$) *
                </Label>
                <div className="mt-1">
                  <ValorCalculadoraInput
                    value={saldoExtrato}
                    onChange={setSaldoExtrato}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Painel comparativo */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Saldo no Sistema SAP:</span>
                <span className="font-bold text-slate-800">{formatMoneyBRL(saldoSistema)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Saldo Informado (Extrato):</span>
                <span className="font-bold text-slate-900">{formatMoneyBRL(valorExtratoNum)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Divergência apurada:</span>
                <span
                  className={`font-extrabold ${
                    Math.abs(divergencia) < 0.01
                      ? 'text-emerald-600'
                      : divergencia > 0
                        ? 'text-emerald-700'
                        : 'text-rose-600'
                  }`}
                >
                  {Math.abs(divergencia) < 0.01
                    ? 'R$ 0,00 (Conciliado)'
                    : `${divergencia > 0 ? '+' : ''}${formatMoneyBRL(divergencia)}`}
                </span>
              </div>
            </div>

            {/* Switch de Ajuste Automático */}
            {Math.abs(divergencia) > 0.009 && (
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="space-y-0.5 pr-2">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Lançar ajuste automático</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Gera um lançamento de <strong>{divergencia > 0 ? 'Receita' : 'Despesa'}</strong>{' '}
                    auditado para igualar o saldo da conta ao extrato.
                  </p>
                </div>
                <Switch checked={ajustarSaldo} onCheckedChange={setAjustarSaldo} />
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold text-slate-700">Observações</Label>
              <Input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Conciliação mensal fechada com extrato bancário"
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {salvando ? 'Processando...' : 'Confirmar Conciliação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
