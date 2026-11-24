import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Eye, Pencil, Scale, Trash2 } from 'lucide-react'
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
import { formatMoneyBRL, getTodayDateString } from '@/lib/formatters'
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

export interface CentralSaldoBancarioViewProps {
  contas: Conta[]
  /** Filtro Origem ativo na página: conta pré-selecionada na view */
  contaInicialId?: string
  workspaceId?: string
  userId?: string
  /**
   * D2.1 — modo consulta (Categorias & Subcategorias): saldos, divergência,
   * histórico e Visualizar disponíveis, porém SEM registrar, SEM Editar e SEM Excluir.
   */
  modoConsulta?: boolean
  /** Recarrega saldos + lançamentos da página (após registrar/editar/excluir) */
  onDadosAlterados: () => Promise<void> | void
  /** Válvula de escape: fecha a Central e abre o Novo Lançamento na conta */
  onAbrirNovoLancamentoNaConta?: (contaId: string) => void
}

/**
 * A6 (PDF item 6.c/20) — data local Manaus (UTC−04:00). getTodayDateString usa
 * Intl.DateTimeFormat com o fuso SAP: após 20h local NÃO avança para o dia
 * seguinte (o toISOString() antigo derivava a data de UTC e avançava).
 */
const hojeISO = () => getTodayDateString('America/Porto_Velho')

const formatarDataBR = (iso: string | null | undefined) =>
  (iso || '').split('-').reverse().join('/')

/** Valor com sinal: positivo azul com +, negativo vermelho com − (PDF item 21) */
const ValorComSinal: React.FC<{ valor: number | null; className?: string }> = ({
  valor,
  className = '',
}) => {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return <>—</>
  return (
    <span
      className={`font-semibold tabular-nums ${
        valor > 0 ? 'text-blue-600' : valor < 0 ? 'text-rose-600' : 'text-slate-500'
      } ${className}`}
    >
      {valor > 0 ? '+' : valor < 0 ? '-' : ''}
      {formatMoneyBRL(Math.abs(valor))}
    </span>
  )
}

/**
 * Parte B (PDF "Central de Ajustes teste e nova regra") — view de conciliação de
 * saldo bancário da Central intermediária. NOVA REGRA DEFINITIVA:
 *  • Registrar = saldo real informado − saldo SAP ATUAL (ajustes sucessivos sem bloqueio);
 *  • SEM Estornar e SEM ciclo pago/pendente/joia — apenas Visualizar / Editar / Excluir;
 *  • Editar (editar_ajuste_saldo_rpc) SUBSTITUI o efeito do ajuste, preservando
 *    movimentações posteriores;
 *  • Excluir (excluir_ajuste_saldo_rpc) retira só o efeito daquele ajuste;
 *  • Sucesso do toast SÓ após confirmação real da RPC (nunca otimista);
 *  • Proteção contra duplo clique: botão desabilitado durante o processamento e
 *    trava transacional no backend (FOR UPDATE + idempotência).
 * RPCs consumidas (Parte A, já vivas no banco): registrar_ajuste_saldo_rpc,
 * editar_ajuste_saldo_rpc e excluir_ajuste_saldo_rpc. Sem services/RPCs paralelos.
 */
