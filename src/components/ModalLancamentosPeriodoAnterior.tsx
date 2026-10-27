import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoneyBRL, formatAnoMesPT } from '@/lib/formatters'
import { LancamentoPeriodoAnteriorItem } from '@/types/sap'
import { CreditCard, Wallet, Calendar, AlertCircle } from 'lucide-react'

interface ModalLancamentosPeriodoAnteriorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  subtitulo: string
  competenciaAnterior: string
  totalGasto: number
  lancamentos: LancamentoPeriodoAnteriorItem[]
  loading?: boolean
}

export const ModalLancamentosPeriodoAnterior: React.FC<ModalLancamentosPeriodoAnteriorProps> = ({
  open,
  onOpenChange,
  titulo,
  subtitulo,
  competenciaAnterior,
  totalGasto,
  lancamentos,
  loading = false,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-white text-slate-900 border-slate-200">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                {titulo}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {subtitulo} • Período anterior:{' '}
                <strong className="text-slate-700">
                  {formatAnoMesPT(competenciaAnterior || '2026-09')}
                </strong>
              </DialogDescription>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Total Gasto
              </span>
              <span className="text-base sm:text-lg font-bold text-rose-600">
                {formatMoneyBRL(totalGasto)}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Carregando lançamentos do período anterior...
            </div>
          ) : lancamentos.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">
                Nenhum lançamento encontrado no período anterior
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Não constam saídas efetivadas em conta ou compras de cartão para este item em{' '}
                {formatAnoMesPT(competenciaAnterior)}.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
              {lancamentos.map((l) => {
                const dataFormatada = l.data ? l.data.split('-').reverse().join('/') : ''
                const ehCartao = l.meio_pagamento_tipo === 'CARTAO'

                return (
                  <div
                    key={l.id}
                    className="p-3 hover:bg-slate-50/70 transition flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 truncate">{l.descricao}</span>
                        {l.subcategoria_nome && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-slate-100 text-slate-600 font-normal px-1.5 py-0"
                          >
                            {l.subcategoria_nome}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {dataFormatada}
                        </span>
                        <span>•</span>
                        {ehCartao ? (
                          <span className="flex items-center gap-1 text-indigo-600 font-medium">
                            <CreditCard className="w-3 h-3" />
                            {l.cartao_nome || 'Cartão de Crédito'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-700 font-medium">
                            <Wallet className="w-3 h-3" />
                            {l.conta_nome || 'Conta Bancária'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs sm:text-sm font-bold text-rose-600 block">
                        {formatMoneyBRL(l.valor)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {ehCartao ? 'Fatura' : 'Pago'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-slate-100 flex items-center justify-between sm:justify-between w-full">
          <span className="text-[11px] text-slate-400">
            {lancamentos.length}{' '}
            {lancamentos.length === 1 ? 'lançamento registrado' : 'lançamentos registrados'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
