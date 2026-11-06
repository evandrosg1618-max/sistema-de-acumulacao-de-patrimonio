/**
 * Motor Matemático da Calculadora de Decisão de Pagamento (Pix × Cartão)
 *
 * Funções puras, determinísticas e sem efeitos colaterais.
 * Conforme especificações:
 * - PDF Principal: "Calculadora de Decisão de Pagamento (Pix × Cartão)"
 * - COMPLEMENTO: "Regra do saldo inicial + consciência da decisão" (prevalece onde houver conflito)
 *
 * Regra do Saldo Inicial (Complemento Seção 1):
 * S0 = Preço no Pix (capital inicial que permanece aplicado).
 * A cada período i (1 .. n):
 *   Rendimento bruto do período sobre o saldo investido no início do período.
 *   IR regressivo conforme dias corridos desde dataCompra até vencimento da parcela.
 *   Rendimento líquido = bruto - IR.
 *   Saldo com rendimento = saldo anterior + rendimento líquido.
 *   Deduz parcela i.
 *   Saldo após parcela = saldo com rendimento - parcela.
 *
 * Proibido aporte fictício para zerar saldo negativo (Complemento Seção 3).
 * Saldo final positivo ou negativo é informação econômica:
 *   Positivo = rendimento compensou diferença e gerou vantagem antes das milhas.
 *   Negativo = rendimento não cobriu diferença de preço, desvantagem antes das milhas.
 */

export type MagnitudeVantagem = 'pequena' | 'moderada' | 'relevante'
export type VencedorSimulacao = 'cartao' | 'pix' | 'empate'

export interface ParcelaMemoria {
  numero: number
  competencia: string // YYYY-MM
  dataVencimento: string // YYYY-MM-DD
  diasPeriodo: number // dias corridos do período de rendimento
  diasAcumulados: number // dias corridos da data da compra até este vencimento
  saldoInicialPeriodo: number
  taxaEfetivaPeriodo: number // decimal (ex: 0.008474)
  rendimentoBruto: number
  aliquotaIR: number // decimal (ex: 0.225)
  valorIR: number
  rendimentoLiquido: number
  valorParcela: number
  saldoAposParcela: number
}

export interface TotaisMemoria {
  capitalInicialPix: number
  totalParcelasCartao: number
  diferencaNominalPreco: number // precoCartao - precoPix
  rendimentoBrutoAcumulado: number
  irEstimadoAcumulado: number
  rendimentoLiquidoAcumulado: number
  valorEconomicoMilhas: number
  beneficioTotalCartao: number // rendimentoLiquidoAcumulado + valorEconomicoMilhas
  saldoFinal: number // S0 + rendimentoLiquido - sum(parcelas)
  vantagemCartaoAntesMilhas: number // = saldoFinal
  vantagemLiquidaFinal: number // saldoFinal + valorEconomicoMilhas (se positivo => vantagem do cartão, se negativo => do Pix)
}

export interface ResultadoSimulacao {
  vencedor: VencedorSimulacao
  vantagemAbsoluta: number // em R$ (> 0)
  vantagemRelativa: number // em % sobre precoPix (> 0)
  magnitude: MagnitudeVantagem // pequena (<=1%), moderada (>1% e <=3%), relevante (>3%)

  // Valores detalhados
  precoPix: number
  precoCartao: number
  numeroParcelas: number
  valorParcela: number

  // Vantagem Líquida Final (saldoFinal + valorEconomicoMilhas)
  vantagemLiquidaFinal: number

  // Saldo e Rendimentos
  saldoFinal: number
  rendimentoLiquidoAcumulado: number
  custoAdicionalCartao: number // precoCartao - precoPix

  // Milhas / Pontos
  pontosEstimados: number
  valorEconomicoMilhas: number

  // Preço Econômico Equivalente
  precoEconomicoEquivalenteCartao: number // precoCartao - (saldoFinal + milhas) ou precoPix - saldoFinal

  // Desconto de Equilíbrio do Pix
  descontoAtualPixPercent: number // (precoCartao - precoPix) / precoCartao * 100
  descontoEquilibrioPixPercent: number // (precoCartao - pixEquilibrio) / precoCartao * 100
  pixEquilibrioValor: number
  diferencaDescontoPontosPercentuais: number // descontoEquilibrio - descontoAtual
  fraseDescontoEquilibrio: string

