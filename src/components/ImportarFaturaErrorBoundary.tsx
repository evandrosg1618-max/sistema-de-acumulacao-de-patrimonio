import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ImportarFaturaErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erro capturado pelo ErrorBoundary de ImportarFatura:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  private handleTentarNovamente = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.reload()
  }

  private handleVoltar = () => {
    window.location.href = '/cartoes'
  }

  public render() {
    if (this.state.hasError) {
      const mensagemErro =
        this.state.error?.message ||
        (typeof this.state.error === 'string'
          ? this.state.error
          : 'Ocorreu um erro inesperado ao carregar a tela.')
      const componentStack = this.state.errorInfo?.componentStack || ''

      return (
        <div className="max-w-3xl mx-auto my-8 p-6 bg-white border border-rose-200 rounded-xl shadow-sm text-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900">
                Não foi possível exibir a tela de Importar Fatura
              </h2>
              <p className="text-xs text-slate-600">
                Um erro impediu a renderização completa da página. Os detalhes abaixo foram
                capturados para diagnóstico:
              </p>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs font-mono text-rose-900 break-words whitespace-pre-wrap">
            <strong>Mensagem:</strong> {mensagemErro}
          </div>

          {componentStack && (
            <details className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Pilha de componentes (detalhes técnicos)
              </summary>
              <pre className="mt-2 font-mono whitespace-pre-wrap overflow-x-auto text-[10px] text-slate-600">
                {componentStack}
              </pre>
            </details>
          )}

          <div className="pt-2 flex flex-wrap gap-2.5">
            <Button
              onClick={this.handleTentarNovamente}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Recarregar tela
            </Button>
            <Button
              variant="outline"
              onClick={this.handleVoltar}
              className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs h-9 gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para Cartões
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