export const CentralSaldoBancarioView: React.FC<CentralSaldoBancarioViewProps> = ({
  contas,
  contaInicialId,
  workspaceId,
  userId,
  modoConsulta = false,
  onDadosAlterados,
  onAbrirNovoLancamentoNaConta,
}) => {
  const [contaId, setContaId] = useState(() =>
    contaInicialId && contas.some((c) => c.id === contaInicialId)
      ? contaInicialId
      : (contas[0]?.id ?? ''),
  )
  const [saldoExtrato, setSaldoExtrato] = useState('')
  const [dataAjuste, setDataAjuste] = useState(hojeISO())
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  // B3 — ações sobre ajustes registrados: Visualizar / Editar / Excluir
  const [detalhe, setDetalhe] = useState<RegistroConciliacao | null>(null)
  const [editandoReg, setEditandoReg] = useState<RegistroConciliacao | null>(null)
  const [editarSaldo, setEditarSaldo] = useState('')
  const [editarData, setEditarData] = useState(hojeISO())
  const [editarObs, setEditarObs] = useState('')
  const [editando, setEditando] = useState(false)
  const [confirmarExclusaoId, setConfirmarExclusaoId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const [limiteHistorico, setLimiteHistorico] = useState(10)

  // C3b — painel de edição pode nascer fora da vista (histórico longo): rolar
  // até ele automaticamente quando a edição é aberta.
  const refPainelEdicao = useRef<HTMLDivElement | null>(null)
  const refContainerRolavel = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!editandoReg) return
    const t = window.setTimeout(() => {
      refPainelEdicao.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    return () => window.clearTimeout(t)
  }, [editandoReg?.id])

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

  useEffect(() => {
    if (workspaceId) {
      void carregarSaldos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (workspaceId && contaId) {
      void carregarHistorico()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, contaId])

  const conta = contas.find((c) => c.id === contaId) || null
  const saldoSap =
    contaId && saldos[contaId] !== undefined ? saldos[contaId] : (conta?.saldo_atual ?? 0)
  const saldoExtratoNum = saldoExtrato.trim() ? valorDeTextoMonetarioBR(saldoExtrato) : null
  const divergencia =
    saldoExtratoNum === null ? null : Math.round((saldoExtratoNum - saldoSap) * 100) / 100

  /**
   * B2 — registrar pela NOVA regra: ajuste necessário = saldo real informado −
   * saldo SAP ATUAL (calculado na RPC com trava FOR UPDATE). Ajustes sucessivos
   * SEM bloqueio. Sucesso do toast só após a resposta real da RPC.
   */
  const handleAjustar = async () => {
    if (!workspaceId || !contaId) return
    if (salvando) return // proteção duplo clique (item 19 do PDF)
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
        // Falha real do backend: nada é otimista, a UI só muda em caso de sucesso
        throw new Error(String(res.mensagem || 'Falha ao registrar o ajuste de saldo.'))
      }
      // Formato de retorno conferido no banco:
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

  const abrirEdicao = (reg: RegistroConciliacao) => {
    setEditandoReg(reg)
    setEditarSaldo(reg.saldo_extrato !== null ? formatMoneyBRL(reg.saldo_extrato) : '')
    setEditarData(reg.data_extrato || hojeISO())
    setEditarObs(reg.observacao || '')
    // C3b — o painel de edição fica no RODAPÉ fixo (fora da área rolável, como a
    // confirmação de exclusão): abrir a edição fecha a confirmação para que ambos
    // não disputem o rodapé.
    setConfirmarExclusaoId(null)
  }

  const fecharEdicao = () => {
    if (editando) return
    setEditandoReg(null)
  }

  /**
   * B3 — Editar SUBSTITUI o efeito do ajuste (não soma): a RPC recalcula o novo
   * ajuste sobre o saldo-base da conciliação original e aplica o delta
   * (novo − original), preservando as movimentações posteriores.
   */
  const handleSalvarEdicao = async () => {
    if (!workspaceId || !editandoReg?.lancamento_ajuste_id) {
      // C3c — nunca falhar em silêncio: linha sem lançamento de ajuste vinculado
      // não pode ser editada pela Central
      toast.error('Este registro não possui um lançamento de ajuste vinculado para editar.')
      return
    }
    if (editando) return // proteção duplo clique (item 19 do PDF)
    const novoSaldoReal = editarSaldo.trim() ? valorDeTextoMonetarioBR(editarSaldo) : null
    if (novoSaldoReal === null) {
      toast.error('Informe o saldo real (extrato).')
      return
    }
    setEditando(true)
    try {
      const { data, error } = await supabase.rpc('editar_ajuste_saldo_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: editandoReg.lancamento_ajuste_id,
        p_novo_saldo_real: novoSaldoReal,
        p_data: editarData,
        p_observacao: editarObs.trim() || undefined,
        p_user_id: userId || undefined,
      })
      if (error) throw error
      const res: any = data
      if (res?.sucesso === false) {
        throw new Error(String(res.mensagem || 'Falha ao editar o ajuste de saldo.'))
      }
      if (res?.sem_ajuste) {
        toast.info(res?.mensagem || 'Nenhum ajuste é necessário com o saldo informado.')
      } else {
        const delta = Number(res?.ajuste || 0)
        toast.success(
          `Ajuste corrigido para ${delta >= 0 ? '+' : '-'}${formatMoneyBRL(Math.abs(delta))}` +
            (res?.saldo_novo !== null && res?.saldo_novo !== undefined
              ? ` — novo saldo: ${formatMoneyBRL(Number(res.saldo_novo))}`
              : ''),
        )
      }
      setEditandoReg(null)
      await carregarSaldos()
      await carregarHistorico()
      await onDadosAlterados()
    } catch (e: any) {
      console.error('Erro ao editar ajuste de saldo:', e)
      toast.error(e?.message || 'Erro ao editar o ajuste de saldo.')
    } finally {
      setEditando(false)
    }
  }

  /**
   * B3 — Excluir retira o efeito daquele ajuste do saldo (a RPC preserva as
   * movimentações posteriores). Sucesso do toast SÓ após confirmação da RPC
   * (PDF item 6.d: sucesso ≠ operação não realizada).
   */
  const handleExcluir = async (reg: RegistroConciliacao) => {
    if (!workspaceId || !reg.lancamento_ajuste_id) {
      // C3c — nunca falhar em silêncio: linha sem lançamento de ajuste vinculado
      // não pode ser excluída pela Central
      toast.error('Este registro não possui um lançamento de ajuste vinculado para excluir.')
      return
    }
    if (excluindoId) return // proteção duplo clique (item 19 do PDF)
    setExcluindoId(reg.id)
    try {
      const { data, error } = await supabase.rpc('excluir_ajuste_saldo_rpc', {
        p_workspace_id: workspaceId,
        p_lancamento_id: reg.lancamento_ajuste_id,
        p_user_id: userId || undefined,
      })
      if (error) throw error
      const res: any = data
      if (res?.sucesso === false) {
        throw new Error(String(res.mensagem || 'Falha ao excluir o ajuste de saldo.'))
      }
      if (res?.ja_excluido) {
        toast.info('Ajuste já havia sido excluído.')
      } else {
        toast.success(
          res?.saldo_novo !== null && res?.saldo_novo !== undefined
            ? `Ajuste excluído — novo saldo: ${formatMoneyBRL(Number(res.saldo_novo))}`
            : 'Ajuste excluído — efeito removido do saldo da conta.',
        )
      }
      setConfirmarExclusaoId(null)
      await carregarSaldos()
      await carregarHistorico()
      await onDadosAlterados()
    } catch (e: any) {
      console.error('Erro ao excluir ajuste de saldo:', e)
      toast.error(e?.message || 'Erro ao excluir o ajuste de saldo.')
    } finally {
      setExcluindoId(null)
    }
  }

  // T1 — só contas bancárias; cartões não chegam até aqui (a página já filtra)
  const contasBancarias = contas
  const contaDetalheNome = contas.find((c) => c.id === detalhe?.conta_id)?.nome

  // B3 — linha inativa (registro antigo já sem efeito no saldo, ex.: estorno
  // anterior ou exclusão): mostra como histórico inativo, só Visualizar.
  const linhaInativa = (reg: RegistroConciliacao) =>
    !reg.ajustado && !!reg.lancamento_ajuste_id && reg.saldo_sistema !== null
  // Pode Editar/Excluir: precisa ter lançamento vinculado, estar ativo e fora do modo consulta
  const podeOperar = (reg: RegistroConciliacao) =>
    !modoConsulta && !!reg.lancamento_ajuste_id && !linhaInativa(reg)

  const operacaoEmAndamento = salvando || editando || excluindoId !== null

  // Valor do ajuste (com sinal) de um registro do histórico
  const valorAjusteDe = (reg: RegistroConciliacao): number | null =>
    reg.saldo_sistema !== null && reg.saldo_extrato !== null
      ? Math.round((reg.saldo_extrato - reg.saldo_sistema) * 100) / 100
      : reg.divergencia !== null
        ? reg.divergencia
        : null

  const registroExclusao = confirmarExclusaoId
    ? (historico.find((r) => r.id === confirmarExclusaoId) ?? null)
    : null

  return (
    <>
      {/* C3a — min-h-0: dentro do DialogContent h-[85vh] flex, sem min-h-0 a área
          rolável não encolhe com histórico longo e o rodapé (confirmação de
          exclusão / painel de edição) ficava invisível */}
      <div ref={refContainerRolavel} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
        {contasBancarias.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            Nenhuma conta bancária cadastrada neste workspace.
          </div>
        ) : (
          <>
            {/* T1 — seletor de conta */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Conta bancária</Label>
              <Select value={contaId} onValueChange={setContaId} disabled={operacaoEmAndamento}>
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
                    <p className="text-sm font-bold mt-1 tabular-nums">
                      <ValorComSinal valor={divergencia} />
                    </p>
                  </div>
                </div>

                {/* B3 — painel de EDIÇÃO (substitui o painel de registro enquanto aberto) */}
                {!modoConsulta && editandoReg && (
                  <div
                    ref={refPainelEdicao}
                    className="rounded-xl border border-violet-300 bg-violet-50/60 p-4 space-y-3 scroll-mt-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-violet-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5" />
                        Editar ajuste de {formatarDataBR(editandoReg.data_extrato)}
                      </p>
                      <button
                        type="button"
                        onClick={fecharEdicao}
                        disabled={editando}
                        className="text-xs font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900 disabled:opacity-50"
                      >
                        Cancelar edição
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      A edição <span className="font-semibold">substitui</span> o efeito deste
                      ajuste (não soma) e preserva todas as demais movimentações da conta.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ca-editar-saldo"
                          className="text-xs font-semibold text-slate-600"
                        >
                          Saldo real (extrato) *
                        </Label>
                        <Input
                          id="ca-editar-saldo"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={editarSaldo}
                          onChange={(e) => setEditarSaldo(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ca-editar-data"
                          className="text-xs font-semibold text-slate-600"
                        >
                          Data
                        </Label>
                        <Input
                          id="ca-editar-data"
                          type="date"
                          value={editarData}
                          onChange={(e) => setEditarData(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ca-editar-obs"
                        className="text-xs font-semibold text-slate-600"
                      >
                        Observação (opcional)
                      </Label>
                      <Input
                        id="ca-editar-obs"
                        placeholder="Ex.: rendimento, tarifa não lançada…"
                        value={editarObs}
                        onChange={(e) => setEditarObs(e.target.value)}
                        maxLength={300}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSalvarEdicao}
                        disabled={editando || !editarSaldo.trim()}
                        className="bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {editando ? 'Salvando edição…' : 'Salvar edição'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* T2 — fluxo Ajustar saldo (oculto em modoConsulta e durante edição) */}
                {!modoConsulta && !editandoReg && (
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
                        onClick={() => onAbrirNovoLancamentoNaConta?.(contaId)}
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
                )}

                {/* T3 — histórico da conta (Visualizar / Editar / Excluir — SEM Estornar) */}
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
                        const delta = valorAjusteDe(reg)
                        const inativo = linhaInativa(reg)
                        return (
                          <div key={reg.id} className="p-3 space-y-1.5 bg-white">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700">
                                {formatarDataBR(reg.data_extrato)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDetalhe(reg)}
                                  className="p-1 rounded text-slate-400 hover:text-violet-700"
                                  title="Visualizar"
                                  aria-label="Visualizar ajuste"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {podeOperar(reg) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => abrirEdicao(reg)}
                                      disabled={operacaoEmAndamento}
                                      className="p-1 rounded text-slate-400 hover:text-violet-700 disabled:opacity-40"
                                      title="Editar"
                                      aria-label="Editar ajuste"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmarExclusaoId(reg.id)}
                                      disabled={operacaoEmAndamento}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600 disabled:opacity-40"
                                      title="Excluir"
                                      aria-label="Excluir ajuste"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-600">
                              <span>Sistema: {formatMoneyBRL(reg.saldo_sistema ?? 0)}</span>
                              <span>Extrato: {formatMoneyBRL(reg.saldo_extrato ?? 0)}</span>
                              <span>
                                Diverg.: <ValorComSinal valor={delta} />
                              </span>
                              <span>
                                Ajuste:{' '}
                                {inativo ? (
                                  '—'
                                ) : reg.ajustado ? (
                                  <ValorComSinal valor={delta} />
                                ) : (
                                  '—'
                                )}
                              </span>
                            </div>
                            {inativo && (
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                Registro inativo — sem efeito no saldo
                              </p>
                            )}
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

      {/* B3 — confirmação de exclusão (texto do item 16 do PDF); Excluir ajuste é
          desabilitado durante o processamento e o sucesso só vem após a RPC */}
      {registroExclusao && detalhe === null && editandoReg === null && (
        <div className="px-5 py-3 border-t bg-rose-50">
          <div className="space-y-2">
            <p className="text-xs text-slate-700">
              <span className="font-semibold">
                Deseja excluir este ajuste de saldo da conta &quot;{conta?.nome ?? '—'}&quot;?
              </span>
            </p>
            <p className="text-xs text-slate-600">
              O lançamento será excluído e seu efeito será removido do saldo da conta.
            </p>
            {registroExclusao.data_extrato && (
              <p className="text-[11px] text-slate-500">
                Data: {formatarDataBR(registroExclusao.data_extrato)}
              </p>
            )}
            {valorAjusteDe(registroExclusao) !== null && (
              <p className="text-[11px] text-slate-500">
                Valor do ajuste: <ValorComSinal valor={valorAjusteDe(registroExclusao)} />
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmarExclusaoId(null)}
                disabled={excluindoId !== null}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => void handleExcluir(registroExclusao)}
                disabled={excluindoId !== null}
              >
                {excluindoId === registroExclusao.id ? 'Excluindo…' : 'Excluir ajuste'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* B3 — sheet de Visualizar (item 11 do PDF): consulta pura, sem alteração */}
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
              Visualizar ajuste
            </SheetTitle>
          </SheetHeader>
          {detalhe && (
            <div className="px-4 pb-6 space-y-1 text-sm">
              {(() => {
                const delta = valorAjusteDe(detalhe)
                return (
                  <>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Conta</span>
                      <span className="font-medium text-xs">{contaDetalheNome || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Data</span>
                      <span className="font-medium text-xs">
                        {formatarDataBR(detalhe.data_extrato)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Valor do ajuste</span>
                      <span className="text-xs">
                        <ValorComSinal valor={delta} />
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">
                        Saldo real usado na conciliação
                      </span>
                      <span className="font-medium text-xs">
                        {detalhe.saldo_extrato === null
                          ? '—'
                          : formatMoneyBRL(detalhe.saldo_extrato)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Saldo SAP na conciliação</span>
                      <span className="font-medium text-xs">
                        {detalhe.saldo_sistema === null
                          ? '—'
                          : formatMoneyBRL(detalhe.saldo_sistema)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Ajuste aplicado</span>
                      <span className="font-medium text-xs">
                        {linhaInativa(detalhe) ? 'Não (inativo)' : detalhe.ajustado ? 'Sim' : 'Não'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Observação</span>
                      <span className="font-medium text-xs break-words text-right">
                        {detalhe.observacao || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 text-xs">Origem</span>
                      <span className="font-medium text-xs">
                        {detalhe.origemLancamento ? 'Lançamento' : 'Conciliação'}
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export { CentralSaldoBancarioView as default }