  // Frase síntese com magnitude
  fraseSintese: string

  // Memória de cálculo período a período
  memoria: ParcelaMemoria[]
  totais: TotaisMemoria
}

export interface ParametrosSimulacao {
  precoPix: number
  precoCartao: number
  numeroParcelas: number
  dataCompra: string // YYYY-MM-DD
  diaFechamentoCartao: number
  diaVencimentoCartao: number
  pontosPorDolar?: number // padrão 0
  cotacaoDolar?: number // padrão 5.30
  valorMilheiro?: number // padrão R$ 20.00
  percentualCDI?: number // padrão 100 (%)
  cdiAnual?: number // decimal anualizado, ex: 0.1375 (13.75% a.a.)

  // Opção para forçar premissas simplificadas (usado no Teste 0 de validação do complemento)
  modoSimplificadoTeste0?: boolean
}

export interface CenariosComparativosItem {
  forma: string // 'Pix', '1x', '3x', '6x', '10x', '12x' etc.
  parcelas: number
  nominal: number
  beneficioAplicacao: number
  milhas: number
  custoEquivalente: number
  vantagemVsPix: number
  isMelhor: boolean
}

/**
 * Retorna alíquota regressiva de IR de Renda Fixa conforme prazo em dias corridos:
 * até 180 dias: 22,5%
 * 181 a 360 dias: 20,0%
 * 361 a 720 dias: 17,5%
 * acima de 720 dias: 15,0%
 */
export function obterAliquotaIRRegressivo(diasCorridos: number): number {
  if (diasCorridos <= 180) return 0.225
  if (diasCorridos <= 360) return 0.2
  if (diasCorridos <= 720) return 0.175
  return 0.15
}

/**
 * Classifica magnitude da vantagem em relação ao preço no Pix (Complemento Seções 12 e 13)
 * |vantagem relativa| <= 1% => 'pequena'
 * > 1% e <= 3% => 'moderada'
 * > 3% => 'relevante'
 */
export function classificarMagnitude(vantagemRelativaPercent: number): MagnitudeVantagem {
  const abs = Math.abs(vantagemRelativaPercent)
  if (abs <= 1.0) return 'pequena'
  if (abs <= 3.0) return 'moderada'
  return 'relevante'
}

/**
 * Calcula a competência da primeira fatura (mês do vencimento YYYY-MM)
 * Reutiliza estritamente a lógica do SAP (faturaService.calcularCompetenciaCartao)
 */
export function calcularCompetenciaInicial(
  dataCompra: string,
  diaFechamento: number,
  diaVencimento = 20,
): string {
  const dt = new Date(dataCompra + 'T12:00:00')
  const dia = dt.getDate()
  let ano = dt.getFullYear()
  let mes = dt.getMonth() + 1 // 1 a 12

  const fech = diaFechamento || 10
  const venc = diaVencimento || 20

  // Se vencimento é <= fechamento (ex: fecha 17, vence 01), o vencimento deste fechamento é no mês seguinte
  if (venc <= fech) {
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }

  // Se a compra foi após o dia de fechamento, cai no ciclo seguinte (+1 mês)
  if (dia > fech) {
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }

  return `${ano}-${String(mes).padStart(2, '0')}`
}

/**
 * Calcula a data real de vencimento de uma fatura dada a competência (YYYY-MM)
 * e o dia de vencimento cadastrado no cartão, com clamp de fim de mês e virada de ano.
 * Reutiliza a lógica de getOrCreateFatura em src/services/sap.ts (~linhas 2150–2161).
 */
export function calcularDataVencimentoFatura(
  competencia: string,
  diaFechamento: number,
  diaVencimento: number,
): string {
  const [anoStr, mesStr] = competencia.split('-')
  const ano = parseInt(anoStr, 10)
  const mes = parseInt(mesStr, 10)

  let anoVenc = ano
  let mesVenc = mes

  if (diaVencimento < diaFechamento) {
    mesVenc += 1
    if (mesVenc > 12) {
      mesVenc = 1
      anoVenc += 1
    }
  }

  const ultDiaVenc = new Date(anoVenc, mesVenc, 0).getDate()
  const diaVencReal = Math.min(diaVencimento || 20, ultDiaVenc)

  return `${anoVenc}-${String(mesVenc).padStart(2, '0')}-${String(diaVencReal).padStart(2, '0')}`
}

