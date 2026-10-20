import React, { createContext, useContext, useState, useCallback, useTransition } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

interface LoadingContextType {
  isProcessing: boolean
  processingMessage: string
  startProcessing: (message?: string) => void
  stopProcessing: () => void
  runWithLock: <T>(action: () => Promise<T>, message?: string) => Promise<T | null>
}

const LoadingContext = createContext<LoadingContextType>({
  isProcessing: false,
  processingMessage: 'Processando ação financeira...',
  startProcessing: () => {},
  stopProcessing: () => {},
  runWithLock: async () => null,
})

export const useGlobalLoading = () => useContext(LoadingContext)

export const GlobalLoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('Processando ação financeira...')
  const [, startTransition] = useTransition()

  const startProcessing = useCallback((message = 'Processando ação financeira...') => {
    setProcessingMessage(message)
    setIsProcessing(true)
  }, [])

  const stopProcessing = useCallback(() => {
    startTransition(() => {
      setIsProcessing(false)
    })
  }, [])

  const runWithLock = useCallback(
    async <T,>(
      action: () => Promise<T>,
      message = 'Processando com segurança e consistência no banco...',
    ): Promise<T | null> => {
      if (isProcessing) {
        // Bloqueio imediato no segundo clique
        return null
      }
      setIsProcessing(true)
      setProcessingMessage(message)
      try {
        const result = await action()
        return result
      } finally {
        setIsProcessing(false)
      }
    },
    [isProcessing],
  )

  return (
    <LoadingContext.Provider
      value={{
        isProcessing,
        processingMessage,
        startProcessing,
        stopProcessing,
        runWithLock,
      }}
    >
      {children}

      {/* OVERLAY GLOBAL SUSPENSO NO CENTRO DA TELA */}
      {isProcessing && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs select-none transition-all duration-150 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200/80 flex flex-col items-center max-w-sm w-full mx-4 text-center space-y-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Processando Transação
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {processingMessage}
              </p>
            </div>

            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full w-2/3 rounded-full animate-pulse" />
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/60 w-full justify-center">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Por favor, aguarde. Não feche nem recarregue.</span>
            </div>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  )
}
