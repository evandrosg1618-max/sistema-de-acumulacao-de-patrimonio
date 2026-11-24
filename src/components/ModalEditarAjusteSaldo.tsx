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
import { toast } from 'sonner'
import { formatMoneyBRL } from '@/lib/formatters'
import { valorDeTextoMonetarioBR } from '@/lib/monetario'
import { supabase } from '@/lib/supabase/client'
import type { Lancamento } from '@/types/sap'

export interface ModalEditarAjusteSaldoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lançamento tipo 'ajuste' com subtipo_ajuste 'ajuste_saldo_conta' */
  lancamento: Lancamento | null
  workspaceId?: string
  userId?: string
  /** Recarrega saldos + listas da página (após salvar) */
  onSalvo: () => Promise<void> | void
}

/**
 * C2 (PDF itens 12/13) — edição de Ajuste de Saldo Bancário pela Lista de
 * Lançamentos usando o fluxo da NOVA regra: chama editar_ajuste_saldo_rpc,
 * que SUBSTITUI o efeito do ajuste (não soma) preservando movimentações
 * posteriores. NÃO abre o modal genérico de edição. Sucesso do toast SÓ
 * após confirmação real da RPC (nunca otimista — PDF item 6.d).
 */
export const ModalEditarAjusteSaldo: React.FC<ModalEditarAjusteSaldoProps> = ({
  open,
  onOpenChange,
  lancamento,
  workspaceId,
  userId,
  onSalvo,
}) => {
  const [saldoReal, setSaldoReal] = useState('')
  const [data, setData] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Última configuração vence: preenche a cada abertura
  useEffect(() => {
    if (open && lancamento) {
      setSaldoReal('')
      setData(lancamento.data || '')
      setObs(lancamento.observacao || '')
    }
  }, [open, lancamento])

  const handleSalvar = async () => {
    if (!workspaceId || !lancamento) return
    if (salvando) return // proteção duplo clique (item 19 do PDF)
    const novoSaldoReal = saldoReal.trim() ? valorDeTextoMonetarioBR(saldoReal) : null
    if (novoSaldoReal === null) {
      toast.error('Informe o novo saldo real (extrato).')
      return
    }
    setSalvando(true)
    try {
      const { data: res, error } = await supabase.rpc('editar_ajuste_saldo_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: lancamento.id,
        p_novo_saldo_real: novoSaldoReal,
        p_data: data || lancamento.data,
        p_observacao: obs.trim() || undefined,
        p_user_id: userId || undefined,
      })
      if (error) throw error
      const r: any = res
      if (r?.sucesso === false) {
        throw new Error(String(r.mensagem || 'Falha ao editar o ajuste de saldo.'))
      }
      if (r?.sem_ajuste) {
        toast.info(r?.mensagem || 'Nenhum ajuste é necessário com o saldo informado.')
      } else {
        const delta = Number(r?.ajuste || 0)
        toast.success(
          `Ajuste corrigido para ${delta >= 0 ? '+' : '-'}${formatMoneyBRL(Math.abs(delta))}` +
            (r?.saldo_novo !== null && r?.saldo_novo !== undefined
              ? ` — novo saldo: ${formatMoneyBRL(Number(r.saldo_novo))}`
              : ''),
        )
      }
      onOpenChange(false)
      await onSalvo()
    } catch (e: any) {
      console.error('Erro ao editar ajuste de saldo (lista):', e)
      toast.error(e?.message || 'Erro ao editar o ajuste de saldo.')
    } finally {
      setSalvando(false)
    }
  }

  const valorAtual = lancamento ? Number(lancamento.valor || 0) : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => salvando && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-base">Editar ajuste de saldo</DialogTitle>
          <DialogDescription>
            A edição <span className="font-semibold">substitui</span> o efeito deste ajuste (não
            soma) e preserva todas as demais movimentações da conta.
          </DialogDescription>
        </DialogHeader>

        {lancamento && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
              <p>
                <span className="font-semibold">Ajuste atual:</span>{' '}
                <span className={valorAtual < 0 ? 'text-rose-600' : 'text-blue-600'}>
                  {valorAtual >= 0 ? '+' : '-'}
                  {formatMoneyBRL(Math.abs(valorAtual))}
                </span>
              </p>
              <p>
                <span className="font-semibold">Conta:</span> {lancamento.conta_origem?.nome || '—'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="las-saldo" className="text-xs font-semibold text-slate-600">
                  Novo saldo real (extrato) *
                </Label>
                <Input
                  id="las-saldo"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={saldoReal}
                  onChange={(e) => setSaldoReal(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="las-data" className="text-xs font-semibold text-slate-600">
                  Data
                </Label>
                <Input
                  id="las-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="las-obs" className="text-xs font-semibold text-slate-600">
                Observação (opcional)
              </Label>
              <Input
                id="las-obs"
                placeholder="Ex.: rendimento, tarifa não lançada…"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                maxLength={300}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || !saldoReal.trim()}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {salvando ? 'Salvando edição…' : 'Salvar edição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ModalEditarAjusteSaldo as default }