/**
 * Adiciona N meses a uma competência YYYY-MM
 */
export function adicionarMesesCompetencia(competencia: string, mesesParaAdicionar: number): string {
  const [anoStr, mesStr] = competencia.split('-')
  let ano = parseInt(anoStr, 10)
  let mes = parseInt(mesStr, 10) + mesesParaAdicionar

  while (mes > 12) {
    mes -= 12
    ano += 1
  }
  while (mes < 1) {
    mes += 12
    ano -= 1
  }

  return `${ano}-${String(mes).padStart(2, '0')}`
}

/**
 * Diferença em dias corridos entre duas datas no formato YYYY-MM-DD
 */
export function diferencaDiasCorridos(dataInicio: string, dataFim: string): number {
  const d1 = new Date(dataInicio + 'T12:00:00')
  const d2 = new Date(dataFim + 'T12:00:00')
  const diffMs = d2.getTime() - d1.getTime()
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * Arredonda para 2 casas decimais
 */
function round2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Função principal do motor: calcularSimulacao
 * Determinística, pura, única fonte da verdade para tela, memória e comparativos.
 */
export function calcularSimulacao(params: ParametrosSimulacao): ResultadoSimulacao {
  const {
    precoPix,
    precoCartao,
    numeroParcelas,
    dataCompra,
    diaFechamentoCartao,
    diaVencimentoCartao,
    pontosPorDolar = 0,
    cotacaoDolar = 5.3,
    valorMilheiro = 20.0,
    percentualCDI = 100,
    cdiAnual = 0.1375, // 13.75% a.a. por padrão
    modoSimplificadoTeste0 = false,
  } = params

  const nParcelas = Math.max(1, Math.floor(numeroParcelas))
  const valorParcela = round2(precoCartao / nParcelas)

  // Taxa anual efetiva do CDB
  const taxaAnualBruta = cdiAnual * (percentualCDI / 100)
  // Taxa diária por dias corridos: (1 + taxa_aa)^(1/365) - 1
  const taxaDiaria = Math.pow(1 + taxaAnualBruta, 1 / 365) - 1

  // Taxa mensal simplificada usada no Teste 0:
  // Taxa anual 13.75%, IR simplificado 22.5% => líquida a.a. = 13.75% * (1 - 0.225) = 10.65625%
  // Taxa mensal equivalente = (1 + 0.1065625)^(1/12) - 1 ≈ 0.008474 (0.8474% a.m.)
  const taxaMensalLiqTeste0 = Math.pow(1 + 0.1375 * (1 - 0.225), 1 / 12) - 1

  // Determinar datas de vencimento das parcelas
  const competenciaInicial = calcularCompetenciaInicial(
    dataCompra,
    diaFechamentoCartao,
    diaVencimentoCartao,
  )

  const memoria: ParcelaMemoria[] = []
  let saldoCorrente = precoPix
  let dataAnterior = dataCompra

  let rendimentoBrutoAcumulado = 0
  let irEstimadoAcumulado = 0
  let rendimentoLiquidoAcumulado = 0

  for (let i = 1; i <= nParcelas; i++) {
    const compParcela = adicionarMesesCompetencia(competenciaInicial, i - 1)
    const dataVencimento = calcularDataVencimentoFatura(
      compParcela,
      diaFechamentoCartao,
      diaVencimentoCartao,
    )

    const diasPeriodo = diferencaDiasCorridos(dataAnterior, dataVencimento)
    const diasAcumulados = diferencaDiasCorridos(dataCompra, dataVencimento)

    let rendBruto = 0
    let aliquotaIR = 0.225
    let valorIR = 0
    let rendLiquido = 0
    let taxaEfetivaPeriodo = 0

    if (modoSimplificadoTeste0) {
      // Modo simplificado do Teste 0 (Complemento Seção 2)
      // O rendimento líquido é calculado diretamente via taxa mensal líquida (0,8474% a.m.)
      // sobre o saldo inicial do período, com IR nominal de 22,5%
      taxaEfetivaPeriodo = taxaMensalLiqTeste0
      rendLiquido = round2(saldoCorrente * taxaEfetivaPeriodo)
      // Reconstituir bruto e IR simplificados
      rendBruto = round2(rendLiquido / (1 - 0.225))
      valorIR = round2(rendBruto - rendLiquido)
      aliquotaIR = 0.225
    } else {
      // Modo definitivo: dias corridos reais entre datas efetivas
      // Se saldoCorrente > 0, rende. Se <= 0, não rende (não há dinheiro investido gerando juros)
      aliquotaIR = obterAliquotaIRRegressivo(diasAcumulados)
      if (saldoCorrente > 0 && diasPeriodo > 0) {
        // Rendimento composto no período de dias corridos
        const fatorBruto = Math.pow(1 + taxaDiaria, diasPeriodo) - 1
        taxaEfetivaPeriodo = fatorBruto
        rendBruto = round2(saldoCorrente * fatorBruto)
        valorIR = round2(rendBruto * aliquotaIR)
        rendLiquido = round2(rendBruto - valorIR)
      } else {
        rendBruto = 0
        valorIR = 0
        rendLiquido = 0
        taxaEfetivaPeriodo = 0
      }
    }

    rendimentoBrutoAcumulado += rendBruto
    irEstimadoAcumulado += valorIR
    rendimentoLiquidoAcumulado += rendLiquido

    // Atualiza saldo: saldo + rendimento líquido - parcela
    // Proibido aporte fictício: saldo PODE ficar negativo
    const saldoAposParcela = round2(saldoCorrente + rendLiquido - valorParcela)

    memoria.push({
      numero: i,
      competencia: compParcela,
      dataVencimento,
      diasPeriodo,
      diasAcumulados,
      saldoInicialPeriodo: saldoCorrente,
      taxaEfetivaPeriodo,
      rendimentoBruto: rendBruto,
      aliquotaIR,
      valorIR,
      rendimentoLiquido: rendLiquido,
      valorParcela,
      saldoAposParcela,
    })

    saldoCorrente = saldoAposParcela
    dataAnterior = dataVencimento
  }

  rendimentoBrutoAcumulado = round2(rendimentoBrutoAcumulado)
  irEstimadoAcumulado = round2(irEstimadoAcumulado)
  rendimentoLiquidoAcumulado = round2(rendimentoLiquidoAcumulado)
  const saldoFinal = saldoCorrente

  // Milhas / Pontos
  const dolarEfetivo = cotacaoDolar > 0 ? cotacaoDolar : 5.3
  const valorUSD = precoCartao / dolarEfetivo
  const pontosEstimados = Math.round(valorUSD * (pontosPorDolar || 0))
  const valorEconomicoMilhas = round2((pontosEstimados / 1000) * (valorMilheiro || 20))

  // Comparação econômica sem dupla contagem (Complemento Seção 4)
  // Saldo final = S0 + rendimentos líquidos - sum(parcelas)
  // Vantagem do cartão antes das milhas = saldoFinal (positivo ou negativo)
  // Vantagem líquida final = saldoFinal + valorEconomicoMilhas
  const diferencaNominal = round2(precoCartao - precoPix)
  const beneficioTotalCartao = round2(rendimentoLiquidoAcumulado + valorEconomicoMilhas)
  const vantagemLiquidaFinal = round2(saldoFinal + valorEconomicoMilhas)

  // Preço econômico equivalente do cartão
  // PreçoCartao - (saldoFinal + milhas) == PreçoPix - saldoFinal (sem milhas)
  // com milhas: PreçoCartao - (rendimentoLiquido + milhas) == PreçoPix - vantagemLiquidaFinal
  const precoEconomicoEquivalenteCartao = round2(
    precoCartao - (rendimentoLiquidoAcumulado + valorEconomicoMilhas),
  )

  // Vencedor e magnitudes
  let vencedor: VencedorSimulacao = 'empate'
  let vantagemAbsoluta = 0
  let vantagemRelativa = 0

  if (vantagemLiquidaFinal > 0.005) {
    vencedor = 'cartao'
    vantagemAbsoluta = vantagemLiquidaFinal
    vantagemRelativa = precoPix > 0 ? round2((vantagemAbsoluta / precoPix) * 100) : 0
  } else if (vantagemLiquidaFinal < -0.005) {
    vencedor = 'pix'
    vantagemAbsoluta = Math.abs(vantagemLiquidaFinal)
    vantagemRelativa = precoPix > 0 ? round2((vantagemAbsoluta / precoPix) * 100) : 0
  } else {
    vencedor = 'empate'
    vantagemAbsoluta = 0
    vantagemRelativa = 0
  }

  const magnitude = classificarMagnitude(vantagemRelativa)

  // Desconto de Equilíbrio do Pix (busca binária de centavos no precoPix que zera a vantagem líquida)
  const pixEquilibrioValor = calcularPrecoPixEquilibrio({
    ...params,
    pontosPorDolar,
    cotacaoDolar,
    valorMilheiro,
    percentualCDI,
    cdiAnual,
    modoSimplificadoTeste0,
  })

  const descontoAtualPixPercent =
    precoCartao > 0 ? round2(((precoCartao - precoPix) / precoCartao) * 100) : 0
  const descontoEquilibrioPixPercent =
    precoCartao > 0 ? round2(((precoCartao - pixEquilibrioValor) / precoCartao) * 100) : 0
  const diferencaDescontoPontosPercentuais = round2(
    Math.max(0, descontoEquilibrioPixPercent - descontoAtualPixPercent),
  )

  const fraseDescontoEquilibrio = `O vendedor precisaria oferecer pelo menos ${descontoEquilibrioPixPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}% de desconto no Pix para que ele se tornasse a melhor opção nas premissas atuais.`

  // Frase síntese com magnitude
  const nomeMagnitude =
    magnitude === 'pequena' ? 'pequena' : magnitude === 'moderada' ? 'moderada' : 'relevante'
  let fraseSintese = ''
  if (vencedor === 'cartao') {
    fraseSintese = `Cartão apresenta ${nomeMagnitude} vantagem financeira: R$ ${vantagemAbsoluta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, equivalente a ${vantagemRelativa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% do preço no Pix.`
  } else if (vencedor === 'pix') {
    fraseSintese = `Pix apresenta ${nomeMagnitude} vantagem financeira: R$ ${vantagemAbsoluta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, equivalente a ${vantagemRelativa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% do preço no Pix.`
  } else {
    fraseSintese = `Empate econômico: ambas as formas de pagamento apresentam custos praticamente idênticos nas premissas informadas.`
  }

  const totais: TotaisMemoria = {
    capitalInicialPix: precoPix,
    totalParcelasCartao: round2(valorParcela * nParcelas),
    diferencaNominalPreco: diferencaNominal,
    rendimentoBrutoAcumulado,
    irEstimadoAcumulado,
    rendimentoLiquidoAcumulado,
    valorEconomicoMilhas,
    beneficioTotalCartao,
    saldoFinal,
    vantagemCartaoAntesMilhas: saldoFinal,
    vantagemLiquidaFinal,
  }

  return {
    vencedor,
    vantagemAbsoluta,
    vantagemRelativa,
    magnitude,
    precoPix,
    precoCartao,
    numeroParcelas: nParcelas,
    valorParcela,
    vantagemLiquidaFinal,
    saldoFinal,
    rendimentoLiquidoAcumulado,
    custoAdicionalCartao: diferencaNominal,
    pontosEstimados,
    valorEconomicoMilhas,
    precoEconomicoEquivalenteCartao,
    descontoAtualPixPercent,
    descontoEquilibrioPixPercent,
    pixEquilibrioValor,
    diferencaDescontoPontosPercentuais,
    fraseDescontoEquilibrio,
    fraseSintese,
    memoria,
    totais,
  }
}

/**
 * Busca binária do Preço no Pix que zera a vantagem líquida final (precisão de centavos)
 * usando o MESMO motor determinístico.
 */
export function calcularPrecoPixEquilibrio(params: ParametrosSimulacao): number {
  const { precoCartao } = params
  if (precoCartao <= 0) return 0

  let low = 0
  let high = precoCartao * 1.5
  let bestPix = precoCartao

  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2
    // Evita recursão infinita passando uma flag ou simulando sem recomputar equilíbrio
    const res = calcularSimulacaoInterna({ ...params, precoPix: mid })
    const vantagem = res.vantagemLiquidaFinal // >0 cartao melhor, <0 pix melhor

    if (Math.abs(vantagem) < 0.01) {
      bestPix = mid
      break
    }

    // Se vantagem > 0, cartão vence, Pix precisa ser mais barato para equilibrar (pixEquilibrio < mid)
    if (vantagem > 0) {
      high = mid
      bestPix = mid
    } else {
      low = mid
      bestPix = mid
    }
  }

  return round2(bestPix)
}

