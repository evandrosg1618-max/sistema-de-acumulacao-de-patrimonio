import React, { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { Check, Clock } from 'lucide-react'

export type ModoVisualizacao = 'competencia_integral' | 'competencia_mensal' | 'caixa'

interface ModalModoVisualizacaoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modoAtual: ModoVisualizacao
  onSelecionarModo: (modo: ModoVisualizacao) => void
}

export function ModalModoVisualizacao({
  open,
  onOpenChange,
  modoAtual,
  onSelecionarModo,
}: ModalModoVisualizacaoProps) {
  const [modoEscolhido, setModoEscolhido] = useState<ModoVisualizacao>(modoAtual)

  // Ao reabrir, sincronizar com o modo ativo
  React.useEffect(() => {
    if (open) {
      setModoEscolhido(modoAtual)
    }
  }, [open, modoAtual])

  const handleConfirmar = () => {
    onSelecionarModo(modoEscolhido)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white p-6 rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold text-slate-900 tracking-tight">
            Modo de Visualização
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-slate-500">
            Selecione o regime contábil/financeiro para visualização dos lançamentos e do resumo do
            período.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* 3 BALÕES DE SELEÇÃO */}
        <div className="space-y-4 my-2">
          {/* 1º MODO (PADRÃO / ATIVO) */}
          <div
            onClick={() => setModoEscolhido('competencia_integral')}
            className={cn(
              'cursor-pointer rounded-xl border p-4.5 transition relative text-left',
              modoEscolhido === 'competencia_integral'
                ? 'border-emerald-500 bg-emerald-50/40 shadow-xs ring-1 ring-emerald-500'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                  1
                </span>
                <h3 className="text-sm font-bold text-slate-900">Regime de Competência Integral</h3>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Padrão
                </span>
              </div>
              <div
                className={cn(
                  'w-5 h-5 rounded-full border flex items-center justify-center transition',
                  modoEscolhido === 'competencia_integral'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-300 bg-white',
                )}
              >
                {modoEscolhido === 'competencia_integral' && (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <div>
                <p className="font-semibold text-slate-800">
                  Este regime responde à seguinte pergunta:
                </p>
                <p className="italic text-slate-600 mt-0.5">
                  &ldquo;Qual é o valor total do compromisso financeiro que assumi neste período,
                  independentemente de quando será pago ou recebido?&rdquo;
                </p>
              </div>

              <div>
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-800">Exemplo:</span> uma compra de R$
                  1.200 parcelada em 12 vezes é representada pelo compromisso total de R$ 1.200 no
                  mês da compra.
                </p>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <p className="font-semibold text-slate-800">Objetivo do SAP:</p>
                <p className="text-slate-600 mt-0.5 leading-relaxed">
                  &ldquo;Viver sem dívidas, mas aproveitar a maravilha dos juros compostos:
                  Automaticamente o valor é lançado na Conta Reserva Estratégica a qual é destinada
                  à cobertura de parcelamentos estratégicos, mantendo o capital aplicado enquanto as
                  parcelas ainda não venceram.&rdquo;
                </p>
              </div>

              {/* LINHA DESTACADA EM VERMELHO */}
              <div className="pt-1">
                <p className="font-bold text-red-600">
                  Use a calculadora estratégica para saber se é viável pagar a vista ou a prazo
                </p>
              </div>
            </div>
          </div>

          {/* 2º MODO (EM BREVE) */}
          <div
            onClick={() => setModoEscolhido('competencia_mensal')}
            className={cn(
              'cursor-pointer rounded-xl border p-4.5 transition relative text-left',
              modoEscolhido === 'competencia_mensal'
                ? 'border-blue-500 bg-blue-50/40 shadow-xs ring-1 ring-blue-500'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-400 text-white text-[11px] font-bold">
                  2
                </span>
                <h3 className="text-sm font-bold text-slate-900">Regime de Competência Mensal</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  <Clock className="w-2.5 h-2.5" />
                  Em breve
                </span>
              </div>
              <div
                className={cn(
                  'w-5 h-5 rounded-full border flex items-center justify-center transition',
                  modoEscolhido === 'competencia_mensal'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white',
                )}
              >
                {modoEscolhido === 'competencia_mensal' && (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <div>
                <p className="font-semibold text-slate-800">
                  Este regime responde à seguinte pergunta:
                </p>
                <p className="italic text-slate-600 mt-0.5">
                  &ldquo;Qual parcela das receitas e despesas pertence economicamente a este
                  período, independentemente de quando será paga ou recebida?&rdquo;
                </p>
              </div>

              <div>
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-800">Exemplo:</span> uma compra de R$
                  1.200 parcelada em 12 vezes é representada apenas pela parcela de R$ 100 no mês do
                  vencimento, ou seja, distribui o impacto conforme a competência de cada período.
                </p>
              </div>
            </div>
          </div>

          {/* 3º MODO (EM BREVE) */}
          <div
            onClick={() => setModoEscolhido('caixa')}
            className={cn(
              'cursor-pointer rounded-xl border p-4.5 transition relative text-left',
              modoEscolhido === 'caixa'
                ? 'border-blue-500 bg-blue-50/40 shadow-xs ring-1 ring-blue-500'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-400 text-white text-[11px] font-bold">
                  3
                </span>
                <h3 className="text-sm font-bold text-slate-900">Regime de Caixa</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  <Clock className="w-2.5 h-2.5" />
                  Em breve
                </span>
              </div>
              <div
                className={cn(
                  'w-5 h-5 rounded-full border flex items-center justify-center transition',
                  modoEscolhido === 'caixa'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white',
                )}
              >
                {modoEscolhido === 'caixa' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <div>
                <p className="font-semibold text-slate-800">
                  Este regime responde à seguinte pergunta
                </p>
                <p className="italic text-slate-600 mt-0.5">
                  &ldquo;Quanto efetivamente entrou ou saiu de dinheiro neste período?&rdquo;
                </p>
              </div>

              <div>
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-800">Exemplo:</span> uma compra de R$
                  1.200 parcelada em 12 vezes é representada nesse regime apenas no momento em que
                  ocorre a efetiva movimentação financeira. Se a parcela de R$ 100 for paga em
                  determinado mês, é nesse mês que ela impacta a visão de caixa.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MENSAGEM INFORMATIVA QUANDO SELECIONA MODO 2 OU 3 */}
        {modoEscolhido !== 'competencia_integral' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            <strong>Aviso:</strong> Este modo está marcado como &ldquo;em breve&rdquo;. Apenas o{' '}
            <strong>Regime de Competência Integral</strong> está ativo nesta fase como base do
            Orçamento. Ao confirmar, o modo padrão será mantido.
          </div>
        )}

        <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
          <AlertDialogCancel className="text-xs h-9 rounded-xl">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmar}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 rounded-xl px-5 font-semibold"
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
