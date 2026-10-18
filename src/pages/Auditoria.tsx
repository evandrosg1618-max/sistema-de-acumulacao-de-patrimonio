import React, { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { auditoriaService } from '@/services/sap'
import { AuditoriaOperacao } from '@/types/sap'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { History, Shield, Filter, RefreshCw, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AuditoriaPage() {
  const { currentWorkspace } = useAuth()
  const [historico, setHistorico] = useState<AuditoriaOperacao[]>([])
  const [loading, setLoading] = useState(true)

  const carregarHistorico = async () => {
    if (!currentWorkspace?.workspace_id) return
    setLoading(true)
    try {
      const data = await auditoriaService.getHistorico(currentWorkspace.workspace_id, 50)
      setHistorico(data)
    } catch (err) {
      console.error('Erro ao carregar auditoria:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarHistorico()
  }, [currentWorkspace?.workspace_id])

  const formatarData = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* HEADER VIS-19 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Trilha de Auditoria e Operações Críticas
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Registro imutável de eventos, alterações e operações no workspace{' '}
            {currentWorkspace?.workspace_nome}.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={carregarHistorico}
          disabled={loading}
          className="text-xs self-start sm:self-auto flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* LISTA DE REGISTROS VIS-19 */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            Linha do Tempo de Atividades
          </CardTitle>
          <CardDescription className="text-xs">
            Exibindo as últimas 50 operações registradas com estado anterior e posterior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Carregando registros de auditoria...
            </div>
          ) : historico.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Shield className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-xs font-semibold text-slate-700">
                Nenhum evento registrado ainda
              </div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                As operações financeiras críticas, alterações de usuários e preferências serão
                registradas aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {historico.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono bg-slate-50">
                        {item.entidade}
                      </Badge>
                      <span className="text-xs font-semibold text-slate-800">{item.acao}</span>
                      {item.idempotency_key && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          chave: {item.idempotency_key.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      ID: {item.entidade_id}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-600 font-medium">
                      {formatarData(item.created_at)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      UUID: {item.id.substring(0, 8)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