/**
 * Versão interna de cálculo sem a chamada a calcularPrecoPixEquilibrio
 */
function calcularSimulacaoInterna(params: ParametrosSimulacao): {
  saldoFinal: number
  vantagemLiquidaFinal: number
  rendimentoLiquidoAcumulado: number
} {
  const {
    precoPix,
    precoCartao,
    numeroParcelas,
    dataCompra,
    diaFechamentoCartao,
    diaVencimentoCartao,
    pontosPorDolar = 0,
    cotacaoDolar = 5.3,
    valorMilheiro = 20.0,
    percentualCDI = 100,
    cdiAnual = 0.1375,
    modoSimplificadoTeste0 = false,
  } = params

  const nParcelas = Math.max(1, Math.floor(numeroParcelas))
  const valorParcela = round2(precoCartao / nParcelas)
  const taxaAnualBruta = cdiAnual * (percentualCDI / 100)
  const taxaDiaria = Math.pow(1 + taxaAnualBruta, 1 / 365) - 1
  const taxaMensalLiqTeste0 = Math.pow(1 + 0.1375 * (1 - 0.225), 1 / 12) - 1

  const competenciaInicial = calcularCompetenciaInicial(
    dataCompra,
    diaFechamentoCartao,
    diaVencimentoCartao,
  )

  let saldoCorrente = precoPix
  let dataAnterior = dataCompra
  let rendimentoLiquidoAcumulado = 0

  for (let i = 1; i <= nParcelas; i++) {
    const compParcela = adicionarMesesCompetencia(competenciaInicial, i - 1)
    const dataVencimento = calcularDataVencimentoFatura(
      compParcela,
      diaFechamentoCartao,
      diaVencimentoCartao,
    )

    const diasPeriodo = diferencaDiasCorridos(dataAnterior, dataVencimento)
    const diasAcumulados = diferencaDiasCorridos(dataCompra, dataVencimento)

    let rendLiquido = 0

    if (modoSimplificadoTeste0) {
      rendLiquido = round2(saldoCorrente * taxaMensalLiqTeste0)
    } else {
      const aliquotaIR = obterAliquotaIRRegressivo(diasAcumulados)
      if (saldoCorrente > 0 && diasPeriodo > 0) {
        const fatorBruto = Math.pow(1 + taxaDiaria, diasPeriodo) - 1
        const rendBruto = round2(saldoCorrente * fatorBruto)
        const valorIR = round2(rendBruto * aliquotaIR)
        rendLiquido = round2(rendBruto - valorIR)
      }
    }

    rendimentoLiquidoAcumulado += rendLiquido
    saldoCorrente = round2(saldoCorrente + rendLiquido - valorParcela)
    dataAnterior = dataVencimento
  }

  const dolarEfetivo = cotacaoDolar > 0 ? cotacaoDolar : 5.3
  const valorUSD = precoCartao / dolarEfetivo
  const pontosEstimados = Math.round(valorUSD * (pontosPorDolar || 0))
  const valorEconomicoMilhas = round2((pontosEstimados / 1000) * (valorMilheiro || 20))
  const vantagemLiquidaFinal = round2(saldoCorrente + valorEconomicoMilhas)

  return {
    saldoFinal: saldoCorrente,
    vantagemLiquidaFinal,
    rendimentoLiquidoAcumulado: round2(rendimentoLiquidoAcumulado),
  }
}

