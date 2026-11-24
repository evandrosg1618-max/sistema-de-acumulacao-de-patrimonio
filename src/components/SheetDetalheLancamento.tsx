import React from 'react'
import { CreditCard, Wallet, Banknote, Edit2, Trash2, Receipt, X } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@/components/ui/drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoneyBRL } from '@/lib/formatters'
import { renderIconePorId } from '@/components/SeletorVisualIconeCor'
import type { Lancamento } from '@/types/sap'

export interface SheetDetalheLancamentoProps {
  lancamento: Lancamento | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerFatura: (l: Lancamento) => void
  onVisualizar: (l: Lancamento) => void
  onEditar: (l: Lancamento) => void
  onExcluir: (l: Lancamento) => void
  isProcessing?: boolean
}

// Rótulo/valor discreto — pares do painel de detalhes (PDF seções 9, 16 e 17)
const LinhaDetalhe: React.FC<{ rotulo: string; children: React.ReactNode }> = ({
  rotulo,
  children,
}) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100/80 last:border-b-0">
    <span className="text-[11px] sm:text-xs text-slate-500 shrink-0 pt-0.5">{rotulo}</span>
    <span className="text-xs font-medium text-slate-800 text-right break-words min-w-0">
      {children}
    </span>
  </div>
)

const LABEL_MODALIDADE: Record<string, string> = {
  compra_propria: 'Compra Própria',
  compra_compartilhada: 'Compra Compartilhada',
  compra_terceiros: 'Compra para Terceiros',
  emprestimo_terceiros: 'Empréstimo a Terceiros',
}

const LABEL_PERIODICIDADE: Record<string, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
  anual: 'Anual',
}

