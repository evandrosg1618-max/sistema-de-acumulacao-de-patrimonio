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
  Banknote,
  Tag,
  FileText,
  Paperclip,
  RotateCw,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { formatMoneyBRL, formatAnoMesPT } from '@/lib/formatters'
import {
  Conta,
  Cartao,
  Categoria,
  Lancamento,
  MeioPagamentoTipo,
  TipoLancamento,
  PeriodicidadeFixo,
  PrazoFixo,
} from '@/types/sap'
import { orcamentoService, faturaService } from '@/services/sap'
import { ModalAvisoBloqueioFatura, InfoBloqueioFatura } from '@/components/ModalAvisoBloqueioFatura'
import { useGlobalLoading } from '@/contexts/LoadingContext'

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
  cartaoPadraoId?: string
  dataPadrao?: string
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
  cartaoPadraoId,
  dataPadrao,
}: ModalLancamentoProps) {
  const { isProcessing } = useGlobalLoading()
  const [tipo, setTipo] = useState<TipoLancamento>(tipoPadrao)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])

  // Seletor unificado "Pago com" (despesa) / "Recebido em" (receita)
  // Formato: "conta:<id>" | "cartao:<id>" | "dinheiro:principal"
  const [pagoComDestino, setPagoComDestino] = useState<string>('')

  // Para transferências:
  const [contaOrigemId, setContaOrigemId] = useState('')
  const [contaDestinoId, setContaDestinoId] = useState('')

  // Parcelamento (Build 3 e Build 5)
  const [quantidadeParcelas, setQuantidadeParcelas] = useState<number>(1)

  // Build 5: Opções de Recorrência / Repetição (Fixo vs Parcelado)
  // Inicialmente oculto atrás do ícone de repetição
  const [mostrarOpcoesRepeticao, setMostrarOpcoesRepeticao] = useState(false)
  const [modoRepeticao, setModoRepeticao] = useState<'nenhum' | 'fixo' | 'parcelado'>('nenhum')
  const [fixoPrazo, setFixoPrazo] = useState<PrazoFixo>('indeterminado')
  const [fixoOcorrencias, setFixoOcorrencias] = useState<number>(12)
  const [fixoPeriodicidade, setFixoPeriodicidade] = useState<PeriodicidadeFixo>('mensal')

  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [pago, setPago] = useState(true)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [bloqueioFaturaInfo, setBloqueioFaturaInfo] = useState<InfoBloqueioFatura | null>(null)
  const [modalBloqueioOpen, setModalBloqueioOpen] = useState(false)

  // Orçamento da categoria no mês da compra (PRD Seção 8)
  const [orcamentoInfo, setOrcamentoInfo] = useState<{
    limite: number
    consumo: number
    disponivel: number
    percentual: number
  } | null>(null)

  // Helper para inicializar valor padrão de pagoComDestino
  const getValorPadraoOrigem = () => {
    if (contas.length > 0) return `conta:${contas[0].id}`
    if (cartoes.length > 0) return `cartao:${cartoes[0].id}`
    return 'dinheiro:principal'
  }

  // Resetar/Inicializar formulário
  useEffect(() => {
    if (!open) return

    if (initialData) {
      setTipo(initialData.tipo)
      setDescricao(initialData.descricao || '')
      setValor(initialData.valor ? initialData.valor.toFixed(2).replace('.', ',') : '')
      setData(initialData.data || new Date().toISOString().split('T')[0])

      if (initialData.cartao_id) {
        setPagoComDestino(`cartao:${initialData.cartao_id}`)
      } else if (initialData.conta_origem_id) {
        setPagoComDestino(`conta:${initialData.conta_origem_id}`)
      } else if (initialData.meio_pagamento_tipo === 'DINHEIRO') {
        setPagoComDestino('dinheiro:principal')
      } else {
        setPagoComDestino(getValorPadraoOrigem())
      }

      setContaOrigemId(initialData.conta_origem_id || (contas.length > 0 ? contas[0].id : ''))
      setContaDestinoId(initialData.conta_destino_id || (contas.length > 1 ? contas[1].id : ''))
      setCategoriaId(initialData.categoria_id || '')
      setSubcategoriaId(initialData.subcategoria_id || '')
      setPago(initialData.status_pagamento === 'pago')
      setObservacao(initialData.observacao || '')
      // Se for lançamento com parcelas, limpa eventual sufixo '(x/y)' do título
      const descLimpa = (initialData.descricao || '').replace(/\s*\(\d+\/\d+\)$/, '').trim()
      setDescricao(descLimpa)
      setQuantidadeParcelas(initialData.total_parcelas || initialData.quantidade_parcelas || 1)
    } else {
      setTipo(tipoPadrao)
      setDescricao('')
      setValor('')
      setData(dataPadrao || new Date().toISOString().split('T')[0])
      if (cartaoPadraoId) {
        setPagoComDestino(`cartao:${cartaoPadraoId}`)
      } else {
        setPagoComDestino(getValorPadraoOrigem())
      }
      setContaOrigemId(contas.length > 0 ? contas[0].id : '')
      setContaDestinoId(contas.length > 1 ? contas[1].id : '')
      const catsDoTipo = categorias.filter((c) =>
        tipoPadrao === 'receita' ? c.tipo === 'receita' : c.tipo === 'despesa',
      )
      setCategoriaId(catsDoTipo.length > 0 ? catsDoTipo[0].id : '')
      setSubcategoriaId('')
      setPago(true)
      setObservacao('')
      setQuantidadeParcelas(1)
      setMostrarOpcoesRepeticao(false)
      setModoRepeticao('nenhum')
      setFixoPrazo('indeterminado')
      setFixoOcorrencias(12)
      setFixoPeriodicidade('mensal')
    }
  }, [open, initialData, tipoPadrao, cartaoPadraoId, dataPadrao])

  // Ajustar categorias ao mudar o tipo
  useEffect(() => {
    if (tipo === 'transferencia') {
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

    // Decompor o seletor unificado "Pago com" / "Recebido em"
    let meioFinal: MeioPagamentoTipo = 'CONTA'
    let resolvedContaOrigemId: string | null = null
    let resolvedCartaoId: string | null = null

    if (tipo === 'transferencia') {
      meioFinal = 'CONTA'
      resolvedContaOrigemId = contaOrigemId
    } else {
      if (pagoComDestino.startsWith('cartao:')) {
        meioFinal = 'CARTAO'
        resolvedCartaoId = pagoComDestino.replace('cartao:', '')
      } else if (pagoComDestino.startsWith('conta:')) {
        meioFinal = 'CONTA'
        resolvedContaOrigemId = pagoComDestino.replace('conta:', '')
      } else if (pagoComDestino.startsWith('dinheiro:')) {
        meioFinal = 'DINHEIRO'
      }
    }

    // Validação preventiva se for em cartão de crédito com fatura já paga
    if (resolvedCartaoId && data && workspaceId) {
      const cartaoObj = cartoes.find((c) => c.id === resolvedCartaoId)
      if (cartaoObj) {
        const compCalculada = faturaService.calcularCompetenciaCartao(
          data,
          cartaoObj.dia_fechamento,
          cartaoObj.dia_vencimento,
        )
        try {
          const fat = await faturaService.getFatura(workspaceId, resolvedCartaoId, compCalculada)
          if (fat && fat.status === 'paga') {
            setBloqueioFaturaInfo({
              competencia: compCalculada,
              acao: initialData?.id ? 'alteracao' : 'inclusao',
              detalhes: `A fatura de ${cartaoObj.nome} (${compCalculada}) já está quitada. Desfaça o pagamento para prosseguir com esta operação.`,
            })
            setModalBloqueioOpen(true)
            return
          }
        } catch (e) {
          console.warn('Erro ao verificar fatura prévia no ModalLancamento:', e)
        }
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
          meio_pagamento_tipo: meioFinal,
          conta_origem_id: resolvedContaOrigemId,
          conta_destino_id: tipo === 'transferencia' ? contaDestinoId || null : null,
          cartao_id: resolvedCartaoId,
          categoria_id: tipo !== 'transferencia' ? categoriaId || null : null,
          subcategoria_id: tipo !== 'transferencia' && subcategoriaId ? subcategoriaId : null,
          status_pagamento: meioFinal === 'CARTAO' ? 'pendente' : pago ? 'pago' : 'pendente',
          data_pagamento: pago ? data : null,
          observacao: observacao.trim() || null,
          regime:
            modoRepeticao === 'fixo'
              ? 'fixo'
              : modoRepeticao === 'parcelado'
                ? 'parcelado'
                : 'unico',
          quantidade_parcelas: modoRepeticao === 'parcelado' ? quantidadeParcelas : 1,
          // Build 5: parâmetros para lançamento fixo
          fixo:
            modoRepeticao === 'fixo'
              ? {
                  prazo: fixoPrazo,
                  periodicidade: fixoPeriodicidade,
                  quantidade_total: fixoPrazo === 'determinado' ? fixoOcorrencias : null,
                  pago_primeira: meioFinal !== 'CARTAO' && pago,
                }
              : null,
        },
        criarOutro,
      )

      if (criarOutro) {
        setDescricao('')
        setValor('')
        setObservacao('')
        setQuantidadeParcelas(1)
        setModoRepeticao('nenhum')
        setMostrarOpcoesRepeticao(false)
      } else {
        onOpenChange(false)
      }
    } catch (err: any) {
      if (err?.message && err.message.includes('fatura') && err.message.includes('paga')) {
        let compExtraida = data.substring(0, 7)
        if (resolvedCartaoId) {
          const cartaoObj = cartoes.find((c) => c.id === resolvedCartaoId)
          if (cartaoObj) {
            compExtraida = faturaService.calcularCompetenciaCartao(
              data,
              cartaoObj.dia_fechamento,
              cartaoObj.dia_vencimento,
            )
          }
        }
        setBloqueioFaturaInfo({
          competencia: compExtraida,
          acao: initialData?.id ? 'alteracao' : 'inclusao',
          detalhes: err.message,
        })
        setModalBloqueioOpen(true)
      } else {
        throw err
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
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

              {/* Data e Pago com / Recebido em (Substituição unificada do Meio de Pagamento) */}
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
                    <Label
                      htmlFor="lan-pago-com"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>{tipo === 'despesa' ? 'Pago com *' : 'Recebido em *'}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        vincula meio automaticamente
                      </span>
                    </Label>
                    <Select value={pagoComDestino} onValueChange={setPagoComDestino}>
                      <SelectTrigger id="lan-pago-com" className="mt-1 text-xs">
                        <SelectValue placeholder="Selecione conta, cartão ou dinheiro" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {/* Grupo: Contas Bancárias */}
                        {contas.length > 0 && (
                          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Contas Bancárias
                          </div>
                        )}
                        {contas.map((c) => (
                          <SelectItem key={`conta:${c.id}`} value={`conta:${c.id}`}>
                            <div className="flex items-center gap-2">
                              <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{c.nome}</span>
                              <span className="text-slate-400 text-[11px]">
                                ({formatMoneyBRL(c.saldo_atual)})
                              </span>
                            </div>
                          </SelectItem>
                        ))}

                        {/* Grupo: Cartões de Crédito */}
                        {cartoes.length > 0 && (
                          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            Cartões de Crédito
                          </div>
                        )}
                        {cartoes.map((c) => (
                          <SelectItem key={`cartao:${c.id}`} value={`cartao:${c.id}`}>
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>{c.nome}</span>
                              <span className="text-slate-400 text-[11px]">
                                (Fecha dia {c.dia_fechamento})
                              </span>
                            </div>
                          </SelectItem>
                        ))}

                        {/* Grupo: Dinheiro em Espécie */}
                        <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                          Espécie
                        </div>
                        <SelectItem value="dinheiro:principal">
                          <div className="flex items-center gap-2">
                            <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Dinheiro em Espécie / Carteira</span>
                          </div>
                        </SelectItem>
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

              {/* Informação em tempo real da competência da fatura que o lançamento vai compor ao selecionar cartão (OCR 2ª Tela) */}
              {pagoComDestino.startsWith('cartao:') &&
                (() => {
                  const cId = pagoComDestino.replace('cartao:', '')
                  const cObj = cartoes.find((c) => c.id === cId)
                  if (!cObj) return null
                  const compCalc = faturaService.calcularCompetenciaCartao(
                    data,
                    cObj.dia_fechamento,
                    cObj.dia_vencimento,
                  )
                  return (
                    <div className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-3 py-1.5 flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                      <span>
                        Fatura de {formatAnoMesPT(compCalc)} ({cObj.nome})
                      </span>
                    </div>
                  )
                })()}

              {/* BARRA DE ÍCONES (Conforme OCR OrganiZe):
                  1. Repetir (Fixo/Parcelado) - Ativo/expansível
                  2. Observações - placeholder desabilitado (não configurar agora)
                  3. Anexar arquivo - placeholder desabilitado (não configurar agora)
                  4. Tags - placeholder desabilitado (não configurar agora)
              */}
              {!initialData && (
                <div className="pt-1">
                  <div className="flex items-center gap-2 border-y border-slate-100 py-2">
                    <button
                      type="button"
                      onClick={() => setMostrarOpcoesRepeticao(!mostrarOpcoesRepeticao)}
                      className={`p-2 rounded-lg border transition flex items-center gap-1.5 text-xs font-semibold ${
                        mostrarOpcoesRepeticao || modoRepeticao !== 'nenhum'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="Repetir lançamento: Fixo ou Parcelado"
                    >
                      <RotateCw
                        className={`w-4 h-4 ${mostrarOpcoesRepeticao || modoRepeticao !== 'nenhum' ? 'text-emerald-600' : 'text-slate-500'}`}
                      />
                      <span>
                        Repetir{' '}
                        {modoRepeticao === 'fixo'
                          ? '(Fixo)'
                          : modoRepeticao === 'parcelado'
                            ? `(${quantidadeParcelas}x)`
                            : ''}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled
                      title="Observações (disponível abaixo)"
                      className="p-2 rounded-lg border border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed"
                    >
                      <FileText className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled
                      title="Anexar arquivo (em breve)"
                      className="p-2 rounded-lg border border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled
                      title="Tags (em breve)"
                      className="p-2 rounded-lg border border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed"
                    >
                      <Tag className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* PAINEL EXPANSÍVEL: REPETIR DESPESA / LANÇAMENTO (OCR OrganiZe Página 2) */}
              {!initialData && mostrarOpcoesRepeticao && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Repetir{' '}
                    {tipo === 'despesa'
                      ? 'despesa'
                      : tipo === 'receita'
                        ? 'receita'
                        : 'transferência'}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition ${
                        modoRepeticao === 'fixo'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modo_repeticao"
                        checked={modoRepeticao === 'fixo'}
                        onChange={() => setModoRepeticao('fixo')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Lançamento fixo</span>
                    </label>

                    <label
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-xs font-semibold transition ${
                        modoRepeticao === 'parcelado'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modo_repeticao"
                        checked={modoRepeticao === 'parcelado'}
                        onChange={() => setModoRepeticao('parcelado')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Lançamento parcelado</span>
                    </label>
                  </div>

                  {/* CONFIGURAÇÃO DO FIXO (DOIS PASSOS: DURAÇÃO e PERIODICIDADE) */}
                  {modoRepeticao === 'fixo' && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      {/* Passo 1: Duração */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">
                          1º Passo: Duração
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFixoPrazo('indeterminado')}
                            className={`py-1.5 px-3 text-xs font-semibold rounded-md border text-left transition ${
                              fixoPrazo === 'indeterminado'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Indeterminada
                          </button>
                          <button
                            type="button"
                            onClick={() => setFixoPrazo('determinado')}
                            className={`py-1.5 px-3 text-xs font-semibold rounded-md border text-left transition ${
                              fixoPrazo === 'determinado'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Determinada
                          </button>
                        </div>
                        {fixoPrazo === 'indeterminado' ? (
                          <p className="text-[11px] text-slate-500">
                            Gera projeções previsionais até 31 de dezembro do ano subsequente. Não
                            encerra ao final da janela.
                          </p>
                        ) : (
                          <div className="pt-2">
                            <Label htmlFor="lan-fixo-qtd" className="text-xs text-slate-600">
                              Quantidade de ocorrências *
                            </Label>
                            <Input
                              id="lan-fixo-qtd"
                              type="number"
                              min={2}
                              max={120}
                              value={fixoOcorrencias}
                              onChange={(e) =>
                                setFixoOcorrencias(Math.max(2, parseInt(e.target.value, 10) || 2))
                              }
                              className="mt-1 h-8 text-xs w-32"
                            />
                          </div>
                        )}
                      </div>

                      {/* Passo 2: Periodicidade */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">
                          2º Passo: Periodicidade
                        </Label>
                        <Select
                          value={fixoPeriodicidade}
                          onValueChange={(v: PeriodicidadeFixo) => setFixoPeriodicidade(v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white">
                            <SelectValue placeholder="Selecione a periodicidade" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mensal">Mensal</SelectItem>
                            <SelectItem value="semestral">Semestral</SelectItem>
                            <SelectItem value="anual">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* CONFIGURAÇÃO DO PARCELADO (CONTA OU CARTÃO) */}
                  {modoRepeticao === 'parcelado' && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="lan-qtd-parc"
                          className="text-xs font-semibold text-slate-700"
                        >
                          Número de parcelas
                        </Label>
                        {quantidadeParcelas > 1 && valor && (
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                            {quantidadeParcelas}x de{' '}
                            {formatMoneyBRL(
                              parseFloat(valor.replace(/\./g, '').replace(',', '.')) /
                                quantidadeParcelas,
                            )}
                          </span>
                        )}
                      </div>

                      <Select
                        value={quantidadeParcelas.toString()}
                        onValueChange={(v) => setQuantidadeParcelas(parseInt(v, 10))}
                      >
                        <SelectTrigger id="lan-qtd-parc" className="h-9 text-xs bg-white">
                          <SelectValue placeholder="Selecione as parcelas" />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36, 48].map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n}x parcelas mensais consecutivas
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
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
                        orcamentoInfo.disponivel < 0
                          ? 'text-rose-600 font-bold'
                          : 'text-emerald-700'
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

              {/* Regra do toggle "Lançamento pago" (referência OrganiZe OCR Página 1):
                  - O botão de ligar/desligar "Lançamento pago" aparece APENAS para meios de pagamento de Contas Bancárias (e dinheiro).
                  - Para lançamentos fixos, se ligado, marca "pago" apenas a PRIMEIRA ocorrência; as futuras permanecem não pagas aguardando a ação do usuário no mês seguinte.
                  - Para lançamentos únicos, se ligado, marca "pago" direto.
              */}
              {tipo !== 'transferencia' && !pagoComDestino.startsWith('cartao:') && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold text-slate-800">Lançamento pago</Label>
                    <p className="text-[11px] text-slate-500">
                      {modoRepeticao === 'fixo'
                        ? 'Para fixos: marca como paga apenas a primeira ocorrência. As futuras permanecem não pagas.'
                        : 'Se ligado, marca "pago" direto e atualiza o saldo bancário.'}
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
                disabled={salvando || isProcessing}
              >
                Cancelar
              </Button>
              {!initialData && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={salvando || isProcessing}
                  onClick={(e) => handleSubmeter(e, true)}
                  className="text-xs"
                >
                  Salvar e Criar Outro
                </Button>
              )}
              <Button
                type="submit"
                disabled={salvando || isProcessing}
                className={`text-white text-xs ${
                  tipo === 'despesa'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : tipo === 'receita'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {salvando || isProcessing
                  ? 'Salvando...'
                  : initialData
                    ? 'Salvar Alterações'
                    : 'Salvar Lançamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Aviso Bloqueio Fatura Paga dentro do ModalLancamento */}
      <ModalAvisoBloqueioFatura
        open={modalBloqueioOpen}
        onClose={() => {
          setModalBloqueioOpen(false)
          setBloqueioFaturaInfo(null)
        }}
        info={bloqueioFaturaInfo}
      />
    </>
  )
}
