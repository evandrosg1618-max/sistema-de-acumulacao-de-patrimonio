import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HelpCircle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'

interface ModalAjudaConceitosProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  abaInicial?: 'despesa' | 'receita'
}

/**
 * Modal explicativo centralizado com as definições padronizadas
 * exatas da Seção 25 do PDF e da matriz analítica de receitas e despesas do SAP.
 */
export function ModalAjudaConceitos({
  open,
  onOpenChange,
  abaInicial = 'despesa',
}: ModalAjudaConceitosProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-white text-slate-900 border-slate-200">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2 text-base md:text-lg font-bold text-slate-900">
            <HelpCircle className="w-5 h-5 text-emerald-600" />
            <span>Entenda as Classificações e Naturezas</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Critérios padronizados da taxonomia analítica do SAP (Seção 25 do PRD).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 overflow-y-auto max-h-[calc(85vh-120px)] space-y-6">
          <div className="space-y-6 py-2">
            {/* Bloco 1: DESPESAS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1.5 border-b border-rose-100">
                <TrendingDown className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-rose-700">
                  Despesas — Classificação e Natureza
                </h3>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Classificações de Despesa
                </h4>

                {/* Essencial */}
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">Essencial</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-emerald-100/70 text-emerald-800 border-emerald-300"
                    >
                      Padrão de vida
                    </Badge>
                  </div>
                  <p className="text-xs text-emerald-950 leading-relaxed">
                    Sustenta o padrão mínimo de vida que a família decidiu preservar no nível atual
                    de renda.
                  </p>
                  <p className="text-[11px] text-emerald-800 italic pt-1">
                    Representa aquilo que, considerando o padrão de vida atualmente escolhido, a
                    família entende que não pretende eliminar. Ex.: plano de saúde, escola,
                    alimentação básica, energia elétrica.
                  </p>
                </div>

                {/* Ajustável */}
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900">Ajustável</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-blue-100/70 text-blue-800 border-blue-300"
                    >
                      Margem de otimização
                    </Badge>
                  </div>
                  <p className="text-xs text-blue-950 leading-relaxed">
                    Possui utilidade reconhecida e tende a permanecer, mas custo, fornecedor,
                    quantidade ou frequência podem ser otimizados.
                  </p>
                  <p className="text-[11px] text-blue-800 italic pt-1">
                    A despesa possui benefício reconhecido e não se pretende simplesmente
                    eliminá-la, mas há espaço para melhorar sua eficiência. Ex.: plano de telefonia,
                    academia, seguros.
                  </p>
                </div>

                {/* Discricionária */}
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">Discricionária</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-100/70 text-amber-800 border-amber-300"
                    >
                      Conforto & Lazer
                    </Badge>
                  </div>
                  <p className="text-xs text-amber-950 leading-relaxed">
                    Proporciona conforto, lazer, conveniência ou benefício desejado, mas pode ser
                    reduzida ou suspensa sem comprometer o padrão mínimo escolhido.
                  </p>
                  <p className="text-[11px] text-amber-800 italic pt-1">
                    Não significa que seja uma despesa ruim. A característica principal é existir
                    maior liberdade de decisão quanto a realizá-la ou não. Ex.: restaurantes,
                    streaming, viagens.
                  </p>
                </div>

                {/* Supérflua */}
                <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-900">Supérflua</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-rose-100/70 text-rose-800 border-rose-300"
                    >
                      Desperdício / Desacerto
                    </Badge>
                  </div>
                  <p className="text-xs text-rose-950 leading-relaxed font-medium">
                    Gasto que revelou baixo ou nenhum benefício, desperdício, aquisição equivocada
                    ou consumo que não se deseja repetir.
                  </p>
                  <p className="text-[11px] text-rose-800 italic pt-1">
                    ⚠️ <strong>Atenção:</strong> Supérflua NÃO é sinônimo de "não essencial". Uma
                    assinatura contratada e não utilizada ou uma compra inútil são supérfluas; lazer
                    útil é discricionário.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Naturezas Econômicas de Despesa
                </h4>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Consumo</span>
                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700">
                      Sem acúmulo de bem
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Recurso utilizado para consumo, serviço, manutenção, conservação ou obrigação,
                    sem incorporação patrimonial relevante. Ex.: alimentação, reparos, combustível,
                    serviços.
                  </p>
                </div>

                <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900">Patrimonial</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-indigo-100/70 text-indigo-800 border-indigo-300"
                    >
                      Formação patrimonial
                    </Badge>
                  </div>
                  <p className="text-xs text-indigo-950 leading-relaxed">
                    Recurso convertido em aquisição, construção, ampliação ou melhoria relevante de
                    bem durável. Ex.: eletrodomésticos duráveis, móveis planejados, reformas
                    estruturais.
                  </p>
                </div>

                <div className="text-[11px] text-slate-500 bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                  💡 <strong>Independência:</strong> Classificação e Natureza são dimensões
                  independentes (ex.: <em>Patrimonial + Ajustável</em> ou{' '}
                  <em>Patrimonial + Supérflua</em> são combinações válidas).
                </div>
              </div>
            </div>

            {/* Bloco 2: RECEITAS */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-100">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-700">
                  Receitas — Regularidade e Origem Econômica
                </h3>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Regularidade da Receita
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="font-bold text-slate-800">Recorrente mensal:</span>
                    <p className="text-slate-600 mt-0.5">Previsível todo mês (ex: Salário).</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="font-bold text-slate-800">Recorrente anual:</span>
                    <p className="text-slate-600 mt-0.5">
                      Previsível uma vez ao ano (ex: 13º Salário, 1/3 de férias).
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="font-bold text-slate-800">Recorrente variável:</span>
                    <p className="text-slate-600 mt-0.5">
                      Frequente, porém com valor oscilante (ex: Dividendos, JCP, FIIs).
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                    <span className="font-bold text-slate-800">Eventual:</span>
                    <p className="text-slate-600 mt-0.5">
                      Entrada pontual/esporádica (ex: Restituição IR, diárias, bônus).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Origem Econômica da Receita
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-md">
                    <span className="font-bold text-emerald-900">Trabalho:</span>
                    <p className="text-emerald-800 mt-0.5">
                      Quanto a atividade profissional produz (salários, pró-labore, diárias).
                    </p>
                  </div>
                  <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-md">
                    <span className="font-bold text-blue-900">Capital:</span>
                    <p className="text-blue-800 mt-0.5">
                      Quanto o patrimônio produz (rendimentos de renda fixa, dividendos, FIIs).
                    </p>
                  </div>
                  <div className="p-2.5 bg-purple-50/60 border border-purple-200 rounded-md">
                    <span className="font-bold text-purple-900">Outras:</span>
                    <p className="text-purple-800 mt-0.5">
                      Entradas que não decorrem diretamente de trabalho ou capital (restituições,
                      prêmios).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
