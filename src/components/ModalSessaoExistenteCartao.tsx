import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle, FileText, UploadCloud } from 'lucide-react'
import { FaturaImportacaoRegistro } from '@/services/faturaImportacaoService'
import { formatMoneyBRL } from '@/lib/formatters'

export interface ModalSessaoExistenteCartaoProps {
  aberto: boolean
  cartaoNome: string
  sessao: FaturaImportacaoRegistro | null
  onVisualizar: () => void
  onImportarNova: () => void
  onCancelar: () => void
}

export function ModalSessaoExistenteCartao({
  aberto,
  cartaoNome,
  sessao,
  onVisualizar,
  onImportarNova,
  onCancelar,
}: ModalSessaoExistenteCartaoProps) {
  if (!sessao) return null

  const dataFormatada = sessao.created_at
    ? new Date(sessao.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onCancelar()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
              <AlertCircle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg">Fatura em Processamento</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            Este cartão possui uma fatura processada, deseja visualizá-la? Ou Importar nova fatura?
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 p-3.5 rounded-lg border border-border/70 bg-muted/40 text-sm space-y-1.5">
          <div className="font-semibold text-foreground flex items-center justify-between">
            <span>{cartaoNome}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium">
              Em revisão
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-medium text-foreground">Arquivo:</span> {sessao.arquivo_nome}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
            <span>{sessao.quantidade_itens} lançamentos</span>
            <span>Total: {formatMoneyBRL(sessao.valor_total_fatura || 0)}</span>
            <span>{dataFormatada}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Ao importar uma nova fatura, ela prevalecerá para a conferência e a fatura em
          processamento anterior será descartada. Lançamentos que já tenham sido gravados no banco
          anteriormente permanecem intactos.
        </p>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3">
          <Button type="button" variant="outline" onClick={onVisualizar} className="flex-1 gap-2">
            <FileText className="w-4 h-4" />
            Visualizar fatura em processamento
          </Button>
          <Button
            type="button"
            onClick={onImportarNova}
            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <UploadCloud className="w-4 h-4" />
            Importar nova fatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
