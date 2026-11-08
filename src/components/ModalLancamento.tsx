import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
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
  Scale,
  Lock,
} from 'lucide-react'
import { formatMoneyBRL, formatAnoMesPT, getTodayDateString } from '@/lib/formatters'
import {
  Conta,
  Cartao,
  Categoria,
  Lancamento,
  MeioPagamentoTipo,
  TipoLancamento,
  PeriodicidadeFixo,
  PrazoFixo,
  ModalidadeSaida,
  SubtipoAjuste,
  EfeitoFatura,
} from '@/types/sap'
import { orcamentoService, faturaService, fixoService } from '@/services/sap'
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
  const [data, setData] = useState(() => getTodayDateString())

  // Modalidade da Saída (apenas para despesas, PDF Seção 1 e 2)
  const [modalidadeSaida, setModalidadeSaida] = useState<ModalidadeSaida>('compra_propria')
  const [valorProprio, setValorProprio] = useState('')
  const [erroValorProprio, setErroValorProprio] = useState<string | null>(null)

  // Seletor unificado "Pago com" (despesa) / "Recebido em" (receita)
  // Formato: "conta:<id>" | "cartao:<id>" | "dinheiro:principal"
  const [pagoComDestino, setPagoComDestino] = useState<string>('')

  // Para transferências:
  const [contaOrigemId, setContaOrigemId] = useState('')
  const [contaDestinoId, setContaDestinoId] = useState('')

  // Para Ajustes (PDF Novo Tipo Ajuste):
  const [subtipoAjuste, setSubtipoAjuste] = useState<SubtipoAjuste>('ajuste_fatura_banco')
  const [efeitoFatura, setEfeitoFatura] = useState<EfeitoFatura>('aumenta')
  const [cartaoAjusteId, setCartaoAjusteId] = useState<string>('')

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
  const [buscaSubcategoria, setBuscaSubcategoria] = useState('')
  const [pago, setPago] = useState(true)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [bloqueioFaturaInfo, setBloqueioFaturaInfo] = useState<InfoBloqueioFatura | null>(null)
  const [modalBloqueioOpen, setModalBloqueioOpen] = useState(false)
  const [avisoBloqueioPago, setAvisoBloqueioPago] = useState<string | null>(null)

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

  // Lista de todas as subcategorias para o tipo atual ('despesa' ou 'receita'), ordenadas alfabeticamente
  // REGRA: Subcategorias arquivadas NÃO devem aparecer normalmente como opção para novos lançamentos;
  // Porém se for edição de lançamento histórico que já possuía a subcategoria arquivada, ela é preservada.
  const subcategoriasDisponiveis = React.useMemo(() => {
    if (tipo === 'transferencia' || tipo === 'ajuste') return []
    const catsDoTipo = categorias.filter(
      (c) =>
        (tipo === 'receita' ? c.tipo === 'receita' : c.tipo === 'despesa') &&
        (!c.arquivado || initialData?.categoria_id === c.id),
    )
    const lista: Array<{
      id: string
      nome: string
      categoriaId: string
      categoriaNome: string
      categoriaCor?: string | null
    }> = []

    catsDoTipo.forEach((cat) => {
      if (cat.subcategorias && cat.subcategorias.length > 0) {
        cat.subcategorias.forEach((sub) => {
          // Oculta arquivadas, a menos que seja a própria subcategoria já vinculada ao lançamento em edição
          if (!sub.arquivado || initialData?.subcategoria_id === sub.id) {
            lista.push({
              id: sub.id,
              nome: sub.arquivado ? `${sub.nome} (Arquivada)` : sub.nome,
              categoriaId: cat.id,
              categoriaNome: cat.nome,
              categoriaCor: cat.cor,
            })
          }
        })
      } else {
        // Se a categoria não tem subcategorias cadastradas, gera opção padrão com o próprio nome da categoria
        lista.push({
          id: `cat-fallback-${cat.id}`,
          nome: cat.nome,
          categoriaId: cat.id,
          categoriaNome: cat.nome,
          categoriaCor: cat.cor,
        })
      }
    })

    // Ordenar estritamente em ordem alfabética pelo nome da subcategoria
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
  }, [categorias, tipo, initialData?.subcategoria_id, initialData?.categoria_id])

  // Resetar/Inicializar formulário
  useEffect(() => {
    if (!open) return

    setBuscaSubcategoria('')

    if (initialData) {
      setTipo(initialData.tipo)
      setDescricao(initialData.descricao || '')
      setValor(initialData.valor ? Math.abs(initialData.valor).toFixed(2).replace('.', ',') : '')
      setData(initialData.data || getTodayDateString())
      setSubtipoAjuste((initialData.subtipo_ajuste as SubtipoAjuste) || 'ajuste_fatura_banco')
      setEfeitoFatura((initialData.efeito_fatura as EfeitoFatura) || 'aumenta')
      if (initialData.cartao_id) {
        setCartaoAjusteId(initialData.cartao_id)
      } else if (cartaoPadraoId) {
        setCartaoAjusteId(cartaoPadraoId)
      } else if (cartoes.length > 0) {
        setCartaoAjusteId(cartoes[0].id)
      }

      // Modalidade existente do lançamento em edição
      const modExistente = (initialData.modalidade_saida as ModalidadeSaida) || 'compra_propria'
      setModalidadeSaida(modExistente)
      if (
        modExistente === 'compra_compartilhada' &&
        initialData.valor_proprio !== undefined &&
        initialData.valor_proprio !== null
      ) {
        setValorProprio(Number(initialData.valor_proprio).toFixed(2).replace('.', ','))
      } else {
        setValorProprio('')
      }
      setErroValorProprio(null)

      if (initialData.cartao_id || initialData.meio_pagamento_tipo === 'CARTAO') {
        const cId =
          initialData.cartao_id || cartaoPadraoId || (cartoes.length > 0 ? cartoes[0].id : '')
        // Se for empréstimo a terceiros, não permite cartão!
        if (modExistente === 'emprestimo_terceiros') {
          if (contas.length > 0) setPagoComDestino(`conta:${contas[0].id}`)
          else setPagoComDestino('dinheiro:principal')
        } else {
          setPagoComDestino(`cartao:${cId}`)
        }
      } else if (initialData.conta_origem_id || initialData.meio_pagamento_tipo === 'CONTA') {
        const cOrigem = initialData.conta_origem_id || (contas.length > 0 ? contas[0].id : '')
        setPagoComDestino(`conta:${cOrigem}`)
      } else if (initialData.meio_pagamento_tipo === 'DINHEIRO') {
        setPagoComDestino('dinheiro:principal')
      } else {
        setPagoComDestino(getValorPadraoOrigem())
      }

      setContaOrigemId(initialData.conta_origem_id || (contas.length > 0 ? contas[0].id : ''))
      setContaDestinoId(initialData.conta_destino_id || (contas.length > 1 ? contas[1].id : ''))
      setCategoriaId(initialData.categoria_id || '')
      setSubcategoriaId(
        initialData.subcategoria_id ||
          (initialData.categoria_id ? `cat-fallback-${initialData.categoria_id}` : ''),
      )
      setPago(initialData.status_pagamento === 'pago')
      setObservacao(initialData.observacao || '')
      // Se for lançamento com parcelas, limpa eventual sufixo '(x/y)' do título
      const descLimpa = (initialData.descricao || '').replace(/\s*\(\d+\/\d+\)$/, '').trim()
      setDescricao(descLimpa)
      setQuantidadeParcelas(initialData.total_parcelas || initialData.quantidade_parcelas || 1)
      if (initialData.regime === 'fixo' || initialData.serie_id) {
        setModoRepeticao('fixo')
        setMostrarOpcoesRepeticao(false)
        if (initialData.serie_id && workspaceId) {
          fixoService.getSerieById(initialData.serie_id, workspaceId).then((serie) => {
            if (serie) {
              if (serie.prazo === 'determinado' || serie.prazo === 'indeterminado') {
                setFixoPrazo(serie.prazo)
              }
              if (serie.quantidade_total) {
                setFixoOcorrencias(serie.quantidade_total)
              }
              if (
                serie.periodicidade === 'mensal' ||
                serie.periodicidade === 'semestral' ||
                serie.periodicidade === 'anual'
              ) {
                setFixoPeriodicidade(serie.periodicidade)
              }
            }
          })
        }
      } else if (
        initialData.regime === 'parcelado' ||
        (initialData.quantidade_parcelas && initialData.quantidade_parcelas > 1)
      ) {
        setModoRepeticao('parcelado')
        setMostrarOpcoesRepeticao(false)
      } else {
        setModoRepeticao('nenhum')
        setMostrarOpcoesRepeticao(false)
      }
    } else {
      setTipo(tipoPadrao)
      setDescricao('')
      setValor('')
      setData(dataPadrao || getTodayDateString())
      setModalidadeSaida('compra_propria')
      setValorProprio('')
      setErroValorProprio(null)
      if (cartaoPadraoId) {
        setPagoComDestino(`cartao:${cartaoPadraoId}`)
      } else {
        setPagoComDestino(getValorPadraoOrigem())
      }
      setContaOrigemId(contas.length > 0 ? contas[0].id : '')
      setContaDestinoId(contas.length > 1 ? contas[1].id : '')
      setCategoriaId('')
      setSubcategoriaId('')
      setPago(true)
      setObservacao('')
      setQuantidadeParcelas(1)
      setMostrarOpcoesRepeticao(false)
      // Requisito: botões "Lançamento fixo" e "Lançamento parcelado" iniciam desmarcados ao abrir o painel
      setModoRepeticao('nenhum')
      setFixoPrazo('indeterminado')
      setFixoOcorrencias(12)
      setFixoPeriodicidade('mensal')
    }
    setAvisoBloqueioPago(null)
  }, [open, initialData, tipoPadrao, cartaoPadraoId, dataPadrao])

  // Ajustar categoria/subcategoria ao mudar tipo
  useEffect(() => {
    if (tipo === 'transferencia') {
      setCategoriaId('')
      setSubcategoriaId('')
    }
  }, [tipo])
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

  // Subcategorias filtradas pelo termo digitado pelo usuário (mantendo ordem alfabética)
  const subcategoriasFiltradas = React.useMemo(() => {
    if (!buscaSubcategoria.trim()) return subcategoriasDisponiveis
    const termo = buscaSubcategoria.toLowerCase().trim()
    return subcategoriasDisponiveis.filter(
      (s) => s.nome.toLowerCase().includes(termo) || s.categoriaNome.toLowerCase().includes(termo),
    )
  }, [subcategoriasDisponiveis, buscaSubcategoria])

  // Handler de seleção da Subcategoria (vincula categoria automaticamente)
  const handleSelecionarSubcategoria = (subId: string) => {
    setSubcategoriaId(subId)
    const encontrada = subcategoriasDisponiveis.find((s) => s.id === subId)
    if (encontrada) {
      setCategoriaId(encontrada.categoriaId)
    }
  }

  const handleSubmeter = async (e: React.FormEvent, criarOutro = false) => {
    e.preventDefault()

    if (!descricao.trim()) {
      return
    }

    // Validação de subcategoria obrigatória (PDF Seções 5.3 e 6.5: não exigir em compra para terceiros e empréstimo a terceiros; não exigir em Ajuste)
    const dispensaSubcategoria =
      tipo === 'ajuste' ||
      (tipo === 'despesa' &&
        (modalidadeSaida === 'compra_terceiros' || modalidadeSaida === 'emprestimo_terceiros'))

    if (tipo !== 'transferencia' && tipo !== 'ajuste' && !dispensaSubcategoria && !subcategoriaId) {
      return
    }

    // REGRA BLOCO B (Teste 13): Bloqueio de alteração em lançamento ÚNICO pago
    const ehUnico =
      modoRepeticao === 'nenhum' &&
      (!initialData?.regime || initialData?.regime === 'unico') &&
      !initialData?.serie_id
    const estaPago = initialData?.status_pagamento === 'pago'
    const ehCartao =
      initialData?.meio_pagamento_tipo === 'CARTAO' || pagoComDestino.startsWith('cartao:')
    if (initialData?.id && estaPago && !ehCartao && ehUnico) {
      setAvisoBloqueioPago(
        'Este lançamento está pago. É necessário desfazer o pagamento para alterar ou excluir.',
      )
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

    // Validações de Modalidade da Saída e Impactos
    let valorProprioFinal: number = valorNumerico
    let valorTerceirosFinal: number = 0
    let afetaResultadoFinal = true
    let afetaOrcamentoFinal = true

    if (tipo === 'ajuste') {
      meioFinal = 'CARTAO'
      resolvedCartaoId = cartaoAjusteId || (cartoes.length > 0 ? cartoes[0].id : null)
      if (!resolvedCartaoId) {
        return
      }
      // Regras de afeta_resultado e afeta_orcamento para Ajuste:
      // Ajuste Banco: Afeta Resultado SIM, Afeta Orçamento NÃO
      // Ajuste Técnico: Afeta Resultado NÃO, Afeta Orçamento NÃO
      if (subtipoAjuste === 'ajuste_fatura_banco') {
        afetaResultadoFinal = true
        afetaOrcamentoFinal = false
      } else {
        afetaResultadoFinal = false
        afetaOrcamentoFinal = false
      }
    } else if (tipo === 'transferencia') {
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

    if (tipo === 'despesa') {
      if (modalidadeSaida === 'compra_compartilhada') {
        const vpNum = parseFloat(valorProprio.replace(/\./g, '').replace(',', '.'))
        if (!vpNum || isNaN(vpNum) || vpNum <= 0) {
          setErroValorProprio('Informe o Valor Próprio maior que zero.')
          return
        }
        if (vpNum >= valorNumerico) {
          setErroValorProprio('O Valor Próprio deve ser menor que o Valor Total.')
          return
        }
        valorProprioFinal = vpNum
        valorTerceirosFinal = Number((valorNumerico - vpNum).toFixed(2))
        afetaResultadoFinal = true
        afetaOrcamentoFinal = true
      } else if (modalidadeSaida === 'compra_terceiros') {
        valorProprioFinal = 0
        valorTerceirosFinal = valorNumerico
        afetaResultadoFinal = false
        afetaOrcamentoFinal = false
      } else if (modalidadeSaida === 'emprestimo_terceiros') {
        if (meioFinal === 'CARTAO') {
          return
        }
        valorProprioFinal = 0
        valorTerceirosFinal = valorNumerico
        afetaResultadoFinal = false
        afetaOrcamentoFinal = false
      } else {
        // compra_propria
        valorProprioFinal = valorNumerico
        valorTerceirosFinal = 0
        afetaResultadoFinal = true
        afetaOrcamentoFinal = true
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
          categoria_id: tipo !== 'transferencia' && tipo !== 'ajuste' ? categoriaId || null : null,
          subcategoria_id:
            tipo !== 'transferencia' &&
            tipo !== 'ajuste' &&
            subcategoriaId &&
            !subcategoriaId.startsWith('cat-fallback-')
              ? subcategoriaId
              : null,
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
          modalidade_saida: tipo === 'despesa' ? modalidadeSaida : 'compra_propria',
          valor_proprio: valorProprioFinal,
          valor_terceiros: valorTerceirosFinal,
          afeta_resultado: afetaResultadoFinal,
          afeta_orcamento: afetaOrcamentoFinal,
          subtipo_ajuste: tipo === 'ajuste' ? subtipoAjuste : null,
          efeito_fatura: tipo === 'ajuste' ? efeitoFatura : null,
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-xl">
          <form onSubmit={(e) => handleSubmeter(e, false)}>
            <DialogHeader className="pb-2 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                {tipo === 'despesa' && <TrendingDown className="w-5 h-5 text-rose-600" />}
                {tipo === 'receita' && <TrendingUp className="w-5 h-5 text-emerald-600" />}
                {tipo === 'transferencia' && <ArrowRightLeft className="w-5 h-5 text-blue-600" />}
                <span>
                  {initialData ? 'Editar Lançamento' : `Novo Lançamento — ${tipo.toUpperCase()}`}
                </span>
              </DialogTitle>
            </DialogHeader>
            {/* BLOCO B: Aviso de bloqueio de lançamento pago (formato idêntico aos recorrentes) */}
            {avisoBloqueioPago && (
              <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-start gap-2 text-amber-900 font-semibold text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>Lançamento pago — alteração e exclusão bloqueadas</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed pl-6">{avisoBloqueioPago}</p>
                <div className="text-[11px] text-slate-600 bg-white/70 p-2 rounded-lg border border-amber-200/60 pl-3">
                  💡 <strong>Como proceder:</strong> Retorne à lista de lançamentos e clique no
                  ícone de positivo (joia) para desfazer o pagamento deste lançamento antes de
                  alterar ou excluir.
                </div>
              </div>
            )}
            {/* Abas para alternar tipo de lançamento se for novo */}{' '}
            {!initialData && (
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg mt-3">
                <button
                  type="button"
                  onClick={() => setTipo('despesa')}
                  className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 transition ${
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
                  className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 transition ${
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
                  className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 transition ${
                    tipo === 'transferencia'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Transferência</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipo('ajuste')
                    if (!cartaoAjusteId) {
                      if (cartaoPadraoId) setCartaoAjusteId(cartaoPadraoId)
                      else if (cartoes.length > 0) setCartaoAjusteId(cartoes[0].id)
                    }
                  }}
                  className={`py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1 transition ${
                    tipo === 'ajuste'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Ajuste</span>
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

              {/* SEÇÃO ESPECÍFICA PARA AJUSTE */}
              {tipo === 'ajuste' && (
                <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-purple-700" />
                      <span>Configurações do Lançamento de Ajuste</span>
                    </span>
                    <span className="text-[11px] text-purple-700 font-medium">
                      Exclusivo de Fatura
                    </span>
                  </div>

                  {/* 1. Tipo de Ajuste */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Tipo de Ajuste *
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-2.5 ${
                          subtipoAjuste === 'ajuste_fatura_banco'
                            ? 'bg-white border-purple-400 shadow-xs ring-1 ring-purple-300'
                            : 'bg-white/80 border-slate-200 hover:bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="subtipo_ajuste"
                          value="ajuste_fatura_banco"
                          checked={subtipoAjuste === 'ajuste_fatura_banco'}
                          onChange={() => setSubtipoAjuste('ajuste_fatura_banco')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold text-slate-900">
                            Ajuste da Fatura do Banco
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Encargos, juros, tarifas, estornos ou créditos lançados pelo emissor
                          </div>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-2.5 ${
                          subtipoAjuste === 'ajuste_tecnico_sap'
                            ? 'bg-white border-purple-400 shadow-xs ring-1 ring-purple-300'
                            : 'bg-white/80 border-slate-200 hover:bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="subtipo_ajuste"
                          value="ajuste_tecnico_sap"
                          checked={subtipoAjuste === 'ajuste_tecnico_sap'}
                          onChange={() => setSubtipoAjuste('ajuste_tecnico_sap')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold text-slate-900">
                            Ajuste Técnico do SAP
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Arredondamento, conciliação de centavos ou correção de saldo da fatura
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* 2. Efeito sobre a fatura */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Efeito sobre a fatura * (usuário sempre informa valor positivo)
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-2.5 ${
                          efeitoFatura === 'aumenta'
                            ? 'bg-rose-50 border-rose-300 shadow-xs ring-1 ring-rose-200'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="efeito_fatura"
                          value="aumenta"
                          checked={efeitoFatura === 'aumenta'}
                          onChange={() => setEfeitoFatura('aumenta')}
                          className="mt-0.5 text-rose-600 focus:ring-rose-500"
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold text-rose-800">
                            + Aumenta a fatura (Débito)
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Soma na fatura e no comprometimento
                          </div>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-2.5 ${
                          efeitoFatura === 'reduz'
                            ? 'bg-emerald-50 border-emerald-300 shadow-xs ring-1 ring-emerald-200'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="efeito_fatura"
                          value="reduz"
                          checked={efeitoFatura === 'reduz'}
                          onChange={() => setEfeitoFatura('reduz')}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold text-emerald-800">
                            − Reduz a fatura (Crédito)
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Subtrai da fatura e do comprometimento
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* 3. Invariantes visíveis e desabilitadas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-purple-200">
                    <div className="p-2 bg-white rounded border border-purple-100 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">
                        Afeta Fatura
                      </div>
                      <div className="text-xs font-bold text-purple-700">Sim (100%)</div>
                    </div>
                    <div className="p-2 bg-white rounded border border-purple-100 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">
                        Comprometimento
                      </div>
                      <div className="text-xs font-bold text-purple-700">Sim (100%)</div>
                    </div>
                    <div className="p-2 bg-white rounded border border-purple-100 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">
                        Afeta Resultado
                      </div>
                      <div
                        className={`text-xs font-bold ${
                          subtipoAjuste === 'ajuste_fatura_banco'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {subtipoAjuste === 'ajuste_fatura_banco' ? 'Sim' : 'Não'}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded border border-purple-100 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">
                        Afeta Orçamento
                      </div>
                      <div className="text-xs font-bold text-slate-500">Não</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data | Modalidade da Saída (para despesa) ou Pago com / Recebido em ou Cartão (para ajuste) */}
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
                      className="text-xs pr-10 text-slate-900 bg-white border-slate-300 font-medium focus:border-slate-500 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80"
                    />
                    <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 bg-slate-100 p-1 rounded border border-slate-200">
                      <Calendar className="w-4 h-4 text-slate-800 stroke-[2.5]" />
                    </div>
                  </div>
                </div>

                {tipo === 'ajuste' ? (
                  <div>
                    <Label
                      htmlFor="lan-cartao-ajuste"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>Cartão de Crédito *</span>
                      <span className="text-[10px] text-purple-600 font-normal">
                        obrigatório para ajuste
                      </span>
                    </Label>
                    <Select value={cartaoAjusteId} onValueChange={setCartaoAjusteId} required>
                      <SelectTrigger id="lan-cartao-ajuste" className="mt-1 text-xs bg-white">
                        <SelectValue placeholder="Selecione o cartão de crédito" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {cartoes.map((c) => (
                          <SelectItem key={`ajuste-cartao:${c.id}`} value={c.id}>
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>{c.nome}</span>
                              <span className="text-slate-400 text-[11px]">
                                (Fecha dia {c.dia_fechamento})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : tipo === 'despesa' ? (
                  <div>
                    <Label
                      htmlFor="lan-modalidade"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>Modalidade da Saída *</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        define impacto e partilha
                      </span>
                    </Label>
                    <Select
                      value={modalidadeSaida}
                      onValueChange={(val: ModalidadeSaida) => {
                        setModalidadeSaida(val)
                        setErroValorProprio(null)
                        // Se selecionou empréstimo a terceiros e meio atual for cartão, redefinir para conta ou dinheiro
                        if (
                          val === 'emprestimo_terceiros' &&
                          pagoComDestino.startsWith('cartao:')
                        ) {
                          if (contas.length > 0) setPagoComDestino(`conta:${contas[0].id}`)
                          else setPagoComDestino('dinheiro:principal')
                        }
                        // Se for compartilhada e ainda não preencheu valor próprio, deixa limpo
                        if (val === 'compra_compartilhada' && !valorProprio && valor) {
                          const valNum = parseFloat(valor.replace(/\./g, '').replace(',', '.'))
                          if (valNum > 0) {
                            // sugestão de metade arredondada
                            const metade = Math.round((valNum / 2) * 100) / 100
                            setValorProprio(metade.toFixed(2).replace('.', ','))
                          }
                        }
                      }}
                    >
                      <SelectTrigger
                        id="lan-modalidade"
                        className="mt-1 text-xs bg-white text-slate-900 border-slate-300 font-semibold"
                      >
                        <SelectValue placeholder="Selecione a modalidade" />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
                        <SelectItem value="compra_propria">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-semibold text-slate-900">Compra Própria</span>
                            <span className="text-[11px] text-slate-500">
                              100% consumo próprio (padrão)
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="compra_compartilhada">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-semibold text-blue-700">
                              Compra Compartilhada
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Parte minha e parte a receber de terceiros
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="compra_terceiros">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-semibold text-amber-700">
                              Compra para Terceiros
                            </span>
                            <span className="text-[11px] text-slate-500">
                              100% em benefício de terceiros
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="emprestimo_terceiros">
                          <div className="flex flex-col text-left py-0.5">
                            <span className="font-semibold text-purple-700">
                              Empréstimo a Terceiros
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Saída financeira por empréstimo concedido
                            </span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : tipo !== 'transferencia' ? (
                  <div>
                    <Label
                      htmlFor="lan-recebido-em"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>Recebido em *</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        vincula meio automaticamente
                      </span>
                    </Label>
                    <Select value={pagoComDestino} onValueChange={setPagoComDestino}>
                      <SelectTrigger id="lan-recebido-em" className="mt-1 text-xs">
                        <SelectValue placeholder="Selecione conta ou dinheiro" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
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

              {/* Se for Despesa, linha de Pago com | Repetir/Anexos (PDF Seção 2) */}
              {tipo === 'despesa' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="lan-pago-com-despesa"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>Pago com *</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        vincula meio automaticamente
                      </span>
                    </Label>
                    <Select value={pagoComDestino} onValueChange={setPagoComDestino}>
                      <SelectTrigger id="lan-pago-com-despesa" className="mt-1 text-xs bg-white">
                        <SelectValue placeholder="Selecione conta, cartão ou dinheiro" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {/* Grupo: Contas Bancárias (filtra cartões) */}
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

                        {/* Cartões de crédito: OCULTADOS E NÃO PERMITIDOS quando modalidade for Empréstimo a Terceiros (PDF Seção 6.3) */}
                        {modalidadeSaida !== 'emprestimo_terceiros' && cartoes.length > 0 && (
                          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            Cartões de Crédito
                          </div>
                        )}
                        {modalidadeSaida !== 'emprestimo_terceiros' &&
                          cartoes.map((c) => (
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

                  <div className="flex flex-col justify-end">
                    {/* Barra de Ações: Repetir / Anexos / Tags */}
                    {modalidadeSaida !== 'emprestimo_terceiros' ? (
                      <div className="flex items-center gap-2 py-0.5">
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
                    ) : (
                      <div className="text-[11px] text-slate-400 italic py-2">
                        Repetição desabilitada para Empréstimo a Terceiros
                      </div>
                    )}
                  </div>
                </div>
              )}

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

              {/* Se for Receita, exibe a barra de ícones de repetição aqui (já que despesa tem em Pago com | Repetir) */}
              {tipo === 'receita' && (
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
              {mostrarOpcoesRepeticao && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Repetir{' '}
                      {tipo === 'despesa'
                        ? 'despesa'
                        : tipo === 'receita'
                          ? 'receita'
                          : 'transferência'}
                    </span>
                    {modoRepeticao !== 'nenhum' && (
                      <button
                        type="button"
                        onClick={() => setModoRepeticao('nenhum')}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition"
                      >
                        Voltar a Lançamento Único
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        // Clicar de novo no mesmo botão desmarca e volta a LANÇAMENTO ÚNICO sem efeito residual
                        setModoRepeticao((prev) => (prev === 'fixo' ? 'nenhum' : 'fixo'))
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs font-semibold text-left transition select-none ${
                        modoRepeticao === 'fixo'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs ring-1 ring-emerald-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          modoRepeticao === 'fixo'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-400 bg-white'
                        }`}
                      >
                        {modoRepeticao === 'fixo' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span>Lançamento fixo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        // Clicar de novo no mesmo botão desmarca e volta a LANÇAMENTO ÚNICO sem efeito residual
                        setModoRepeticao((prev) => (prev === 'parcelado' ? 'nenhum' : 'parcelado'))
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs font-semibold text-left transition select-none ${
                        modoRepeticao === 'parcelado'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-xs ring-1 ring-indigo-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          modoRepeticao === 'parcelado'
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-400 bg-white'
                        }`}
                      >
                        {modoRepeticao === 'parcelado' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span>Lançamento parcelado</span>
                    </button>
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

                      {/* BLOCO 5 (Teste 9): Alerta vermelho quando regime === 'parcelado' E meio de pagamento !== cartão */}
                      {pagoComDestino && !pagoComDestino.startsWith('cartao:') && (
                        <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-xs font-medium leading-relaxed">
                          A função de parcelamento em conta movimento não está ativa por implicações
                          em "Orçamento" - Mude para Lançamento Fixo Determinado, no campo valor*
                          informe o valor da parcela (valor total divido pela quantidade) e em
                          quantidade de ocorrencias* informe a quantidade de parcelas
                        </div>
                      )}
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

              {/* REQUISITO: Somente SUBCATEGORIA no modal (Categoria oculta e vinculada automaticamente) */}
              {/* C1: Ocultar completamente Subcategoria quando Tipo = 'transferencia' OU Tipo = 'ajuste' */}
              {/* PDF Seções 5.3 e 6.5: Subcategoria OCULTADA/DESABILITADA para Compra para Terceiros e Empréstimo a Terceiros */}
              {tipo !== 'transferencia' &&
                tipo !== 'ajuste' &&
                (tipo !== 'despesa' ||
                  (modalidadeSaida !== 'compra_terceiros' &&
                    modalidadeSaida !== 'emprestimo_terceiros')) && (
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="lan-subcat" className="text-xs font-semibold text-slate-700">
                        Subcategoria *
                      </Label>
                      {categoriaId && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          Categoria vinculada:{' '}
                          <strong className="text-slate-800">
                            {categorias.find((c) => c.id === categoriaId)?.nome}
                          </strong>
                        </span>
                      )}
                    </div>

                    <Select value={subcategoriaId} onValueChange={handleSelecionarSubcategoria}>
                      <SelectTrigger
                        id="lan-subcat"
                        className="mt-1 text-xs bg-white text-slate-900 border-slate-300 font-medium"
                      >
                        <SelectValue placeholder="Selecione a subcategoria obrigatória (*)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 bg-white text-slate-900 border-slate-200">
                        {/* Campo de filtro DIGITÁVEL */}
                        <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                          <div className="relative">
                            <Input
                              type="text"
                              value={buscaSubcategoria}
                              onChange={(e) => setBuscaSubcategoria(e.target.value)}
                              placeholder="Filtrar categoria ou subcategoria..."
                              title="Digite para filtrar a lista pela categoria ou subcategoria"
                              className="h-8 text-xs bg-slate-50 text-slate-900 border-slate-200"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>

                        {subcategoriasFiltradas.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            Nenhuma subcategoria encontrada
                          </div>
                        ) : (
                          subcategoriasFiltradas.map((s) => (
                            <SelectItem
                              key={s.id}
                              value={s.id}
                              className="text-xs cursor-pointer py-2"
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="font-semibold text-slate-900">{s.nome}</span>
                                <span className="text-[11px] text-slate-400 font-normal">
                                  ({s.categoriaNome})
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {!subcategoriaId && (
                      <p className="text-[11px] text-rose-500 mt-1">
                        * Campo obrigatório para categorização do fluxo financeiro
                      </p>
                    )}
                  </div>
                )}

              {/* CAMPOS ADICIONAIS CONFORME MODALIDADE DA SAÍDA (PDF Seções 2, 4.1 e 5.1) */}
              {tipo === 'despesa' && modalidadeSaida === 'compra_compartilhada' && (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
                      <span>👥 Divisão da Compra Compartilhada</span>
                    </span>
                    <span className="text-[11px] text-blue-700">Total = Próprio + Terceiros</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Valor Total: somente leitura, espelhando o valor principal */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">Valor Total</Label>
                      <div className="mt-1 h-9 px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs font-bold text-slate-700 flex items-center">
                        {valor ? `R$ ${valor}` : 'R$ 0,00'}
                      </div>
                      <span className="text-[10px] text-slate-400">somente leitura</span>
                    </div>

                    {/* Valor Próprio: editável pelo usuário */}
                    <div>
                      <Label
                        htmlFor="lan-val-proprio"
                        className="text-xs font-semibold text-blue-900"
                      >
                        Valor Próprio * (Minha parte)
                      </Label>
                      <div className="mt-1">
                        <ValorCalculadoraInput
                          id="lan-val-proprio"
                          value={valorProprio}
                          onChange={(v) => {
                            setValorProprio(v)
                            setErroValorProprio(null)
                          }}
                          placeholder="0,00"
                          className="border-blue-300 focus:border-blue-500 bg-white"
                        />
                      </div>
                      <span className="text-[10px] text-blue-600">0 &lt; Próprio &lt; Total</span>
                    </div>

                    {/* Valor de Terceiros: somente leitura, calculado automaticamente = Total - Próprio */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">
                        Valor de Terceiros (A receber)
                      </Label>
                      {(() => {
                        const totalNum = parseFloat(valor.replace(/\./g, '').replace(',', '.')) || 0
                        const proprioNum =
                          parseFloat(valorProprio.replace(/\./g, '').replace(',', '.')) || 0
                        const terceirosNum = Math.max(0, totalNum - proprioNum)
                        return (
                          <div className="mt-1 h-9 px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs font-bold text-slate-700 flex items-center">
                            {formatMoneyBRL(terceirosNum)}
                          </div>
                        )
                      })()}
                      <span className="text-[10px] text-slate-400">calculado: Total − Próprio</span>
                    </div>
                  </div>

                  {erroValorProprio && (
                    <div className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-md p-2">
                      ⚠️ {erroValorProprio}
                    </div>
                  )}

                  <div className="text-[11px] text-blue-800 bg-white/70 p-2 rounded-lg border border-blue-200/60 leading-relaxed">
                    💡 <strong>Impacto:</strong> Apenas o <strong>Valor Próprio</strong> consumirá o
                    seu <strong>Orçamento</strong> e o <strong>Resumo do Período</strong>. Se pago
                    no cartão de crédito, faturas e parcelas utilizam o Valor Total normalmente.
                  </div>
                </div>
              )}

              {tipo === 'despesa' && modalidadeSaida === 'compra_terceiros' && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                      <span>👤 Compra para Terceiros</span>
                    </span>
                    <span className="text-[11px] text-amber-700 font-semibold">
                      Não afeta Resultado nem Orçamento
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">Valor Total</Label>
                      <div className="mt-1 h-9 px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs font-bold text-slate-700 flex items-center">
                        {valor ? `R$ ${valor}` : 'R$ 0,00'}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-amber-900">
                        Valor de Terceiros (A receber)
                      </Label>
                      <div className="mt-1 h-9 px-3 py-2 bg-amber-100/60 border border-amber-300 rounded-md text-xs font-bold text-amber-900 flex items-center">
                        {valor ? `R$ ${valor}` : 'R$ 0,00'}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-900 bg-white/80 p-2 rounded-lg border border-amber-200/60 leading-relaxed">
                    💡 Subcategoria dispensada (não constitui despesa própria). Valor Próprio = R$
                    0,00. Cartão de crédito permitido pelo valor integral.
                  </div>
                </div>
              )}

              {tipo === 'despesa' && modalidadeSaida === 'emprestimo_terceiros' && (
                <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
                      <span>👤 Empréstimo a Terceiros</span>
                    </span>
                    <span className="text-[11px] text-purple-700 font-semibold">
                      Não afeta Resultado nem Orçamento
                    </span>
                  </div>
                  <p className="text-xs text-purple-900 leading-relaxed">
                    Representa saída financeira por empréstimo concedido. Cartões e repetição
                    desabilitados. Subcategoria não exigida. Valor Próprio = R$ 0,00; Valor a
                    Receber = Valor Total.
                  </p>
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

              {/* Informação da competência da fatura quando for ajuste */}
              {tipo === 'ajuste' &&
                cartaoAjusteId &&
                (() => {
                  const cObj = cartoes.find((c) => c.id === cartaoAjusteId)
                  if (!cObj) return null
                  const compCalc = faturaService.calcularCompetenciaCartao(
                    data,
                    cObj.dia_fechamento,
                    cObj.dia_vencimento,
                  )
                  return (
                    <div className="text-xs font-medium text-purple-800 bg-purple-100/70 border border-purple-200 rounded-md px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 shrink-0 text-purple-700" />
                        <span>
                          Fatura impactada: <strong>{formatAnoMesPT(compCalc)}</strong> ({cObj.nome}
                          )
                        </span>
                      </div>
                      <span className="text-[11px] text-purple-600">
                        {efeitoFatura === 'aumenta' ? '+ Aumenta fatura' : '− Reduz fatura'}
                      </span>
                    </div>
                  )
                })()}

              {/* Regra do toggle "Lançamento pago" (Passo 2 e referência OrganiZe):
                  - O botão de ligar/desligar "Lançamento pago" aparece para Contas Bancárias (incluindo Transferências) e Dinheiro.
                  - NÃO aparece quando o meio for cartão de crédito (quitado via fatura) e NUNCA para Ajustes.
                  - Para lançamentos fixos, se ligado, marca "pago" apenas a PRIMEIRA ocorrência; as futuras permanecem não pagas aguardando a ação do usuário no mês seguinte.
                  - Para lançamentos únicos ou transferências, se ligado, movimenta saldos imediatamente. Se desligado, fica pendente sem movimentar.
              */}
              {tipo !== 'ajuste' &&
                (tipo === 'transferencia' || !pagoComDestino.startsWith('cartao:')) && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold text-slate-800">
                        Lançamento pago
                      </Label>
                      <p className="text-[11px] text-slate-500">
                        {modoRepeticao === 'fixo'
                          ? 'Para fixos: marca como paga apenas a primeira ocorrência. As futuras permanecem não pagas.'
                          : tipo === 'transferencia'
                            ? 'Se ligado, efetiva a transferência debitando a origem e creditando o destino.'
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
                      : tipo === 'ajuste'
                        ? 'bg-purple-600 hover:bg-purple-700'
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
