import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ValorCalculadoraInput } from '@/components/ValorCalculadoraInput'
import {
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  Calendar,
  CreditCard,
  Wallet,
  Tag,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { formatMoneyBRL } from '@/lib/formatters'
import {
  Conta,
  Cartao,
  Categoria,
  Lancamento,
  MeioPagamentoTipo,
  TipoLancamento,
} from '@/types/sap'
import { orcamentoService } from '@/services/sap'

interface ModalLancamentoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (dados: any, criarOutro?: boolean) => Promise<void>
  initialData?: Lancamento | null
  tipoPadrao?: TipoLancamento
  contas: Conta[]
  cartoes: Cartao[]
  categorias: Categoria[]
  workspaceId: string
  userId?: string
}

export function ModalLancamento({
  open,
  onOpenChange,
  onSave,
  initialData,
  tipoPadrao = 'despesa',
  contas,
  cartoes,
  categorias,
  workspaceId,
  userId,
}: ModalLancamentoProps) {
  const [tipo, setTipo] = useState<TipoLancamento>(tipoPadrao)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])
  const [meioPagamento, setMeioPagamento] = useState<MeioPagamentoTipo>('CONTA')
  const [contaOrigemId, setContaOrigemId] = useState('')
  const [contaDestinoId, setContaDestinoId] = useState('')
  const [cartaoId, setCartaoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [pago, setPago] = useState(true)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Orçamento da categoria no mês da compra (PRD Seção 8)
  const [orcamentoInfo, setOrcamentoInfo] = useState<{
    limite: number
    consumo: number
    disponivel: number
    percentual: number
  } | null>(null)

  // Resetar/Inicializar formulário
  useEffect(() => {
    if (!open) return

    if (initialData) {
      setTipo(initialData.tipo)
      setDescricao(initialData.descricao || '')
      setValor(initialData.valor ? initialData.valor.toFixed(2).replace('.', ',') : '')
      setData(initialData.data || new Date().toISOString().split('T')[0])
      setMeioPagamento(initialData.meio_pagamento_tipo || 'CONTA')
      setContaOrigemId(initialData.conta_origem_id || '')
      setContaDestinoId(initialData.conta_destino_id || '')
      setCartaoId(initialData.cartao_id || '')
      setCategoriaId(initialData.categoria_id || '')
      setSubcategoriaId(initialData.subcategoria_id || '')
      setPago(initialData.status_pagamento === 'pago')
      setObservacao(initialData.observacao || '')
    } else {
      setTipo(tipoPadrao)
      setDescricao('')
      setValor('')
      setData(new Date().toISOString().split('T')[0])
      setMeioPagamento('CONTA')
      setContaOrigemId(contas.length > 0 ? contas[0].id : '')
      setContaDestinoId(contas.length > 1 ? contas[1].id : '')
      setCartaoId(cartoes.length > 0 ? cartoes[0].id : '')
      const catsDoTipo = categorias.filter((c) =>
        tipoPadrao === 'receita' ? c.tipo === 'receita' : c.tipo === 'despesa',
      )
      setCategoriaId(catsDoTipo.length > 0 ? catsDoTipo[0].id : '')
      setSubcategoriaId('')
      setPago(true)
      setObservacao('')
    }
  }, [open, initialData, tipoPadrao])

  // Ajustar meio de pagamento e categorias ao mudar o tipo
  useEffect(() => {
    if (tipo === 'transferencia') {
      setMeioPagamento('CONTA')
      setCategoriaId('')
      setSubcategoriaId('')
    } else {
      const catsDoTipo = categorias.filter((c) =>
        tipo === 'receita' ? c.tipo === 'receita' : c.tipo === 'despesa',
      )
      if (catsDoTipo.length > 0 && !catsDoTipo.find((c) => c.id === categoriaId)) {
        setCategoriaId(catsDoTipo[0].id)
        setSubcategoriaId('')
      }
    }
  }, [tipo, categorias])

  // Buscar consumo e limite do orçamento da categoria para o mês da data selecionada
  useEffect(() => {
    if (!workspaceId || !categoriaId || tipo !== 'despesa') {
      setOrcamentoInfo(null)
      return
    }

    const anoMes = data.substring(0, 7)
    let isCancelled = false

    orcamentoService
      .listByMes(workspaceId, anoMes)
      .then((orcs) => {
        if (isCancelled) return
        const orc = orcs.find((o) => o.categoria_id === categoriaId)
        if (orc && orc.limite > 0) {
          const limite = orc.limite
          const consumo = orc.consumo_atual || 0
          const disponivel = limite - consumo
          const pct = Math.round((consumo / limite) * 100)
          setOrcamentoInfo({
            limite,
            consumo,
            disponivel,
            percentual: pct,
          })
        } else {
          setOrcamentoInfo(null)
        }
      })
      .catch(() => {
        if (!isCancelled) setOrcamentoInfo(null)
      })

    return () => {
      isCancelled = true
    }
  }, [workspaceId, categoriaId, data, tipo])

  const subcategoriasDaCategoria = categorias.find((c) => c.id === categoriaId)?.subcategorias || []

  const handleSubmeter = async (e: React.FormEvent, criarOutro = false) => {
    e.preventDefault()

    if (!descricao.trim()) {
      return
    }

    const valorNumerico = parseFloat(valor.replace(/\./g, '').replace(',', '.'))
    if (!valorNumerico || valorNumerico <= 0) {
      return
    }

    if (tipo === 'transferencia') {
      if (!contaOrigemId || !contaDestinoId) {
        return
      }
      if (contaOrigemId === contaDestinoId) {
        return
      }
    }

    setSalvando(true)
    try {
      await onSave(
        {
          id: initialData?.id,
          tipo,
          descricao: descricao.trim(),
          valor: valorNumerico,
          data,
          meio_pagamento_tipo: tipo === 'transferencia' ? 'CONTA' : meioPagamento,
          conta_origem_id:
            meioPagamento === 'CONTA' || tipo === 'transferencia' ? contaOrigemId || null : null,
          conta_destino_id: tipo === 'transferencia' ? contaDestinoId || null : null,
          cartao_id:
            meioPagamento === 'CARTAO' && tipo !== 'transferencia' ? cartaoId || null : null,
          categoria_id: tipo !== 'transferencia' ? categoriaId || null : null,
          subcategoria_id: tipo !== 'transferencia' && subcategoriaId ? subcategoriaId : null,
          status_pagamento: meioPagamento === 'CARTAO' ? 'pendente' : pago ? 'pago' : 'pendente',
          data_pagamento: pago ? data : null,
          observacao: observacao.trim() || null,
        },
        criarOutro,
      )

      if (criarOutro) {
        setDescricao('')
        setValor('')
        setObservacao('')
      } else {
        onOpenChange(false)
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={(e) => handleSubmeter(e, false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {tipo === 'despesa' && <TrendingDown className="w-5 h-5 text-rose-600" />}
              {tipo === 'receita' && <TrendingUp className="w-5 h-5 text-emerald-600" />}
              {tipo === 'transferencia' && <ArrowRightLeft className="w-5 h-5 text-blue-600" />}
              <span>
                {initialData ? 'Editar Lançamento' : `Novo Lançamento — ${tipo.toUpperCase()}`}
              </span>
            </DialogTitle>
            <DialogDescription>
              {initialData
                ? 'Atualize as informações do lançamento com recálculo automático de saldos e faturas.'
                : 'Preencha os dados do lançamento financeiro familiar.'}
            </DialogDescription>
          </DialogHeader>

          {/* Abas para alternar tipo de lançamento se for novo */}
          {!initialData && (
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg mt-3">
              <button
                type="button"
                onClick={() => setTipo('despesa')}
                className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition ${
                  tipo === 'despesa'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Despesa</span>
              </button>
              <button
                type="button"
                onClick={() => setTipo('receita')}
                className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition ${
                  tipo === 'receita'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Receita</span>
              </button>
              <button
                type="button"
                onClick={() => setTipo('transferencia')}
                className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition ${
                  tipo === 'transferencia'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transferência</span>
              </button>
            </div>
          )}

          <div className="py-4 space-y-4">
            {/* Descrição & Valor com Calculadora */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lan-desc" className="text-xs font-semibold text-slate-700">
                  Descrição *
                </Label>
                <Input
                  id="lan-desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Supermercado, Aluguel, Combustível"
                  className="mt-1"
                  required
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="lan-val" className="text-xs font-semibold text-slate-700">
                  Valor * (Calculadora com "=")
                </Label>
                <div className="mt-1">
                  <ValorCalculadoraInput
                    id="lan-val"
                    value={valor}
                    onChange={setValor}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Data e Meio de Pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lan-data" className="text-xs font-semibold text-slate-700">
                  Data *
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="lan-data"
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              {tipo !== 'transferencia' ? (
                <div>
                  <Label htmlFor="lan-meio" className="text-xs font-semibold text-slate-700">
                    Meio de Pagamento *
                  </Label>
                  <Select
                    value={meioPagamento}
                    onValueChange={(v: MeioPagamentoTipo) => setMeioPagamento(v)}
                  >
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONTA">Conta Bancária</SelectItem>
                      <SelectItem value="CARTAO">Cartão de Crédito</SelectItem>
                      <SelectItem value="DINHEIRO">Dinheiro em Espécie / Carteira</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Natureza</Label>
                  <div className="mt-1 p-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800 font-medium flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Transferência com liquidez neutra</span>
                  </div>
                </div>
              )}
            </div>

            {/* Seleção de Conta / Cartão dependendo do meio */}
            {tipo !== 'transferencia' && (
              <>
                {meioPagamento === 'CONTA' && (
                  <div>
                    <Label htmlFor="lan-conta" className="text-xs font-semibold text-slate-700">
                      Conta Bancária
                    </Label>
                    <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                      <SelectTrigger className="mt-1 text-xs">
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome} ({formatMoneyBRL(c.saldo_atual)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {meioPagamento === 'CARTAO' && (
                  <div>
                    <Label htmlFor="lan-cartao" className="text-xs font-semibold text-slate-700">
                      Cartão de Crédito
                    </Label>
                    <Select value={cartaoId} onValueChange={setCartaoId}>
                      <SelectTrigger className="mt-1 text-xs">
                        <SelectValue placeholder="Selecione o cartão" />
                      </SelectTrigger>
                      <SelectContent>
                        {cartoes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome} (Fecha dia {c.dia_fechamento} • Limite:{' '}
                            {formatMoneyBRL(c.limite)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Lançamento no cartão não baixa a conta de imediato; compõe a fatura do cartão.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Se for transferência, contas de Origem e Destino */}
            {tipo === 'transferencia' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <Label htmlFor="lan-t-origem" className="text-xs font-semibold text-slate-700">
                    Conta Origem (Saída) *
                  </Label>
                  <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} ({formatMoneyBRL(c.saldo_atual)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="lan-t-destino" className="text-xs font-semibold text-slate-700">
                    Conta Destino (Entrada) *
                  </Label>
                  <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas
                        .filter((c) => c.id !== contaOrigemId)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome} ({formatMoneyBRL(c.saldo_atual)})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Categoria e Subcategoria */}
            {tipo !== 'transferencia' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lan-cat" className="text-xs font-semibold text-slate-700">
                    Categoria
                  </Label>
                  <Select value={categoriaId} onValueChange={setCategoriaId}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias
                        .filter((c) =>
                          tipo === 'receita' ? c.tipo === 'receita' : c.tipo === 'despesa',
                        )
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: c.cor || '#64748B' }}
                              />
                              <span>{c.nome}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="lan-subcat" className="text-xs font-semibold text-slate-700">
                    Subcategoria (Opcional)
                  </Label>
                  <Select
                    value={subcategoriaId}
                    onValueChange={setSubcategoriaId}
                    disabled={subcategoriasDaCategoria.length === 0}
                  >
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue
                        placeholder={
                          subcategoriasDaCategoria.length === 0
                            ? 'Sem subcategorias'
                            : 'Selecione subcategoria'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategoriasDaCategoria.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* FEEDBACK DE ORÇAMENTO EM TEMPO REAL (PRD SEÇÃO 8) */}
            {orcamentoInfo && tipo === 'despesa' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Orçamento de {data.substring(0, 7)}:</span>
                  <span
                    className={
                      orcamentoInfo.disponivel < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700'
                    }
                  >
                    {orcamentoInfo.disponivel < 0 ? 'Estouro de Orçamento: ' : 'Disponível: '}
                    {formatMoneyBRL(Math.abs(orcamentoInfo.disponivel))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>Limite: {formatMoneyBRL(orcamentoInfo.limite)}</span>
                  <span>Gasto: {formatMoneyBRL(orcamentoInfo.consumo)}</span>
                  <span>{orcamentoInfo.percentual}%</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      orcamentoInfo.percentual >= 80
                        ? 'bg-rose-500'
                        : orcamentoInfo.percentual >= 60
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, orcamentoInfo.percentual)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Toggle de Pago (se não for cartão) */}
            {tipo !== 'transferencia' && meioPagamento !== 'CARTAO' && (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-slate-800">
                    {tipo === 'despesa' ? 'Despesa paga' : 'Receita recebida'}
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Se desmarcado, fica como previsto/pendente e não baixa o saldo bancário.
                  </p>
                </div>
                <Switch checked={pago} onCheckedChange={setPago} />
              </div>
            )}

            {/* Observações */}
            <div>
              <Label htmlFor="lan-obs" className="text-xs font-semibold text-slate-700">
                Observações (Opcional)
              </Label>
              <Input
                id="lan-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Detalhes adicionais, anotações..."
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            {!initialData && (
              <Button
                type="button"
                variant="secondary"
                disabled={salvando}
                onClick={(e) => handleSubmeter(e, true)}
                className="text-xs"
              >
                Salvar e Criar Outro
              </Button>
            )}
            <Button
              type="submit"
              disabled={salvando}
              className={`text-white text-xs ${
                tipo === 'despesa'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : tipo === 'receita'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {salvando ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Salvar Lançamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
