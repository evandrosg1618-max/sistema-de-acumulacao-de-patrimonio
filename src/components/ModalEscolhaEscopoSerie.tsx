import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle, AlertTriangle, Calendar, CheckCircle2, Loader2 } from 'lucide-react'

export type EscopoSerie = 'todos'

interface ModalEscolhaEscopoSerieProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipoAcao: 'editar' | 'excluir'
  regime: 'fixo' | 'parcelado'
  descricaoLancamento?: string
  numeroParcela?: number
  totalParcelas?: number
  ehUltimaParcela?: boolean
  // Build 5: Regra de escopo único "Todos"
  temPagas?: boolean
  competenciasPagas?: string[]
  dataEscolhida?: string // Formato YYYY-MM-DD ou data formatada para exibição
  loading?: boolean
  onConfirmar: (escopo: EscopoSerie) => void
}

function formatarDataBR(dataStr?: string): string {
  if (!dataStr) return ''
  try {
    const limpo = dataStr.substring(0, 10)
    const partes = limpo.split('-')
    if (partes.length === 3) {
      const [ano, mes, dia] = partes
      return `${dia}/${mes}/${ano}`
    }
    return dataStr
  } catch {
    return dataStr
  }
}

export function ModalEscolhaEscopoSerie({
  open,
  onOpenChange,
  tipoAcao,
  regime,
  descricaoLancamento,
  numeroParcela,
  totalParcelas,
  temPagas = false,
  competenciasPagas = [],
  dataEscolhida,
  loading = false,
  onConfirmar,
}: ModalEscolhaEscopoSerieProps) {
  const isEditar = tipoAcao === 'editar'
  const isFixo = regime === 'fixo'

  const dataFormatada = formatarDataBR(dataEscolhida)
  const textoCompetencias =
    competenciasPagas && competenciasPagas.length > 0
      ? competenciasPagas.join(', ')
      : 'competências anteriores'

  return (
    <Dialog open={open} onOpenChange={loading ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isEditar ? (
              <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                <Calendar className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 rounded-full bg-red-100 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}{' '}
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                {isEditar
                  ? isFixo
                    ? 'Confirmar alteração da série recorrente'
                    : 'Confirmar alteração de compra parcelada'
                  : isFixo
                    ? 'Confirmar exclusão da série recorrente'
                    : 'Confirmar exclusão de compra parcelada'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {descricaoLancamento ? (
                  <span className="font-medium text-foreground">{descricaoLancamento}</span>
                ) : null}
                {!isFixo && numeroParcela && totalParcelas ? (
                  <span className="ml-1 text-xs">
                    (Parcela {numeroParcela}/{totalParcelas})
                  </span>
                ) : null}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card informativo com os textos exatos solicitados */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            {isEditar ? (
              /* FLUXO DE EDIÇÃO */
              !temPagas ? (
                /* Edição - Se NÃO houver recorrência paga: 3 linhas */
                <div className="space-y-2.5 text-sm text-foreground">
                  <div className="flex items-start gap-2 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Não existem recorrências pagas</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600">
                    <span className="text-slate-900 font-medium">•</span>
                    <span>Serão alteradas todas as recorrências não pagas</span>
                  </div>
                  {dataFormatada ? (
                    <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200">
                      <p className="text-xs font-bold text-rose-700 leading-relaxed">
                        • A data escolhida ({dataFormatada}) será a data inicial das novas
                        recorrências. Confira se está correta.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                /* Edição - Se HOUVER recorrências pagas: 4 linhas */
                <div className="space-y-2.5 text-sm text-foreground">
                  <div className="flex items-start gap-2 text-amber-700 font-medium">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Existem recorrências pagas na competência de {textoCompetencias}</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-600">
                    <span className="text-slate-900 font-medium">•</span>
                    <span>
                      Ao confirmar a operação, serão alteradas todas as recorrências não pagas
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-100 p-2 rounded">
                    <span>
                      • Caso deseje alterar também as recorrências pagas, desfaça o pagamento dos
                      respectivos lançamentos ou fatura.
                    </span>
                  </div>
                  {dataFormatada ? (
                    <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200">
                      <p className="text-xs font-bold text-rose-700 leading-relaxed">
                        • A data escolhida ({dataFormatada}) será a data inicial das novas
                        recorrências. Confira se está correta.
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            ) : /* FLUXO DE EXCLUSÃO */
            !temPagas ? (
              /* Exclusão - Se NÃO houver recorrência paga: 2 linhas */
              <div className="space-y-2.5 text-sm text-foreground">
                <div className="flex items-start gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Não existem recorrências pagas</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="text-slate-900 font-medium">•</span>
                  <span>Serão excluídas todas as recorrências</span>
                </div>
              </div>
            ) : (
              /* Exclusão - Se HOUVER recorrências pagas: 3 linhas */
              <div className="space-y-2.5 text-sm text-foreground">
                <div className="flex items-start gap-2 text-amber-700 font-medium">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Existem recorrências pagas na competência de {textoCompetencias}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="text-slate-900 font-medium">•</span>
                  <span>
                    Ao confirmar a operação, serão excluídas todas as recorrências não pagas
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-100 p-2 rounded">
                  <span>
                    • Caso deseje excluir também as recorrências pagas, desfaça o pagamento dos
                    respectivos lançamentos ou da fatura.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span className="inline-block w-2 h-2 rounded-full bg-primary shrink-0" />
            <span>
              Escopo da operação: <strong>Todos</strong> (recorrências e parcelas da série)
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={isEditar ? 'default' : 'destructive'}
            onClick={() => onConfirmar('todos')}
            disabled={loading}
            className="gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditar ? 'Confirmar alteração' : 'Confirmar exclusão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