export const SheetDetalheLancamento: React.FC<SheetDetalheLancamentoProps> = ({
  lancamento: l,
  open,
  onOpenChange,
  onVerFatura,
  onVisualizar,
  onEditar,
  onExcluir,
  isProcessing = false,
}) => {
  if (!l) return null

  const isDespesa = l.tipo === 'despesa'
  const isReceita = l.tipo === 'receita'
  const isTransf = l.tipo === 'transferencia'
  const isAjuste = l.tipo === 'ajuste'
  const isPago = l.status_pagamento === 'pago'
  const ehCartao = l.meio_pagamento_tipo === 'CARTAO'

  // Mesma classificação estrutural do card (l.estrutura definida na fonte pelo service)
  const estruturaItem = ((l as any).estrutura ||
    (String(l.regime || '') === 'parcelado'
      ? 'pai_parcelado'
      : String(l.regime || '') === 'fixo'
        ? 'fixo'
        : 'unico')) as 'pai_parcelado' | 'fixo' | 'unico'
  const ehParcelado = estruturaItem === 'pai_parcelado'
  const ehFixo = estruturaItem === 'fixo'
  const seriePrazo = (l as any).series_lancamentos?.prazo
  const totalParcelasFixo = (l as any).series_lancamentos?.quantidade_total || 0
  const ehFixoDeterminado = ehFixo && seriePrazo === 'determinado'

  const ehPrevisao =
    (l as any).natureza === 'previsao' ||
    (l as any).natureza_previsao === true ||
    (l.status_pagamento as string) === 'previsao'

  let meioPagamentoLabel = 'Conta Corrente'
  if (ehCartao) {
    meioPagamentoLabel = l.cartao?.nome || 'Cartão de Crédito'
  } else if (l.meio_pagamento_tipo === 'DINHEIRO') {
    meioPagamentoLabel = 'Dinheiro'
  } else if (isTransf) {
    meioPagamentoLabel = `${l.conta_origem?.nome || 'Origem'} ➔ ${l.conta_destino?.nome || 'Destino'}`
  } else if (l.conta_origem?.nome) {
    meioPagamentoLabel = l.conta_origem.nome
  }

  const valorTexto = isAjuste
    ? `${l.efeito_fatura === 'reduz' ? '−' : '+'} ${formatMoneyBRL(l.valor)}`
    : `${isReceita ? '+' : isDespesa ? '−' : ''} ${formatMoneyBRL(l.valor)}`

  const valorClasse = isAjuste
    ? l.efeito_fatura === 'reduz'
      ? 'text-emerald-600'
      : 'text-rose-600'
    : isReceita
      ? 'text-blue-600'
      : isDespesa
        ? 'text-rose-600'
        : 'text-emerald-600'

  // Status em texto (só no painel — no card o indicador é o botão 👍/👎, decisão do usuário)
  const statusTexto = ehPrevisao
    ? 'Previsão'
    : isReceita
      ? isPago
        ? 'Recebido'
        : 'Não recebido'
      : isPago
        ? 'Pago'
        : 'Não pago'

  const dataFormatada = (l.data || '').split('-').reverse().join('/')

  const iconeId =
    l.subcategoria?.icone ||
    l.categoria?.icone ||
    (isAjuste ? 'scale' : isDespesa ? 'tag' : isReceita ? 'trending-up' : 'arrow-right-left')

  const corIcone =
    l.subcategoria?.cor ||
    l.categoria?.cor ||
    (isAjuste ? '#7C3AED' : isDespesa ? '#EF4444' : isReceita ? '#10B981' : '#059669')

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] bg-white border-slate-200 rounded-t-2xl">
        {/* Área rolável: painel compacto, o card permanece a lista de consulta */}
        <div className="overflow-y-auto px-4 pb-2">
          {/* Cabeçalho: ícone, descrição, valor e badge de regime */}
          <DrawerHeader className="relative items-center text-center pb-3 border-b border-slate-100">
            <DrawerClose className="absolute right-0 top-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
              <X className="w-4 h-4" />
              <span className="sr-only">Fechar</span>
            </DrawerClose>

            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 mx-auto shadow-2xs"
              style={{ backgroundColor: corIcone }}
            >
              {renderIconePorId(iconeId, 'w-4.5 h-4.5 stroke-[2.2]')}
            </div>

            <DrawerTitle className="text-sm sm:text-base font-bold text-slate-900 leading-snug break-words px-2">
              {l.descricao}
            </DrawerTitle>

            <div className={`text-base font-bold tracking-tight ${valorClasse}`}>{valorTexto}</div>

            <DrawerDescription className="flex items-center justify-center flex-wrap gap-1.5 pt-1">
              {ehParcelado &&
                (() => {
                  const totalP = l.total_parcelas || l.quantidade_parcelas || 1
                  const valorParcela = Number((l.valor / (totalP > 0 ? totalP : 1)).toFixed(2))
                  return (
                    <Badge
                      variant="outline"
                      className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] py-0 px-1.5 font-medium"
                    >
                      {totalP} vezes de {formatMoneyBRL(valorParcela).replace('R$', '').trim()}
                    </Badge>
                  )
                })()}
              {ehFixoDeterminado && (
                <Badge
                  variant="outline"
                  className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0 px-1.5 font-medium"
                >
                  Fixo {l.numero_parcela ? `${l.numero_parcela}/` : '1/'}
                  {totalParcelasFixo}
                </Badge>
              )}
              {ehFixo && !ehFixoDeterminado && (
                <Badge
                  variant="outline"
                  className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0 px-1.5 font-medium"
                >
                  Fixo
                </Badge>
              )}
              {isAjuste && (
                <Badge
                  variant="outline"
                  className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0 px-1.5 font-bold"
                >
                  ± Ajuste
                </Badge>
              )}
              {ehPrevisao && (
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] py-0 px-1.5 font-medium"
                >
                  Previsão
                </Badge>
              )}
            </DrawerDescription>
          </DrawerHeader>

          {/* Pares rótulo/valor — campos N/D simplesmente não são exibidos */}
          <div className="py-1">
            {dataFormatada && <LinhaDetalhe rotulo="Data">{dataFormatada}</LinhaDetalhe>}

            <LinhaDetalhe rotulo="Pago com">
              <span className="inline-flex items-center gap-1.5">
                {ehCartao ? (
                  <CreditCard className="w-3 h-3 text-slate-500 shrink-0" />
                ) : l.meio_pagamento_tipo === 'DINHEIRO' ? (
                  <Banknote className="w-3 h-3 text-slate-500 shrink-0" />
                ) : (
                  <Wallet className="w-3 h-3 text-slate-500 shrink-0" />
                )}
                {meioPagamentoLabel}
              </span>
            </LinhaDetalhe>

            {isTransf && l.conta_origem?.nome && (
              <LinhaDetalhe rotulo="Conta de origem">{l.conta_origem.nome}</LinhaDetalhe>
            )}
            {isTransf && l.conta_destino?.nome && (
              <LinhaDetalhe rotulo="Conta de destino">{l.conta_destino.nome}</LinhaDetalhe>
            )}

            {l.categoria && <LinhaDetalhe rotulo="Categoria">{l.categoria.nome}</LinhaDetalhe>}
            {l.subcategoria && (
              <LinhaDetalhe rotulo="Subcategoria">{l.subcategoria.nome}</LinhaDetalhe>
            )}

            {isDespesa && l.modalidade_saida && (
              <LinhaDetalhe rotulo="Modalidade">
                {LABEL_MODALIDADE[String(l.modalidade_saida)] || String(l.modalidade_saida)}
              </LinhaDetalhe>
            )}

            {/* Parcelado: N parcelas + valor total — NUNCA listar as parcelas (PDF seção 16) */}
            {ehParcelado && (
              <>
                <LinhaDetalhe rotulo="Parcelamento">
                  {l.total_parcelas || l.quantidade_parcelas || 1} parcelas
                </LinhaDetalhe>
                <LinhaDetalhe rotulo="Valor Total">{formatMoneyBRL(l.valor)}</LinhaDetalhe>
              </>
            )}

            {/* Fixo: Periodicidade e Ocorrência — NUNCA divisão do valor (PDF seção 17) */}
            {ehFixo && (l as any).series_lancamentos?.periodicidade && (
              <LinhaDetalhe rotulo="Periodicidade">
                {LABEL_PERIODICIDADE[String((l as any).series_lancamentos.periodicidade)] ||
                  String((l as any).series_lancamentos.periodicidade)}
              </LinhaDetalhe>
            )}
            {ehFixoDeterminado && (
              <LinhaDetalhe rotulo="Ocorrência">
                {l.numero_parcela || 1} de {totalParcelasFixo}
              </LinhaDetalhe>
            )}

            {isAjuste && (
              <LinhaDetalhe rotulo="Tipo de Ajuste">
                {l.subtipo_ajuste === 'ajuste_tecnico_sap'
                  ? 'Ajuste Técnico do SAP'
                  : l.subtipo_ajuste === 'ajuste_saldo_conta'
                    ? 'Ajuste do saldo da conta'
                    : 'Ajuste da Fatura do Banco'}
                {l.efeito_fatura
                  ? ` • ${l.efeito_fatura === 'reduz' ? 'Reduz fatura' : 'Aumenta fatura'}`
                  : ''}
              </LinhaDetalhe>
            )}

            {isDespesa && l.modalidade_saida === 'compra_compartilhada' && (
              <LinhaDetalhe rotulo="Minha parte">
                {formatMoneyBRL(l.valor_proprio ?? l.valor)}
                {' • '}
                <span className="text-slate-500">
                  A receber {formatMoneyBRL(l.valor_terceiros ?? 0)}
                </span>
              </LinhaDetalhe>
            )}
            {isDespesa &&
              (l.modalidade_saida === 'compra_terceiros' ||
                l.modalidade_saida === 'emprestimo_terceiros') && (
                <LinhaDetalhe rotulo="A receber">
                  {formatMoneyBRL(l.valor_terceiros ?? l.valor)}
                </LinhaDetalhe>
              )}

            {l.observacao && <LinhaDetalhe rotulo="Observações">{l.observacao}</LinhaDetalhe>}

            <LinhaDetalhe rotulo="Status">
              <span className={isPago && !ehPrevisao ? 'text-emerald-600' : 'text-slate-600'}>
                {statusTexto}
              </span>
            </LinhaDetalhe>
          </div>
        </div>

        {/* Ações: exatamente as mesmas funções do menu ⋮ do desktop */}
        <DrawerFooter className="flex-row gap-2 border-t border-slate-100 pt-3 pb-5 px-4">
          {ehCartao && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-10 text-xs rounded-xl border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-900"
              onClick={() => {
                onOpenChange(false)
                onVerFatura(l)
              }}
            >
              <Receipt className="w-3.5 h-3.5 mr-1 text-indigo-600" />
              Ver Fatura
            </Button>
          )}
          {!ehCartao && (
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              className="flex-1 h-10 text-xs rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onOpenChange(false)
                onVisualizar(l)
              }}
            >
              Visualizar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-10 text-xs rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            onClick={() => {
              onOpenChange(false)
              onEditar(l)
            }}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1 text-slate-800" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            className="flex-1 h-10 text-xs rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            onClick={() => {
              onOpenChange(false)
              onExcluir(l)
            }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />
            Excluir
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
