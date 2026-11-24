import React, { useEffect, useState } from 'react'
import { ChevronLeft, CreditCard, Info, Landmark } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { smFullDialog } from '@/lib/responsive'
import { CentralSaldoBancarioView } from '@/components/CentralSaldoBancarioView'
import type { Conta } from '@/types/sap'

export type { RegistroConciliacao } from '@/components/CentralSaldoBancarioView'

export interface CentralAjustesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contas: Conta[]
  /** Filtro Origem ativo na página: conta pré-selecionada na view de saldo */
  contaInicialId?: string
  workspaceId?: string
  userId?: string
  /**
   * T5c — modo consulta (Categorias & Subcategorias): a Central abre direto no
   * card "Ajuste de Saldo Bancário", somente leitura (sem registrar/estornar).
   */
  modoConsulta?: boolean
  /** Recarrega saldos + lançamentos da página (após ajuste/estorno) */
  onDadosAlterados: () => Promise<void> | void
  /** Válvula de escape: fecha a Central e abre o Novo Lançamento na conta */
  onAbrirNovoLancamentoNaConta?: (contaId: string) => void
  /**
   * C4 — card "Ajuste de Fatura": abre a FUNCIONALIDADE de Ajuste de Fatura
   * (Novo Lançamento tipo 'ajuste'), não um filtro. Cada host injeta a própria
   * navegação; o evento 'sap:abrir-ajustes-fatura' é só fallback quando a prop
   * não é passada (comportamento antigo, sem hash na URL).
   */
  onAbrirAjustesFatura?: () => void
}

type Tela = 'inicio' | 'saldo'

/**
 * D2.1-FINAL (T4) — Central de Ajustes vira tela INTERMEDIÁRIA com 2 cards:
 *  • "Ajuste de Fatura" → navega para a tela atual de ajustes de fatura
 *    (LancamentosPage com filtro de lançamentos do tipo ajuste), regras e
 *    subtipos intocados — a lógica não é duplicada aqui.
 *  • "Ajuste de Saldo Bancário" → view de conciliação de saldo (a antiga
 *    Central), com saldos, divergência, histórico e estorno como está hoje.
 */
export const CentralAjustesModal: React.FC<CentralAjustesModalProps> = ({
  open,
  onOpenChange,
  contas,
  contaInicialId,
  workspaceId,
  userId,
  modoConsulta = false,
  onDadosAlterados,
  onAbrirNovoLancamentoNaConta,
  onAbrirAjustesFatura,
}) => {
  const [tela, setTela] = useState<Tela>('inicio')

  // Ao abrir: modoConsulta pula o início e vai direto ao Saldo Bancário (só leitura)
  useEffect(() => {
    if (open) setTela(modoConsulta ? 'saldo' : 'inicio')
    if (!open) setTela('inicio')
  }, [open, modoConsulta])

  const fechar = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-md h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden',
          // Parte A (0.0.160) — smartphone: Central quase tela cheia (header fixo,
          // corpo rolável, rodapé acessível). Desktop: idêntico ao comportamento atual.
          smFullDialog,
        )}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
            {tela === 'saldo' && (
              <button
                type="button"
                onClick={() => setTela('inicio')}
                className="p-1 -ml-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                title="Voltar"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <span>{tela === 'inicio' ? 'Central de Ajustes' : 'Ajuste de Saldo Bancário'}</span>
          </DialogTitle>
        </DialogHeader>

        {tela === 'inicio' ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Card 1 — Ajuste de Fatura */}
              <button
                type="button"
                onClick={() => {
                  // C4 — abre a funcionalidade de Ajuste de Fatura via prop do host
                  // (Lancamentos: Novo Lançamento tipo 'ajuste'; Cartoes: ModalLancamento
                  // pré-configurado para 'ajuste'). Sem hash na URL — '#/ajustes-fatura'
                  // não corresponde a rota. Fallback: evento legado só se a prop vier vazia.
                  fechar()
                  if (onAbrirAjustesFatura) {
                    onAbrirAjustesFatura()
                  } else {
                    window.dispatchEvent(
                      new CustomEvent('sap:abrir-ajustes-fatura', { bubbles: true }),
                    )
                  }
                }}
                className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-violet-300 hover:bg-violet-50/50 transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 transition shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">Ajuste de Fatura</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Ajusta diferenças entre o valor calculado pelo SAP e o apresentado na fatura.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
                    Abrir Ajustes de Fatura
                    <ChevronRightIcon />
                  </span>
                </div>
              </button>

              {/* Card 2 — Ajuste de Saldo Bancário */}
              <button
                type="button"
                onClick={() => setTela('saldo')}
                className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-violet-300 hover:bg-violet-50/50 transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-violet-100 text-violet-600 group-hover:bg-violet-200 transition shrink-0">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">Ajuste de Saldo Bancário</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Confere o saldo SAP com o saldo real e registra a diferença.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 group-hover:text-violet-700">
                    Ajustar Saldo da Conta
                    <ChevronRightIcon />
                  </span>
                </div>
              </button>
            </div>

            {/* Rodapé fixo da Central */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Ajustes são operações especiais de conciliação financeira do SAP. Podem atuar sobre
                faturas de cartão ou sobre o saldo de contas, conforme o tipo selecionado,
                respeitando regras próprias para Resultado e Orçamento.
              </p>
            </div>
          </>
        ) : (
          /* T4 — a view de conciliação de saldo (a antiga Central), como está */
          <CentralSaldoBancarioView
            contas={contas}
            contaInicialId={contaInicialId}
            workspaceId={workspaceId}
            userId={userId}
            modoConsulta={modoConsulta}
            onDadosAlterados={onDadosAlterados}
            onAbrirNovoLancamentoNaConta={onAbrirNovoLancamentoNaConta}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const ChevronRightIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export { CentralAjustesModal as default }
