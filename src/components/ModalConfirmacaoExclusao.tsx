import React from 'react'
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

export interface ModalConfirmacaoExclusaoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description: string
  onConfirm: () => void | Promise<void>
  isAlertOnly?: boolean // Se true, exibe apenas botão OK (ex: aviso de lançamento pago)
  confirmText?: string
  cancelText?: string
  loading?: boolean
}

export const ModalConfirmacaoExclusao: React.FC<ModalConfirmacaoExclusaoProps> = ({
  open,
  onOpenChange,
  title = 'Confirmação',
  description,
  onConfirm,
  isAlertOnly = false,
  confirmText = 'OK',
  cancelText = 'Cancelar',
  loading = false,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-slate-900">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-600 mt-2 whitespace-pre-line leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
          {!isAlertOnly && (
            <AlertDialogCancel
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="mt-0"
            >
              {cancelText}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            disabled={loading}
            onClick={async (e) => {
              e.preventDefault()
              await onConfirm()
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-600"
          >
            {loading ? 'Processando...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
