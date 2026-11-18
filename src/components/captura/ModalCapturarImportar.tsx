/**
 * Modal "Capturar / Importar" — substitui o acesso direto a Importar Fatura
 * (BLOCO 3): Fatura de Cartão (fluxo atual intacto), NFC-e/Cupom Fiscal (novo)
 * e NF-e (Em breve).
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CreditCard, Camera, FileText, Lock } from 'lucide-react'

interface Props {
  aberto: boolean
  onFechar: () => void
  onIrPara: (rota: string) => void
}

export function ModalCapturarImportar({ aberto, onFechar, onIrPara }: Props) {
  const opcoes = [
    {
      rotulo: 'Fatura de Cartão',
      descricao: 'PDF ou imagens da fatura — fluxo atual de revisão e conciliação.',
      icone: CreditCard,
      rota: '/importar-fatura',
      habilitado: true,
    },
    {
      rotulo: 'NFC-e / Cupom Fiscal',
      descricao: 'Foto do cupom em papel ou captura de tela da NFC-e digital.',
      icone: Camera,
      rota: '/capturar-nfce',
      habilitado: true,
    },
    {
      rotulo: 'NF-e / Nota Fiscal',
      descricao: 'Importação de NF-e completa.',
      icone: FileText,
      rota: '',
      habilitado: false,
      emBreve: true,
    },
  ]

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Capturar / Importar</DialogTitle>
          <DialogDescription>Escolha o tipo de documento:</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {opcoes.map((op) => {
            const Icone = op.icone
            return (
              <Button
                key={op.rotulo}
                variant="outline"
                disabled={!op.habilitado}
                onClick={() => op.habilitado && onIrPara(op.rota)}
                className="w-full h-auto py-3 px-4 justify-start gap-3 text-left border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <Icone className="w-4.5 h-4.5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    {op.rotulo}
                    {op.emBreve && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> Em breve
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{op.descricao}</p>
                </div>
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
