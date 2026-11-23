import React, { useCallback, useEffect, useState } from 'react'
import { Scale, CheckCircle2, Eye, Undo2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { formatMoneyBRL } from '@/lib/formatters'
import { valorDeTextoMonetarioBR } from '@/lib/monetario'
import { supabase } from '@/lib/supabase/client'
import type { Conta } from '@/types/sap'

export interface RegistroConciliacao {
  id: string
  conta_id: string
  data_extrato: string
  saldo_sistema: number | null
  saldo_extrato: number | null
  divergencia: number | null
  ajustado: boolean
  lancamento_ajuste_id: string | null
  observacao: string | null
  created_at: string
  /** true quando a linha veio de um lançamento 'ajuste_saldo_conta' sem conciliação */
  origemLancamento?: boolean
}

export interface CentralAjustesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contas: Conta[]
  /** Filtro Origem ativo na página: conta pré-selecionada na Central */
  contaInicialId?: string
  workspaceId?: string
  userId?: string
  /** Recarrega saldos + lançamentos da página (após ajuste/estorno) */
  onDadosAlterados: () => Promise<void> | void
  /** Válvula de escape: fecha a Central e abre o Novo Lançamento na conta */
  onAbrirNovoLancamentoNaConta: (contaId: string) => void
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

export const CentralAjustesModal: React.FC<CentralAjustesModalProps> = ({
  open,
  onOpenChange,
  contas,
  contaInicialId,
  workspaceId,
  userId,
  onDadosAlterados,
  onAbrirNovoLancamentoNaConta,
}) => {
  const [contaId, setContaId] = useState('')
  const [saldoExtrato, setSaldoExtrato] = useState('')
  const [dataAjuste, setDataAjuste] = useState(hojeISO())
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [estornandoId, setEstornandoId] = useState<string | null>(null)
  const [confirmarEstornoId, setConfirmarEstornoId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<RegistroConciliacao | null>(null)
  const [limiteHistorico, setLimiteHistorico] = useState(10)

  /** Saldos SAP lidos direto do banco (sobrevivem ao ajuste sem recarregar a página) */
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [historico, setHistorico] = useState<RegistroConciliacao[]>([])

  const carregarSaldos = useCallback(async () => {
    if (!workspaceId) return
    try {
      const { data, error } = await supabase
        .from('contas')
        .select('id, saldo_atual')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
      if (error) throw error
      const mapa: Record<string, number> = {}
      ;(data || []).forEach((c: any) => {
        mapa[c.id] = Number(c.saldo_atual || 0)
      })
      setSaldos(mapa)
    } catch (e: any) {
      console.warn('Central de Ajustes: falha ao carregar saldos das contas:', e?.message)
    }
  }, [workspaceId])

  const carregarHistorico = useCallback(async () => {
    if (!workspaceId || !contaId) {
      setHistorico([])
      return
    }
    try {
      const { data, error } = await supabase
        .from('conciliacoes_conta')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('conta_id', contaId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error

      // Linhas da fonte secundária: lançamentos 'ajuste_saldo_conta' da conta que
      // NÃO têm conciliação (ex.: criados por caminho antigo) — não duplicar por id.
      const idsVinculados = new Set((data || []).map((c: any) => c.lancamento_ajuste_id))
      const { data: lancs, error: errLancs } = await supabase
        .from('lancamentos')
        .select(
          'id, data, valor, status_pagamento, observacao, created_at, conta_origem_id, subtipo_ajuste, tipo, deleted_at',
        )
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'ajuste')
        .eq('subtipo_ajuste', 'ajuste_saldo_conta')
        .eq('conta_origem_id', contaId)
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .limit(100)
      if (errLancs) throw errLancs

      const extras: RegistroConciliacao[] = (lancs || [])
        .filter((l: any) => !idsVinculados.has(l.id))
        .map((l: any) => ({
          id: l.id,
          conta_id: l.conta_origem_id,
          data_extrato: l.data,
          saldo_sistema: null,
          saldo_extrato: null,
          divergencia: null,
          ajustado: l.status_pagamento === 'pago',
          lancamento_ajuste_id: l.id,
          observacao: l.observacao || null,
          created_at: l.created_at || '',
          origemLancamento: true,
        }))

      setHistorico([...(data || []), ...extras])
    } catch (e: any) {
      console.warn('Central de Ajustes: falha ao carregar histórico:', e?.message)
      setHistorico([])
    }
  }, [workspaceId, contaId])

  // Reset a cada abertura (pré-seleção do filtro Origem; form e confirmações limpos)
  useEffect(() => {
    if (!open) return
    setDataAjuste(hojeISO())
    setObservacao('')
    setSaldoExtrato('')
    setConfirmarEstornoId(null)
    setDetalhe(null)
    setLimiteHistorico(10)
    setContaId(
      contaInicialId && contas.some((c) => c.id === contaInicialId)
        ? contaInicialId
        : contas.length > 0
          ? contas[0].id
          : '',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && workspaceId) {
      void carregarSaldos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId])

  useEffect(() => {
    if (open && workspaceId && contaId) {
      void carregarHistorico()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, contaId])

  const conta = contas.find((c) => c.id === contaId) || null
  const saldoSap =
    contaId && saldos[contaId] !== undefined ? saldos[contaId] : (conta?.saldo_atual ?? 0)
  const saldoExtratoNum = saldoExtrato.trim() ? valorDeTextoMonetarioBR(saldoExtrato) : null
  const divergencia =
    saldoExtratoNum === null ? null : Math.round((saldoExtratoNum - saldoSap) * 100) / 100

  const handleAjustar = async () => {
    if (!workspaceId || !contaId) return
    if (saldoExtratoNum === null) {
      toast.error('Informe o saldo real (extrato).')
      return
    }
    setSalvando(true)
    try {
      const { data, error } = await supabase.rpc('registrar_ajuste_saldo_rpc', {
        p_workspace_id: workspaceId,
        p_conta_id: contaId,
        p_saldo_real: saldoExtratoNum,
        p_data: dataAjuste,
        p_observacao: observacao.trim() || undefined,
        p_user_id: userId || undefined,
      })
      if (error) throw error
      const res: any = data
      if (res?.sucesso === false) {
        // Formato de retorno conferido contra o banco: { sucesso, mensagem, ... }
        throw new Error(String(res.mensagem || 'Falha ao registrar o ajuste de saldo.'))
      }
      // Formato de retorno conferido contra o banco:
      // sem_ajuste = true → nada a ajustar; duplicado = true → idempotência;
      // sucesso com 'ajuste' → ajuste registrado (delta = res.ajuste).
      if (res?.duplicado) {
        toast.info('Ajuste já registrado anteriormente — nenhum lançamento duplicado.')
      } else if (res?.sem_ajuste) {
        toast.info('Nada a ajustar — saldos já conferem')
      } else if (res?.lancamento_id) {
        const delta = Number(res?.ajuste || 0)
        toast.success(
          delta >= 0
            ? `Saldo ajustado em +${formatMoneyBRL(delta)}`
            : `Saldo ajustado em -${formatMoneyBRL(Math.abs(delta))}`,
        )
      } else {
        toast.info('Nada a ajustar — saldos já conferem')
      }

      setSaldoExtrato('')
      setObservacao('')
      await carregarSaldos()
      await carregarHistorico()
      await onDadosAlterados()
    } catch (e: any) {
      console.error('Erro ao registrar ajuste de saldo:', e)
      toast.error(e?.message || 'Erro ao registrar o ajuste de saldo.')
    } finally {
      setSalvando(false)
    }
  }

  const handleEstornar = async (registro: RegistroConciliacao) => {
    if (!workspaceId || !registro.lancamento_ajuste_id) return
    setEstornandoId(registro.id)
    try {
      const { data, error } = await supabase.rpc('estornar_ajuste_saldo_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: registro.lancamento_ajuste_id,
        p_user_id: userId || undefined,
      })
      if (error) throw error
      const res: any = data
      if (res?.sucesso === false) {
        throw new Error(String(res.mensagem || 'Falha ao estornar o ajuste de saldo.'))
      }
      toast.success('Ajuste estornado — saldo revertido')
      setConfirmarEstornoId(null)
      await carregarSaldos()
      await carregarHistorico()
      await onDadosAlterados()
    } catch (e: any) {
      console.error('Erro ao estornar ajuste de saldo:', e)
      toast.error(e?.message || 'Erro ao estornar o ajuste de saldo.')
    } finally {
      setEstornandoId(null)
    }
  }

  // T1 — só contas bancárias; cartões não chegam até aqui (a página já filtra)
  const contasBancarias = contas
  const contaDetalheNome = contas.find((c) => c.id === detalhe?.conta_id)?.nome

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-br from-violet-50 to-white">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-700">
              <Scale className="w-4 h-4" />
            </span>
            Central de Ajustes
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Concilie o saldo do SAP com o extrato real da conta bancária. Cartões não aparecem aqui
            — ajustes de fatura seguem no fluxo de cartões.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {contasBancarias.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">
              Nenhuma conta bancária cadastrada neste workspace.
            </div>
          ) : (
            <>
              {/* T1 — seletor de conta */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Conta bancária</Label>
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {contasBancarias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {conta && (
                <>
                  {/* T1 — saldos e divergência */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border bg-white p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        Saldo informado (extrato)
                      </p>
                      <p className="text-sm font-bold text-slate-700 mt-1 tabular-nums">
                        {saldoExtratoNum === null ? '—' : formatMoneyBRL(saldoExtratoNum)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-white p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        Saldo SAP
                      </p>
                      <p className="text-sm font-bold text-slate-700 mt-1 tabular-nums">
                        {formatMoneyBRL(saldoSap)}
                      </p>
                    </div>
                    <div
                      className={`rounded-xl border p-3 ${
                        divergencia === null
                          ? 'bg-white'
                          : divergencia === 0
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        Divergência
                      </p>
                      <p
                        className={`text-sm font-bold mt-1 tabular-nums ${
                          divergencia === null
                            ? 'text-slate-400'
                            : divergencia === 0
                              ? 'text-emerald-600'
                              : divergencia > 0
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                        }`}
                      >
                        {divergencia === null
                          ? '—'
                          : `${divergencia > 0 ? '+' : ''}${formatMoneyBRL(divergencia)}`}
                      </p>
                    </div>
                  </div>

                  {/* T2 — fluxo Ajustar saldo */}
                  <div className="rounded-xl border bg-slate-50/60 p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ca-saldo-extrato"
                          className="text-xs font-semibold text-slate-600"
                        >
                          Saldo real (extrato) *
                        </Label>
                        <Input
                          id="ca-saldo-extrato"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={saldoExtrato}
                          onChange={(e) => setSaldoExtrato(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ca-data" className="text-xs font-semibold text-slate-600">
                          Data
                        </Label>
                        <Input
                          id="ca-data"
                          type="date"
                          value={dataAjuste}
                          onChange={(e) => setDataAjuste(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ca-obs" className="text-xs font-semibold text-slate-600">
                        Observação (opcional)
                      </Label>
                      <Input
                        id="ca-obs"
                        placeholder="Ex.: rendimento, tarifa não lançada…"
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        maxLength={300}
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false)
                          onAbrirNovoLancamentoNaConta(contaId)
                        }}
                        className="text-xs font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900 text-left"
                      >
                        Registrar como lançamento comum
                      </button>
                      <Button
                        onClick={handleAjustar}
                        disabled={salvando || saldoExtratoNum === null}
                        className="bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        <Scale className="w-4 h-4 mr-1" />
                        {salvando ? 'Ajustando…' : 'Ajustar saldo'}
                      </Button>
                    </div>
                  </div>

                  {/* T3 — histórico da conta */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Histórico da conta
                    </p>
                    {historico.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        Nenhuma conciliação ou ajuste registrado para esta conta.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-xl border">
                        {historico.slice(0, limiteHistorico).map((reg) => {
                          const delta =
                            reg.saldo_sistema !== null && reg.saldo_extrato !== null
                              ? reg.saldo_extrato - reg.saldo_sistema
                              : null
                          const jaEstornado =
                            !reg.ajustado &&
                            !!reg.lancamento_ajuste_id &&
                            reg.saldo_sistema !== null
                          return (
                            <div key={reg.id} className="p-3 space-y-1.5 bg-white">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-700">
                                  {(reg.data_extrato || '').split('-').reverse().join('/')}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setDetalhe(reg)}
                                    className="p-1 rounded text-slate-400 hover:text-violet-700"
                                    title="Detalhes"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {reg.lancamento_ajuste_id && !jaEstornado && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmarEstornoId(reg.id)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600"
                                      title="Estornar"
                                    >
                                      <Undo2 className="w-4 h-4" />
                                      {estornandoId === reg.id ? (
                                        <span className="sr-only">Estornando…</span>
                                      ) : null}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-600">
                                <span>Sistema: {formatMoneyBRL(reg.saldo_sistema ?? 0)}</span>
                                <span>Extrato: {formatMoneyBRL(reg.saldo_extrato ?? 0)}</span>
                                <span>
                                  Diverg.:{' '}
                                  {delta === null ? (
                                    '—'
                                  ) : (
                                    <span className="font-semibold">
                                      {delta > 0 ? '+' : ''}
                                      {formatMoneyBRL(delta)}
                                    </span>
                                  )}
                                </span>
                                <span>
                                  Ajuste:{' '}
                                  {reg.ajustado ? (
                                    <span className="font-semibold text-violet-700">
                                      {delta === null ? '' : formatMoneyBRL(delta)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </span>
                              </div>
                              {reg.observacao && (
                                <p className="text-[11px] italic text-slate-400 break-words">
                                  {reg.observacao}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {historico.length > limiteHistorico && (
                      <button
                        type="button"
                        onClick={() => setLimiteHistorico((v) => v + 10)}
                        className="text-xs font-medium text-violet-700 underline underline-offset-2"
                      >
                        Mostrar mais
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Confirmação de estorno — substitui a linha de ações por confirmação clara */}
        {confirmarEstornoId && detalhe === null && (
          <div className="px-5 py-3 border-t bg-rose-50">
            {(() => {
              const reg = historico.find((r) => r.id === confirmarEstornoId)
              if (!reg) return null
              return (
                <div className="space-y-2">
                  <p className="text-xs text-slate-700">
                    <span className="font-semibold">Estornar ajuste?</span> O lançamento{' '}
                    <span className="font-medium">
                      “Ajuste do saldo da conta” de {formatMoneyBRL(reg.saldo_extrato ?? 0)}
                    </span>{' '}
                    será excluído e o saldo da conta{' '}
                    <span className="font-medium">{conta?.nome}</span> voltará para{' '}
                    <span className="font-medium">{formatMoneyBRL(reg.saldo_sistema ?? 0)}</span>.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmarEstornoId(null)}
                      disabled={estornandoId !== null}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                      onClick={() => void handleEstornar(reg)}
                      disabled={estornandoId !== null}
                    >
                      {estornandoId === reg.id ? 'Estornando…' : 'Estornar'}
                    </Button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* T3 — sheet de Detalhes */}
        <Sheet
          open={detalhe !== null}
          onOpenChange={(o) => {
            if (!o) setDetalhe(null)
          }}
        >
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="w-4 h-4 text-violet-600" />
                Detalhes da conciliação
              </SheetTitle>
            </SheetHeader>
            {detalhe && (
              <div className="px-4 pb-6 space-y-1 text-sm">
                {(() => {
                  const delta =
                    detalhe.saldo_sistema !== null && detalhe.saldo_extrato !== null
                      ? detalhe.saldo_extrato - detalhe.saldo_sistema
                      : null
                  return (
                    <>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Conta</span>
                        <span className="font-medium text-xs">{contaDetalheNome || '—'}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Data</span>
                        <span className="font-medium text-xs">
                          {(detalhe.data_extrato || '').split('-').reverse().join('/')}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Saldo sistema</span>
                        <span className="font-medium text-xs">
                          {formatMoneyBRL(detalhe.saldo_sistema ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Saldo extrato</span>
                        <span className="font-medium text-xs">
                          {formatMoneyBRL(detalhe.saldo_extrato ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Divergência</span>
                        <span className="font-medium text-xs">
                          {delta === null ? '—' : formatMoneyBRL(delta)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Ajuste aplicado</span>
                        <span className="font-medium text-xs">
                          {detalhe.ajustado
                            ? delta === null
                              ? 'Sim'
                              : formatMoneyBRL(delta)
                            : 'Não'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 text-xs">Observação</span>
                        <span className="font-medium text-xs break-words text-right">
                          {detalhe.observacao || '—'}
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </DialogContent>
    </Dialog>
  )
}

export { CentralAjustesModal as default }
