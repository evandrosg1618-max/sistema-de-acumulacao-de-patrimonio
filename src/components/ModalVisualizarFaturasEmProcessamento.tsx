import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, Trash2, ArrowRight, Clock, CreditCard } from 'lucide-react'
import { FaturaImportacaoRegistro } from '@/services/faturaImportacaoService'
import { formatMoneyBRL } from '@/lib/formatters'
import { CartaoCredito } from '@/types/sap'

export interface ModalVisualizarFaturasEmProcessamentoProps {
  aberto: boolean
  faturas: FaturaImportacaoRegistro[]
  cartoes: CartaoCredito[]
  carregando?: boolean
  onSelecionar: (fatura: FaturaImportacaoRegistro) => void
  onDescartar: (faturaId: string) => Promise<void>
  onFechar: () => void
}

export function ModalVisualizarFaturasEmProcessamento({
  aberto,
  faturas,
  cartoes,
  carregando = false,
  onSelecionar,
  onDescartar,
  onFechar,
}: ModalVisualizarFaturasEmProcessamentoProps) {
  const [descartandoId, setDescartandoId] = useState<string | null>(null)

  const mapaCartoes = new Map(cartoes.map((c) => [c.id, c.nome]))

  const handleDescartar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const confirmou = window.confirm(
      'Deseja realmente descartar esta fatura processada? Esta ação encerra a sessão sem gravar lançamentos.',
    )
    if (!confirmou) return

    setDescartandoId(id)
    try {
      await onDescartar(id)
    } finally {
      setDescartandoId(null)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && !descartandoId && onFechar()}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-500">
              <FileText className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg">Faturas em Processamento</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Faturas salvas para continuar depois. Selecione uma para retomar a conferência ou
            descarte-a.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-2.5">
          {faturas.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
              Nenhuma fatura em processamento salva no momento.
            </div>
          ) : (
            faturas.map((f) => {
              const nomeCartao = mapaCartoes.get(f.cartao_id) || 'Cartão desconhecido'
              const dataFormatada = f.created_at
                ? new Date(f.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''

              const estaDescartando = descartandoId === f.id

              return (
                <div
                  key={f.id}
                  onClick={() => !estaDescartando && !carregando && onSelecionar(f)}
                  className="p-3.5 rounded-lg border border-border/80 bg-card hover:bg-muted/50 cursor-pointer transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-500" />
                      <span className="font-semibold text-sm text-foreground">{nomeCartao}</span>
                      {f.competencia && (
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {f.competencia}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      {formatMoneyBRL(f.valor_total_fatura || 0)}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                    <span className="font-medium text-foreground/80">Arquivo:</span>
                    <span className="truncate">{f.arquivo_nome}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <div className="flex items-center gap-3">
                      <span>{f.quantidade_itens} itens</span>
                      <span>Salvo em {dataFormatada}</span>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleDescartar(e, f.id)}
                        disabled={estaDescartando || carregando}
                        className="h-7 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Descartar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onSelecionar(f)}
                        disabled={estaDescartando || carregando}
                        className="h-7 px-2.5 text-xs gap-1 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                      >
                        Retomar
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