/**
 * Compara múltiplos cenários de parcelamento (1x, 3x, 6x, 10x, 12x, etc.)
 * para alimentar a tabela comparativa (Complemento Seção 17 e PDF Principal Seção 17).
 */
/**
 * Atalho para a simulação simplificada do Teste 0 (Complemento Seção 2)
 */
export function calcularSimulacaoSimplificada(params: {
  precoPix: number
  precoCartao: number
  numeroParcelas: number
  taxaAnualReferencia?: number
  irSimplificado?: number
}) {
  const taxaAnual = params.taxaAnualReferencia ?? 0.1375
  const ir = params.irSimplificado ?? 0.225
  const taxaMensalLiq = Math.pow(1 + taxaAnual * (1 - ir), 1 / 12) - 1
  const valorParcela = round2(params.precoCartao / params.numeroParcelas)

  let saldo = params.precoPix
  let rendAcum = 0
  const periodos: Array<{
    parcela: number
    rendimentoPeriodo: number
    saldoAposParcela: number
  }> = []

  for (let i = 1; i <= params.numeroParcelas; i++) {
    const rend = round2(saldo * taxaMensalLiq)
    rendAcum = round2(rendAcum + rend)
    saldo = round2(saldo + rend - valorParcela)
    periodos.push({
      parcela: i,
      rendimentoPeriodo: rend,
      saldoAposParcela: saldo,
    })
  }

  return {
    capitalInicial: params.precoPix,
    rendimentoLiquidoAcumulado: rendAcum,
    saldoFinal: saldo,
    vantagemCartao: saldo,
    periodos,
  }
}

