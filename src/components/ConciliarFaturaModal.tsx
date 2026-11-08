import React, { useEffect, useState } from 'react'
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
import { CheckCircle2, Scale, AlertTriangle } from 'lucide-react'
import { formatMoneyBRL, formatAnoMesPT } from '@/lib/formatters'

interface ConciliarFaturaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nomeCartao?: string
  competencia?: string
  valorSap: number
  loading?: boolean
  /** Confirma a conciliação: devolve o valor digitado do banco (ou null se invazio). */
  onCalcular: (valorBanco: number) => void
  /** Usuário optou por revisar os lançamentos (fecha o diálogo). */
  onVoltarRevisar: () => void
  /** Usuário optou por criar o Ajuste pré-preenchido (diferença ≠ 0). */
  onCriarAjuste: (diferenca: number) => void
}

export type { ConciliarFaturaModalProps }

// Estados do diálogo: entrada do valor do banco → resultado da comparação
type Etapa = 'entrada' | 'conciliada' | 'diferenca'

export function ConciliarFaturaModal({
  open,
  onOpenChange,
  nomeCartao,
  competencia,
  valorSap,
  loading = false,
  onCalcular,
  onVoltarRevisar,
  onCriarAjuste,
}: ConciliarFaturaModalProps) {
  const [valorBancoStr, setValorBancoStr] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('entrada')
  const [diferenca, setDiferenca] = useState(0)
  const [erroValor, setErroValor] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValorBancoStr('')
      setEtapa('entrada')
      setDiferenca(0)
      setErroValor(null)
    }
  }, [open])

  const arred = (n: number) => Math.round(n * 100) / 100

  const calcular = () => {
    const normalizado = valorBancoStr.trim().replace(/\./g, '').replace(',', '.')
    const valorBanco = Number(normalizado)
    if (valorBancoStr.trim() === '' || isNaN(valorBanco) || valorBanco < 0) {
      setErroValor('Informe o valor da fatura no banco (ex.: 1234,56).')
      return
    }
    setErroValor(null)
    onCalcular(valorBanco)
    const dif = arred(valorBanco - valorSap)
    setDiferenca(dif)
    setEtapa(arred(Math.abs(dif)) === 0 ? 'conciliada' : 'diferenca')
  }

  const diferencaElevada = Math.abs(diferenca) > 1.0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scale className="w-4 h-4 text-indigo-600" />
            Conciliação da Fatura
          </DialogTitle>
          <DialogDescription className="text-xs">
            Compare o valor calculado no SAP com o valor informado pela fatura do banco. A diferença
            só se resolve por correção de lançamento ou Ajuste confirmado — nunca é aplicada
            automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-slate-400 block">Cartão:</span>
              <span className="font-semibold text-slate-800">{nomeCartao || '—'}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Competência:</span>
              <span className="font-semibold text-slate-800">
                {competencia ? formatAnoMesPT(competencia) : '—'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 block">Valor atual no SAP:</span>
            <span className="font-bold text-slate-900">{formatMoneyBRL(valorSap)}</span>
          </div>

          {etapa === 'entrada' && (
            <div className="space-y-1">
              <Label htmlFor="valor-banco" className="text-xs font-semibold text-slate-700">
                Valor da fatura no banco
              </Label>
              <Input
                id="valor-banco"
                inputMode="decimal"
                placeholder="0,00"
                value={valorBancoStr}
                onChange={(e) => {
                  setValorBancoStr(e.target.value)
                  setErroValor(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    calcular()
                  }
                }}
              />
              {erroValor && <p className="text-[11px] text-rose-600">{erroValor}</p>}
            </div>
          )}

          {etapa === 'conciliada' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
              <p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Fatura conciliada ✓
              </p>
              <p className="text-xs text-emerald-800">
                Valor Banco {formatMoneyBRL(valorSap + diferenca)} • Valor SAP{' '}
                {formatMoneyBRL(valorSap)} • Diferença {formatMoneyBRL(0)}
              </p>
            </div>
          )}

          {etapa === 'diferenca' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-bold text-amber-800">Diferença encontrada</p>
              <div className="text-xs text-amber-900 space-y-0.5">
                <p>Fatura do banco: {formatMoneyBRL(valorSap + diferenca)}</p>
                <p>Fatura no SAP: {formatMoneyBRL(valorSap)}</p>
                <p className="font-bold">
                  Diferença: {diferenca > 0 ? '+' : '−'}
                  {formatMoneyBRL(Math.abs(diferenca))}
                </p>
              </div>
              {diferencaElevada && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Diferença elevada. Verifique primeiro se existe lançamento ausente ou reconhecido
                  incorretamente antes de criar um Ajuste Técnico SAP.
                </p>
              )}
              <p className="text-xs text-slate-700">
                Deseja revisar os lançamentos ou criar um Ajuste para conciliar a fatura?
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {etapa === 'entrada' && (
            <Button
              type="button"
              onClick={calcular}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
            >
              Calcular diferença
            </Button>
          )}
          {etapa === 'conciliada' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          )}
          {etapa === 'diferenca' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onVoltarRevisar}
                disabled={loading}
                className="text-xs"
              >
                Voltar e Revisar
              </Button>
              <Button
                type="button"
                onClick={() => onCriarAjuste(diferenca)}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                Criar Ajuste
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
