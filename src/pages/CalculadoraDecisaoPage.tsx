import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { cartaoService } from '@/services/sap'
import { cotacoesService, CotacoesCalculadora } from '@/services/cotacoes'
import { Cartao } from '@/types/sap'
import {
  calcularSimulacao,
  compararParcelamentos,
  ResultadoSimulacao,
  CenariosComparativosItem,
  ParametrosSimulacao,
} from '@/lib/calculadoraDecisao'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Calculator,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  CreditCard,
  QrCode,
  ArrowRight,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react'

// Classificação comportamental (ordem exata: Supérfluo / Discricionário / Ajustável / Essencial)
type ClassificacaoComportamental = 'Superfluo' | 'Discricionario' | 'Ajustavel' | 'Essencial'
type RespostaDesembolso = 'Sim' | 'Nao' | 'NaoTenhoCerteza'

export function CalculadoraDecisaoPage() {
  const { currentWorkspace } = useAuth()
  const wsId =
    currentWorkspace?.workspace_id || localStorage.getItem('sap_active_workspace_id') || ''

  // BLOCO 0: Perguntas comportamentais (Etapas 1 e 2)
  const [classificacao, setClassificacao] = useState<ClassificacaoComportamental | ''>('')
  const [fariaNoPix, setFariaNoPix] = useState<RespostaDesembolso | ''>('')
  const [etapaLiberada, setEtapaLiberada] = useState(false)

  // Cartões do Workspace
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>('')
  const [loadingCartoes, setLoadingCartoes] = useState(false)

  // Cotações oficiais
  const [cotacoes, setCotacoes] = useState<CotacoesCalculadora | null>(null)
  const [loadingCotacoes, setLoadingCotacoes] = useState(false)
  const [painelPremissasAberto, setPainelPremissasAberto] = useState(false)
  const [memoriaAberta, setMemoriaAberta] = useState(false)

  // Inputs Financeiros (Etapa 3)
  const [precoPixInput, setPrecoPixInput] = useState<string>('4.800,00')
  const [precoCartaoInput, setPrecoCartaoInput] = useState<string>('5.000,00')
  const [nParcelasInput, setNParcelasInput] = useState<string>('10')
  const [dataCompraInput, setDataCompraInput] = useState<string>(() => {
    const hoje = new Date()
    return hoje.toISOString().split('T')[0]
  })

  // Premissas editáveis
  const [dolarManual, setDolarManual] = useState<string>('5,30')
  const [cdiAnualPercentManual, setCdiAnualPercentManual] = useState<string>('13,75')
  const [percentualCDIInput, setPercentualCDIInput] = useState<string>('100')
  const [milheiroManual, setMilheiroManual] = useState<string>('20,00')
  const [pontosPorDolarManual, setPontosPorDolarManual] = useState<string>('0')

  // Carregar dados iniciais
  useEffect(() => {
    async function init() {
      if (!wsId) return
      setLoadingCartoes(true)
      try {
        const lista = await cartaoService.list(wsId)
        setCartoes(lista)
        if (lista.length > 0 && !cartaoSelecionadoId) {
          setCartaoSelecionadoId(lista[0].id)
          setPontosPorDolarManual(String(lista[0].pontos_por_dolar || 0).replace('.', ','))
        }
      } catch (err) {
        console.warn('Erro ao carregar cartões:', err)
      } finally {
        setLoadingCartoes(false)
      }
    }
    init()
  }, [wsId])

  // Carregar cotações BCB
  const carregarCotacoes = async () => {
    setLoadingCotacoes(true)
    try {
      const dados = await cotacoesService.obterCotacoes()
      setCotacoes(dados)
      setDolarManual(dados.dolar.valor.toFixed(2).replace('.', ','))
      setCdiAnualPercentManual((dados.cdiAnual.valor * 100).toFixed(2).replace('.', ','))
    } catch (err) {
      console.warn('Erro ao carregar cotações:', err)
    } finally {
      setLoadingCotacoes(false)
    }
  }

  useEffect(() => {
    carregarCotacoes()
  }, [])

  // Atualizar pontos ao trocar de cartão
  const cartaoAtual = useMemo(() => {
    return cartoes.find((c) => c.id === cartaoSelecionadoId) || cartoes[0] || null
  }, [cartoes, cartaoSelecionadoId])

  useEffect(() => {
    if (cartaoAtual) {
      setPontosPorDolarManual(String(cartaoAtual.pontos_por_dolar || 0).replace('.', ','))
    }
  }, [cartaoAtual])

  // Parse numérico de strings PT-BR
  const parseValor = (str: string): number => {
    if (!str) return 0
    const clean = str.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(clean)
    return isNaN(n) ? 0 : n
  }

  // Parâmetros da Simulação
  const parametros = useMemo<ParametrosSimulacao>(() => {
    const pPix = parseValor(precoPixInput)
    const pCartao = parseValor(precoCartaoInput)
    const nParc = parseInt(nParcelasInput, 10) || 1
    const pCDI = parseValor(percentualCDIInput) || 100
    const cdiAnualDec = (parseValor(cdiAnualPercentManual) || 13.75) / 100
    const cotDolar = parseValor(dolarManual) || 5.3
    const vMilheiro = parseValor(milheiroManual) || 20.0
    const ptsDolar = parseValor(pontosPorDolarManual) || 0

    return {
      precoPix: pPix,
      precoCartao: pCartao,
      numeroParcelas: nParc,
      dataCompra: dataCompraInput,
      diaFechamentoCartao: cartaoAtual?.dia_fechamento || 10,
      diaVencimentoCartao: cartaoAtual?.dia_vencimento || 20,
      pontosPorDolar: ptsDolar,
      cotacaoDolar: cotDolar,
      valorMilheiro: vMilheiro,
      percentualCDI: pCDI,
      cdiAnual: cdiAnualDec,
    }
  }, [
    precoPixInput,
    precoCartaoInput,
    nParcelasInput,
    dataCompraInput,
    cartaoAtual,
    percentualCDIInput,
    cdiAnualPercentManual,
    dolarManual,
    milheiroManual,
    pontosPorDolarManual,
  ])

  // Cálculo da simulação via motor matemático determinístico
  const resultado = useMemo<ResultadoSimulacao | null>(() => {
    if (parametros.precoPix <= 0 || parametros.precoCartao <= 0) return null
    return calcularSimulacao(parametros)
  }, [parametros])

  // Cenários comparativos de parcelamentos (1x, 3x, 6x, 10x, 12x)
  const cenarios = useMemo<CenariosComparativosItem[]>(() => {
    if (!resultado) return []
    return compararParcelamentos(parametros, [1, 3, 6, 10, 12])
  }, [parametros, resultado])

  // Reiniciar teste de consciência
  const handleReiniciarConsciencia = () => {
    setClassificacao('')
    setFariaNoPix('')
    setEtapaLiberada(false)
  }

  // Aplicar desconto de equilíbrio no input Pix
  const handleAplicarDescontoEquilibrio = () => {
    if (resultado && resultado.pixEquilibrioValor > 0) {
      setPrecoPixInput(
        resultado.pixEquilibrioValor.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      )
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Título Principal */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Calculadora Pix × Cartão
            </h1>
            <p className="text-xs text-slate-500">
              Compare o pagamento à vista com o parcelamento considerando rendimento do dinheiro,
              datas reais das parcelas e benefícios do cartão.
            </p>
          </div>
        </div>
      </div>

      {/* BLOCO 0 — ETAPAS 1 e 2: CONSCIÊNCIA ANTES DOS NÚMEROS */}
      {!etapaLiberada ? (
        <Card className="border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50 shadow-md">
          <CardHeader className="pb-3 border-b border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Etapas 1 e 2 — Consciência da Decisão de Consumo</span>
            </div>
            <CardDescription className="text-xs text-slate-600">
              Antes de avaliar centavos ou taxas, responda com sinceridade às duas perguntas de
              reflexão comportamental. Suas respostas não alteram a matemática financeira nem são
              gravadas no sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Pergunta 1: Classificação do Produto */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-900 block">
                1. O produto que você está querendo comprar se classifica como:
              </Label>
              <RadioGroup
                value={classificacao}
                onValueChange={(val) => setClassificacao(val as ClassificacaoComportamental)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
              >
                {[
                  { id: 'Superfluo', label: 'Supérfluo', desc: 'Desejo de momento, dispensável' },
                  {
                    id: 'Discricionario',
                    label: 'Discricionário',
                    desc: 'Importante mas pode aguardar',
                  },
                  { id: 'Ajustavel', label: 'Ajustável', desc: 'Necessário com margem de ajuste' },
                  { id: 'Essencial', label: 'Essencial', desc: 'Indispensável para o dia a dia' },
                ].map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`class-${item.id}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      classificacao === item.id
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    <RadioGroupItem value={item.id} id={`class-${item.id}`} className="mt-1" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Pergunta 2: Teste do Desembolso no Pix */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <Label className="text-sm font-semibold text-slate-900 block">
                2. Você faria esta compra se tivesse que pagar o preço no Pix integralmente hoje?
              </Label>
              <RadioGroup
                value={fariaNoPix}
                onValueChange={(val) => setFariaNoPix(val as RespostaDesembolso)}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
              >
                {[
                  { id: 'Sim', label: 'Sim', desc: 'Desembolsaria o valor à vista hoje' },
                  { id: 'Nao', label: 'Não', desc: 'Não compraria mediante Pix imediato' },
                  {
                    id: 'NaoTenhoCerteza',
                    label: 'Não tenho certeza',
                    desc: 'A forma de pagamento afeta meu desejo',
                  },
                ].map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`pix-${item.id}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      fariaNoPix === item.id
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    <RadioGroupItem value={item.id} id={`pix-${item.id}`} className="mt-1" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Botão de Liberação */}
            <div className="pt-2 flex justify-end">
              <Button
                disabled={!classificacao || !fariaNoPix}
                onClick={() => setEtapaLiberada(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 shadow-sm"
              >
                <span>Continuar para a calculadora</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Card discreto com as respostas comportamentais e botão de refazer */
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <strong>Compra analisada:</strong>{' '}
              <span className="text-emerald-700 font-semibold">
                {classificacao === 'Superfluo'
                  ? 'Supérflua'
                  : classificacao === 'Discricionario'
                    ? 'Discricionária'
                    : classificacao === 'Ajustavel'
                      ? 'Ajustável'
                      : 'Essencial'}
              </span>
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span>
              <strong>Faria no Pix hoje:</strong>{' '}
              <span className="font-semibold">
                {fariaNoPix === 'Sim' ? 'Sim' : fariaNoPix === 'Nao' ? 'Não' : 'Não tenho certeza'}
              </span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReiniciarConsciencia}
            className="h-7 text-xs text-slate-500 hover:text-slate-800 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            <span>Refazer reflexão</span>
          </Button>
        </div>
      )}

      {/* ETAPA 3 — OTIMIZAÇÃO FINANCEIRA (CAMPOS DA SIMULAÇÃO) */}
      {etapaLiberada && (
        <div className="space-y-6">
          <Card className="shadow-xs border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Etapa 3 — Parâmetros Financeiros da Compra
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Informe os preços e selecione o cartão cadastrado para cálculo das datas reais e
                    pontuação.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPainelPremissasAberto(!painelPremissasAberto)}
                  className="text-xs h-8 text-slate-600 gap-1.5"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    Premissas ({parseValor(percentualCDIInput)}% CDI • US$ {dolarManual})
                  </span>
                  {painelPremissasAberto ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Preço Pix */}
                <div>
                  <Label
                    htmlFor="preco-pix"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Preço no Pix / Débito (R$) *</span>
                  </Label>
                  <Input
                    id="preco-pix"
                    value={precoPixInput}
                    onChange={(e) => setPrecoPixInput(e.target.value)}
                    placeholder="4.800,00"
                    className="mt-1 font-semibold text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Valor à vista com desconto</p>
                </div>

                {/* Preço Cartão */}
                <div>
                  <Label
                    htmlFor="preco-cartao"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Preço Total no Cartão (R$) *</span>
                  </Label>
                  <Input
                    id="preco-cartao"
                    value={precoCartaoInput}
                    onChange={(e) => setPrecoCartaoInput(e.target.value)}
                    placeholder="5.000,00"
                    className="mt-1 font-semibold text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Valor total parcelado</p>
                </div>

                {/* Quantidade de Parcelas */}
                <div>
                  <Label htmlFor="parcelas" className="text-xs font-semibold text-slate-700">
                    Quantidade de Parcelas *
                  </Label>
                  <Input
                    id="parcelas"
                    type="number"
                    min="1"
                    max="48"
                    value={nParcelasInput}
                    onChange={(e) => setNParcelasInput(e.target.value)}
                    placeholder="10"
                    className="mt-1 font-semibold text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {resultado
                      ? `${resultado.numeroParcelas}x de R$ ${resultado.valorParcela.toFixed(2).replace('.', ',')}`
                      : 'Mínimo 1x'}
                  </p>
                </div>

                {/* Data da Compra */}
                <div>
                  <Label htmlFor="data-compra" className="text-xs font-semibold text-slate-700">
                    Data da Compra / Simulação *
                  </Label>
                  <Input
                    id="data-compra"
                    type="date"
                    value={dataCompraInput}
                    onChange={(e) => setDataCompraInput(e.target.value)}
                    className="mt-1 text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Define o ciclo e vencimento real
                  </p>
                </div>
              </div>

              {/* Seleção do Cartão */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <Label htmlFor="cartao-select" className="text-xs font-semibold text-slate-700">
                    Cartão de Crédito Cadastrado *
                  </Label>
                  <Select value={cartaoSelecionadoId} onValueChange={setCartaoSelecionadoId}>
                    <SelectTrigger id="cartao-select" className="mt-1">
                      <SelectValue placeholder="Selecione um cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      {cartoes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} (Corte {c.dia_fechamento} • Venc {c.dia_vencimento} •{' '}
                          {c.pontos_por_dolar || 0} pts/US$)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {cartaoAtual && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600 flex items-center gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Fechamento
                      </span>
                      <span className="font-semibold text-slate-800">
                        Dia {cartaoAtual.dia_fechamento}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Vencimento
                      </span>
                      <span className="font-semibold text-slate-800">
                        Dia {cartaoAtual.dia_vencimento}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Pontuação
                      </span>
                      <span className="font-semibold text-indigo-700">
                        {cartaoAtual.pontos_por_dolar || 0} pts / US$
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Painel Expansível de Premissas Econômicas */}
              {painelPremissasAberto && (
                <div className="pt-4 border-t border-slate-200 bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Premissas Macroeconômicas & Parâmetros de Investimento
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={carregarCotacoes}
                      disabled={loadingCotacoes}
                      className="text-xs h-7 text-slate-500 hover:text-slate-800"
                    >
                      <RefreshCw
                        className={`w-3 h-3 mr-1 ${loadingCotacoes ? 'animate-spin' : ''}`}
                      />
                      <span>Atualizar do Banco Central</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">
                        Dólar PTAX (R$)
                      </Label>
                      <Input
                        value={dolarManual}
                        onChange={(e) => setDolarManual(e.target.value)}
                        className="mt-1 h-8 text-xs font-semibold bg-white"
                      />
                      <span className="text-[9px] text-slate-500 block mt-0.5">
                        {`BCB • atualizado ${cotacoes?.dolar.dataHora ? (cotacoes.dolar.dataHora.includes('T') ? new Date(cotacoes.dolar.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : cotacoes.dolar.dataHora) : 'hoje'}`}
                      </span>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">
                        Taxa CDI a.a. (%)
                      </Label>
                      <Input
                        value={cdiAnualPercentManual}
                        onChange={(e) => setCdiAnualPercentManual(e.target.value)}
                        className="mt-1 h-8 text-xs font-semibold bg-white"
                      />
                      <span className="text-[9px] text-slate-500 block mt-0.5">
                        {`BCB (SGS 4389) • atualizado ${cotacoes?.cdiAnual.dataHora || 'hoje'}`}
                      </span>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">
                        % do CDI do CDB
                      </Label>
                      <Input
                        value={percentualCDIInput}
                        onChange={(e) => setPercentualCDIInput(e.target.value)}
                        className="mt-1 h-8 text-xs font-semibold bg-white"
                      />
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        Ex: 100%, 105%, 90%
                      </span>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">
                        Valor Milheiro (R$)
                      </Label>
                      <Input
                        value={milheiroManual}
                        onChange={(e) => setMilheiroManual(e.target.value)}
                        className="mt-1 h-8 text-xs font-semibold bg-white"
                      />
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        Estimado por 1.000 pts
                      </span>
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold text-slate-700">
                        Pontos por US$
                      </Label>
                      <Input
                        value={pontosPorDolarManual}
                        onChange={(e) => setPontosPorDolarManual(e.target.value)}
                        className="mt-1 h-8 text-xs font-semibold bg-white"
                      />
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        0 se não pontua
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-1">
                    <span>
                      <strong>Selic Meta:</strong> {cotacoes?.selicMeta.valor || 13.75}% a.a. (Copom
                      - Referência)
                    </span>
                    <span>•</span>
                    <span>
                      <strong>Tributação:</strong> IR regressivo (22,5% a 15%) sobre os rendimentos
                      por prazo real
                    </span>
                    <span>•</span>
                    <span>
                      <strong>IOF:</strong> Desconsiderado (premissa de saldo provisionado &gt; 30
                      dias)
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ETAPA 4 — RESULTADO PRINCIPAL & DESTAQUE DO EQUILÍBRIO */}
          {resultado && (
            <div className="space-y-6">
              <Card
                className={`border-2 shadow-md ${
                  resultado.vencedor === 'cartao'
                    ? 'border-emerald-500 bg-gradient-to-br from-emerald-50/50 via-white to-slate-50'
                    : resultado.vencedor === 'pix'
                      ? 'border-emerald-600 bg-gradient-to-br from-emerald-50/60 via-white to-slate-50'
                      : 'border-slate-300 bg-white'
                }`}
              >
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs ${
                          resultado.vencedor === 'cartao'
                            ? 'bg-indigo-600'
                            : resultado.vencedor === 'pix'
                              ? 'bg-emerald-600'
                              : 'bg-slate-500'
                        }`}
                      >
                        {resultado.vencedor === 'cartao' ? (
                          <CreditCard className="w-4 h-4" />
                        ) : (
                          <QrCode className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block">
                          Recomendação Econômica
                        </span>
                        <CardTitle className="text-lg font-black text-slate-900">
                          {resultado.vencedor === 'cartao'
                            ? `CARTÃO EM ${resultado.numeroParcelas}X APRESENTA VANTAGEM`
                            : resultado.vencedor === 'pix'
                              ? 'PAGAMENTO NO PIX É MAIS VANTAJOSO'
                              : 'EMPATE ECONÔMICO ENTRE PIX E CARTÃO'}
                        </CardTitle>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          resultado.magnitude === 'pequena'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : resultado.magnitude === 'moderada'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {`VANTAGEM ${resultado.magnitude.toUpperCase()} · ${resultado.vantagemRelativa.toFixed(2).replace('.', ',')}%`}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 space-y-5">
                  {/* Frase síntese com magnitude */}
                  <div className="bg-white/80 border border-slate-200/80 rounded-lg p-3 text-sm text-slate-800 font-medium">
                    {resultado.fraseSintese}
                  </div>

                  {/* Detalhamento dos números */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                        Diferença Nominal
                      </span>
                      <span className="text-sm font-bold text-slate-800">
                        R$ {resultado.custoAdicionalCartao.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Cartão − Pix</span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                        Rendimento Líquido CDB
                      </span>
                      <span className="text-sm font-bold text-emerald-700">
                        +R$ {resultado.rendimentoLiquidoAcumulado.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Após dedução do IR
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                        Milhas Estimadas
                      </span>
                      <span className="text-sm font-bold text-indigo-700">
                        +R$ {resultado.valorEconomicoMilhas.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {resultado.pontosEstimados.toLocaleString('pt-BR')} pts (estimativa)
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                        Preço Equivalente Cartão
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        R$ {resultado.precoEconomicoEquivalenteCartao.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Custo real após benefícios
                      </span>
                    </div>
                  </div>

                  {/* Destaque Principal: PONTO DE INDIFERENÇA PIX × CARTÃO */}
                  <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                        <TrendingUp className="w-4 h-4 text-emerald-700" />
                        <span>PONTO DE INDIFERENÇA PIX × CARTÃO</span>
                      </div>
                      <span className="text-xs font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                        Equilíbrio:{' '}
                        {resultado.descontoEquilibrioPixPercent.toFixed(2).replace('.', ',')}%
                      </span>
                    </div>

                    {/* Grade com os 4 indicadores exigidos: Preço Pix atual, Preço Pix de equilíbrio, Desconto atual, Desconto de equilíbrio */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/70 rounded-lg p-2.5 border border-emerald-200/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                          Preço Pix atual
                        </span>
                        <span className="font-bold text-slate-900">
                          R$ {resultado.precoPix.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                          Preço Pix de equilíbrio
                        </span>
                        <span className="font-bold text-emerald-800">
                          R$ {resultado.pixEquilibrioValor.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                          Desconto atual
                        </span>
                        <span className="font-bold text-slate-900">
                          {resultado.descontoAtualPixPercent.toFixed(2).replace('.', ',')}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                          Desconto de equilíbrio
                        </span>
                        <span className="font-bold text-emerald-800">
                          {resultado.descontoEquilibrioPixPercent.toFixed(2).replace('.', ',')}%
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                      {resultado.fraseDescontoEquilibrio}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-emerald-800">
                      <div>
                        {resultado.vencedor === 'cartao' &&
                        resultado.diferencaDescontoPontosPercentuais > 0 ? (
                          <span>
                            Diferença para o equilíbrio:{' '}
                            <strong>
                              {resultado.diferencaDescontoPontosPercentuais
                                .toFixed(2)
                                .replace('.', ',')}{' '}
                              p.p.
                            </strong>
                          </span>
                        ) : resultado.vencedor === 'pix' ? (
                          <span className="text-emerald-700 font-bold">
                            Desconto atual já supera o ponto de indiferença.
                          </span>
                        ) : (
                          <span>Custos econômicos rigorosamente equivalentes.</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAplicarDescontoEquilibrio}
                        className="h-7 text-xs bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                      >
                        Simular com Pix a R${' '}
                        {resultado.pixEquilibrioValor.toFixed(2).replace('.', ',')}
                      </Button>
                    </div>
                  </div>

                  {/* Botão Ver Memória de Cálculo */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMemoriaAberta(!memoriaAberta)}
                      className="text-xs text-slate-700 gap-1"
                    >
                      <span>
                        {memoriaAberta
                          ? 'Ocultar memória de cálculo'
                          : 'Ver memória de cálculo detalhada'}
                      </span>
                      {memoriaAberta ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>

                  {/* Tabela da Memória de Cálculo Período a Período */}
                  {memoriaAberta && (
                    <div className="pt-2 border-t border-slate-200 space-y-3">
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Memória Período a Período (Evolução do Saldo Aplicado)
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <Table className="text-xs">
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="w-12 text-center">Parc</TableHead>
                              <TableHead>Vencimento</TableHead>
                              <TableHead className="text-right">Saldo Inicial</TableHead>
                              <TableHead className="text-right">Rend. Bruto</TableHead>
                              <TableHead className="text-right">IR Estimado</TableHead>
                              <TableHead className="text-right">Rend. Líquido</TableHead>
                              <TableHead className="text-right">Parcela</TableHead>
                              <TableHead className="text-right font-bold">Saldo Após</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resultado.memoria.map((m) => (
                              <TableRow key={m.numero}>
                                <TableCell className="text-center font-medium">
                                  {m.numero}ª
                                </TableCell>
                                <TableCell>
                                  {m.dataVencimento.split('-').reverse().join('/')}
                                  <span className="text-[10px] text-slate-400 block">
                                    {m.diasPeriodo} dias
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  R$ {m.saldoInicialPeriodo.toFixed(2).replace('.', ',')}
                                </TableCell>
                                <TableCell className="text-right text-emerald-700">
                                  R$ {m.rendimentoBruto.toFixed(2).replace('.', ',')}
                                </TableCell>
                                <TableCell className="text-right text-red-600">
                                  -R$ {m.valorIR.toFixed(2).replace('.', ',')}{' '}
                                  <span className="text-[9px] text-slate-400">
                                    ({(m.aliquotaIR * 100).toFixed(1)}%)
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-semibold text-emerald-700">
                                  +R$ {m.rendimentoLiquido.toFixed(2).replace('.', ',')}
                                </TableCell>
                                <TableCell className="text-right text-slate-800">
                                  -R$ {m.valorParcela.toFixed(2).replace('.', ',')}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-bold ${
                                    m.saldoAposParcela >= 0 ? 'text-slate-900' : 'text-red-600'
                                  }`}
                                >
                                  R$ {m.saldoAposParcela.toFixed(2).replace('.', ',')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Totais Consolidados da Memória */}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex justify-between text-slate-600">
                          <span>Rendimento Bruto Acumulado:</span>
                          <span className="font-semibold text-slate-800">
                            +R${' '}
                            {resultado.totais.rendimentoBrutoAcumulado.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between text-red-600">
                          <span>(−) IR Estimado sobre Rendimentos:</span>
                          <span className="font-semibold">
                            −R$ {resultado.totais.irEstimadoAcumulado.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-200 pt-1">
                          <span>(=) Rendimento Líquido Acumulado:</span>
                          <span>
                            +R${' '}
                            {resultado.totais.rendimentoLiquidoAcumulado
                              .toFixed(2)
                              .replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between text-indigo-700">
                          <span>(+) Valor Estimado das Milhas/Pontos:</span>
                          <span className="font-semibold">
                            +R$ {resultado.totais.valorEconomicoMilhas.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-800 border-t border-slate-200 pt-1">
                          <span>Diferença Nominal (Preço Cartão − Pix):</span>
                          <span className="font-semibold">
                            R$ {resultado.totais.diferencaNominalPreco.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-extrabold border-t-2 border-slate-300 pt-1.5">
                          <span
                            className={
                              resultado.totais.vantagemLiquidaFinal >= 0
                                ? 'text-indigo-800'
                                : 'text-emerald-800'
                            }
                          >
                            {resultado.totais.vantagemLiquidaFinal >= 0
                              ? 'Vantagem Líquida Cartão:'
                              : 'Vantagem Líquida Pix:'}
                          </span>
                          <span
                            className={
                              resultado.totais.vantagemLiquidaFinal >= 0
                                ? 'text-indigo-800'
                                : 'text-emerald-800'
                            }
                          >
                            R${' '}
                            {Math.abs(resultado.totais.vantagemLiquidaFinal)
                              .toFixed(2)
                              .replace('.', ',')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* TABELA COMPARATIVA DE DIFERENTES PARCELAMENTOS */}
              <Card className="shadow-xs border-slate-200">
                <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Comparação de Diferentes Parcelamentos (Mesmo Cartão)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    A melhor alternativa financeira estimada é destacada automaticamente pelo menor
                    custo equivalente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table className="text-xs">
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Forma</TableHead>
                          <TableHead className="text-right">Nominal</TableHead>
                          <TableHead className="text-right">Benefício Aplicação</TableHead>
                          <TableHead className="text-right">Milhas</TableHead>
                          <TableHead className="text-right font-bold">Custo Equivalente</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cenarios.map((c) => (
                          <TableRow
                            key={c.forma}
                            className={c.isMelhor ? 'bg-emerald-50/70 font-semibold' : ''}
                          >
                            <TableCell className="font-medium flex items-center gap-1.5">
                              {c.isMelhor && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                              <span>{c.forma}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              R$ {c.nominal.toFixed(2).replace('.', ',')}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700">
                              {c.beneficioAplicacao > 0
                                ? `+R$ ${c.beneficioAplicacao.toFixed(2).replace('.', ',')}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right text-indigo-700">
                              {c.milhas > 0 ? `+R$ ${c.milhas.toFixed(2).replace('.', ',')}` : '—'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-slate-900">
                              R$ {c.custoEquivalente.toFixed(2).replace('.', ',')}
                            </TableCell>
                            <TableCell className="text-center">
                              {c.isMelhor ? (
                                <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  Melhor alternativa
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* ETAPA 5 — CONTEXTUALIZAÇÃO COMPORTAMENTAL (TEXTOS EXATOS DO COMPLEMENTO SEÇÕES 10 E 11) */}
              <Card className="border border-slate-200 bg-slate-50/70 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-slate-800 text-xs font-bold uppercase tracking-wider">
                    <Info className="w-4 h-4 text-emerald-600" />
                    <span>Etapa 5 — Contextualização da Decisão</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs leading-relaxed text-slate-700">
                  {/* Mensagem da Classificação */}
                  {(classificacao === 'Discricionario' || classificacao === 'Superfluo') && (
                    <div className="p-3 bg-white rounded-lg border border-amber-200/80 text-amber-950">
                      <strong>Perspectiva sobre o valor da compra:</strong> A diferença entre Pix e
                      cartão deve ser analisada em perspectiva com o valor total da compra. Em uma
                      compra discricionária ou supérflua, decidir se a compra deve ocorrer pode
                      produzir impacto financeiro muito superior ao ganho obtido apenas pela
                      otimização da forma de pagamento.
                    </div>
                  )}

                  {/* Mensagem da Resposta 2 */}
                  {fariaNoPix === 'Sim' && (
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      Você indicou que realizaria esta compra mesmo mediante desembolso integral no
                      Pix. A análise abaixo compara a forma economicamente mais eficiente de
                      realizar um consumo que você já decidiu fazer.
                    </div>
                  )}

                  {fariaNoPix === 'Nao' && (
                    <div className="p-3 bg-white rounded-lg border border-amber-200/80 text-amber-950">
                      <strong>Atenção à decisão de consumo:</strong> você indicou que não faria esta
                      compra se precisasse pagá-la integralmente no Pix. O cartão pode estar não
                      apenas otimizando a forma de pagamento, mas tornando psicologicamente
                      aceitável uma compra que você não faria mediante desembolso imediato.
                    </div>
                  )}

                  {fariaNoPix === 'NaoTenhoCerteza' && (
                    <div className="p-3 bg-white rounded-lg border border-blue-200/80 text-blue-950">
                      A forma de pagamento parece influenciar sua decisão de compra. Considere
                      separar as duas decisões: primeiro, se vale realizar a compra; depois, qual é
                      a melhor forma de pagá-la.
                    </div>
                  )}

                  {/* Frase de disciplina financeira (Complemento Seção 14) */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-600 italic">
                    "O dinheiro que permanece aplicado durante o parcelamento não representa
                    automaticamente maior poder de consumo. A vantagem calculada pressupõe
                    disciplina para permitir que esse capital cumpra o papel financeiro previsto na
                    simulação."
                  </div>
                </CardContent>
              </Card>

              {/* SEÇÃO "OUTROS FATORES A CONSIDERAR" (COMPLEMENTO SEÇÃO 15, SEM VALOR MONETÁRIO) */}
              <Card className="border border-slate-200 bg-white shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-slate-800 text-xs font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Outros Fatores a Considerar (Benefícios Qualitativos)</span>
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    Aspectos práticos e de proteção que não recebem valor monetário arbitrário na
                    simulação.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>
                      <strong>Preservação de liquidez:</strong> manter reserva intacta para
                      imprevistos imediatos.
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>
                      <strong>Benefícios da bandeira:</strong> proteção de compra, seguros de viagem
                      e garantia estendida.
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>
                      <strong>Relacionamento bancário:</strong> volume de utilização para isenção de
                      anuidade ou crédito.
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>
                      <strong>Simplicidade do Pix:</strong> eliminação de compromissos futuros e
                      ausência de parcelas para gerenciar.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
export default CalculadoraDecisaoPage