/**
 * Aliases de compatibilidade para funções utilitárias de datas e projeções
 */
export const calcularDataVencimentoPrimeiraParcela = calcularDataVencimentoFatura
export const encontrarPrecoPixEquilibrio = calcularPrecoPixEquilibrio

export function calcularProjetarVencimentos(
  dataCompra: string,
  diaFechamentoCartao: number,
  diaVencimentoCartao: number,
  totalParcelas: number,
): string[] {
  const compInicial = calcularCompetenciaInicial(
    dataCompra,
    diaFechamentoCartao,
    diaVencimentoCartao,
  )
  const vencimentos: string[] = []
  for (let i = 0; i < totalParcelas; i++) {
    const comp = adicionarMesesCompetencia(compInicial, i)
    vencimentos.push(calcularDataVencimentoFatura(comp, diaFechamentoCartao, diaVencimentoCartao))
  }
  return vencimentos
}

export function compararParcelamentos(
  params: ParametrosSimulacao,
  opcoesParcelas: number[] = [1, 3, 6, 10, 12],
): CenariosComparativosItem[] {
  const lista: CenariosComparativosItem[] = []

  // Item Pix
  lista.push({
    forma: 'Pix',
    parcelas: 1,
    nominal: params.precoPix,
    beneficioAplicacao: 0,
    milhas: 0,
    custoEquivalente: params.precoPix,
    vantagemVsPix: 0,
    isMelhor: false,
  })

  // Itens Cartão
  let menorCusto = params.precoPix
  let melhorForma = 'Pix'

  for (const n of opcoesParcelas) {
    const sim = calcularSimulacao({
      ...params,
      numeroParcelas: n,
    })

    const item: CenariosComparativosItem = {
      forma: `Cartão ${n}x`,
      parcelas: n,
      nominal: params.precoCartao,
      beneficioAplicacao: sim.rendimentoLiquidoAcumulado,
      milhas: sim.valorEconomicoMilhas,
      custoEquivalente: sim.precoEconomicoEquivalenteCartao,
      vantagemVsPix: sim.totais.vantagemLiquidaFinal,
      isMelhor: false,
    }

    if (item.custoEquivalente < menorCusto) {
      menorCusto = item.custoEquivalente
      melhorForma = item.forma
    }

    lista.push(item)
  }

  // Marcar a melhor alternativa
  return lista.map((i) => ({
    ...i,
    isMelhor: i.forma === melhorForma,
  }))
}
