import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Bookmark, Trash2 } from 'lucide-react'

export interface ModalDescarteNavegacaoProps {
  aberto: boolean
  itensNaoImportadosCount?: number
  carregando?: boolean
  onSalvarEContinuarDepois?: () => void
  onDescartar?: () => void | Promise<void>
  onCancelar?: () => void
  // Aliases suportados para integração flexível
  aoFechar?: () => void
  aoSalvarEContinuar?: () => void
  aoDescartar?: () => void | Promise<void>
}

export function ModalDescarteNavegacao({
  aberto,
  itensNaoImportadosCount,
  carregando = false,
  onSalvarEContinuarDepois,
  onDescartar,
  onCancelar,
  aoFechar,
  aoSalvarEContinuar,
  aoDescartar,
}: ModalDescarteNavegacaoProps) {
  const fechar = () => {
    if (aoFechar) aoFechar()
    else if (onCancelar) onCancelar()
  }

  const handleSalvar = () => {
    if (aoSalvarEContinuar) aoSalvarEContinuar()
    else if (onSalvarEContinuarDepois) onSalvarEContinuarDepois()
  }

  const handleDescartar = () => {
    if (aoDescartar) aoDescartar()
    else if (onDescartar) onDescartar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && !carregando && fechar()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg">Atenção ao sair da importação</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground/90 font-medium pt-1">
            Você não clicou em &quot;Salvar e Continuar depois&quot;. Deseja descartar a fatura
            processada?
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {itensNaoImportadosCount !== undefined && itensNaoImportadosCount > 0
            ? `Existem ${itensNaoImportadosCount} lançamentos ainda não efetivados nesta sessão.`
            : 'Existem lançamentos ainda não efetivados nesta sessão.'}{' '}
          Se descartar, a fatura processada será encerrada e nenhum lançamento será criado. Se
          salvar para continuar depois, você poderá retomar a revisão a qualquer momento.
        </p>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleDescartar}
            disabled={carregando}
            className="flex-1 gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-rose-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Descartar
          </Button>
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={carregando}
            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Bookmark className="w-4 h-4" />
            Salvar e Continuar depois
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
