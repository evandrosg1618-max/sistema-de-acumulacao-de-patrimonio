import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShieldAlert, X } from 'lucide-react'

export interface InfoBloqueioFatura {
  competencia: string
  acao: 'inclusao' | 'alteracao' | 'exclusao'
  detalhes?: string
  mensagemPersonalizada?: string
}

interface ModalAvisoBloqueioFaturaProps {
  open: boolean
  onClose: () => void
  info: InfoBloqueioFatura | null
}

export function ModalAvisoBloqueioFatura({ open, onClose, info }: ModalAvisoBloqueioFaturaProps) {
  if (!info) return null

  const acaoTexto =
    info.acao === 'inclusao'
      ? 'incluir lançamentos nesta'
      : info.acao === 'alteracao'
        ? 'alterar lançamentos desta'
        : 'excluir lançamentos desta'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Exigência estrita: não fecha ao clicar fora nem ao pressionar Escape
        // Mantém-se visível até o usuário fechá-lo pelo botão "x" (ou botão Fechar)
        if (!next) {
          // Permite apenas fechamento explícito via onClose chamado pelo botão 'X'
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md border-rose-200 bg-white shadow-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="relative pr-8">
          <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-2">
            <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
          </div>

          <DialogTitle className="text-base font-bold text-slate-900 leading-snug">
            Fatura Paga — Operação Bloqueada
          </DialogTitle>

          <DialogDescription className="text-xs text-slate-500 mt-1">
            A competência afetada já foi quitada no sistema financeiro.
          </DialogDescription>

          {/* Botão "X" explícito no canto superior para fechar */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-0 right-0 p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition cursor-pointer"
            title="Fechar aviso (x)"
            aria-label="Fechar"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </DialogHeader>

        <div className="py-3 space-y-3 text-xs text-slate-700">
          <div className="p-3.5 bg-rose-50/80 rounded-xl border border-rose-200/80 space-y-2">
            <p className="font-semibold text-rose-950">
              A fatura da competência{' '}
              <span className="font-bold underline text-rose-700">{info.competencia}</span> já está
              com pagamento realizado.
            </p>

            <p className="text-rose-900 leading-relaxed">
              Não é permitido {acaoTexto} fatura. Para liberar qualquer inclusão, alteração ou
              exclusão, é necessário{' '}
              <strong>desfazer o pagamento da fatura de {info.competencia}</strong> na tela de{' '}
              <strong>Meus Cartões</strong> clicando em <em>"Estornar Pagamento"</em>.
            </p>

            {info.detalhes && (
              <p className="text-[11px] text-rose-800 pt-1 border-t border-rose-200 italic">
                {info.detalhes}
              </p>
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
            <strong>Instrução:</strong> Acesse o menu <em>Cartões</em>, localize a fatura da
            competência <strong>{info.competencia}</strong> e clique no botão{' '}
            <span className="font-semibold text-rose-600">"Estornar Pagamento"</span> para estornar
            o pagamento e restaurar a permissão de lançamento.
          </div>
        </div>

        <DialogFooter className="flex sm:justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="default"
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Fechar aviso (X)</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
