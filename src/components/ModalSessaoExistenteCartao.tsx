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
  cartaoNome?: string
  sessao?: FaturaImportacaoRegistro | null
  onVisualizar?: () => void
  onImportarNova?: () => void
  onCancelar?: () => void
  // Aliases suportados para integração flexível
  nomeCartao?: string
  sessaoExistente?: FaturaImportacaoRegistro | null
  aoFechar?: () => void
  aoVisualizarExistente?: () => void | Promise<void>
  aoImportarNova?: () => void
}

export function ModalSessaoExistenteCartao({
  aberto,
  cartaoNome,
  sessao,
  onVisualizar,
  onImportarNova,
  onCancelar,
  nomeCartao,
  sessaoExistente,
  aoFechar,
  aoVisualizarExistente,
  aoImportarNova,
}: ModalSessaoExistenteCartaoProps) {
  const sessaoAlvo = sessao || sessaoExistente
  if (!sessaoAlvo) return null

  const nomeExibicao = nomeCartao || cartaoNome || 'Cartão'

  const fechar = () => {
    if (aoFechar) aoFechar()
    else if (onCancelar) onCancelar()
  }

  const handleVisualizar = () => {
    if (aoVisualizarExistente) aoVisualizarExistente()
    else if (onVisualizar) onVisualizar()
  }

  const handleImportarNova = () => {
    if (aoImportarNova) aoImportarNova()
    else if (onImportarNova) onImportarNova()
  }

  const dataFormatada = sessaoAlvo.created_at
    ? new Date(sessaoAlvo.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="sm:max-w-[640px] w-[95vw]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
              <AlertCircle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg">Fatura em Processamento</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground pt-1 leading-relaxed">
            Este cartão possui uma fatura processada, deseja visualizá-la? Ou Importar nova fatura?
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 p-3.5 rounded-lg border border-border/70 bg-muted/40 text-sm space-y-2">
          <div className="font-semibold text-foreground flex items-center justify-between">
            <span className="text-base">{nomeExibicao}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-medium">
              Em revisão
            </span>
          </div>
          <div className="text-xs text-muted-foreground break-all">
            <span className="font-medium text-foreground">Arquivo:</span> {sessaoAlvo.arquivo_nome}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
            <span className="font-medium text-foreground">
              {sessaoAlvo.quantidade_itens} lançamentos
            </span>
            <span className="font-medium text-foreground">
              Total: {formatMoneyBRL(sessaoAlvo.valor_total_fatura || 0)}
            </span>
            <span>{dataFormatada}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Ao importar uma nova fatura, ela prevalecerá para a conferência e a fatura em
          processamento anterior será descartada. Lançamentos que já tenham sido gravados no banco
          anteriormente permanecem intactos.
        </p>

        <DialogFooter className="flex-col sm:flex-row gap-2.5 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleVisualizar}
            className="flex-1 gap-2 whitespace-nowrap"
          >
            <FileText className="w-4 h-4 shrink-0" />
            Visualizar fatura em processamento
          </Button>
          <Button
            type="button"
            onClick={handleImportarNova}
            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
          >
            <UploadCloud className="w-4 h-4 shrink-0" />
            Importar nova fatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
