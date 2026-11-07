import {
  ParserResult,
  LinhaFaturaExtraida,
  FaturaCabecalhoExtraido,
  TipoLinhaFatura,
  TratamentoLinhaFatura,
} from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from '../pdf/normalizadorEstabelecimento'

export interface ImagemExtraidaDiagnostico {
  indice: number
  nome: string
  linhasBrutas: string[]
  linhasReconhecidas: number
  linhasNaoInterpretadas: string[]
}

export interface ResultadoOcrImagens {
  parserResult: ParserResult
  diagnosticos: ImagemExtraidaDiagnostico[]
  totalLinhasReconhecidas: number
  totalLinhasBrutas: number
  sobreposicoesDetectadas: number
  capturaParcial: boolean
}

export interface OpcoesProcessamentoOcr {
  anoPadrao?: number
  nomeCartao?: string
}

export type NivelConfiancaOcr = 'alta' | 'media' | 'baixa'

export interface ItemExtraidoOcr {
  ordem: number
  dataStr: string // YYYY-MM-DD
  diaMes: string // DD/MM
  descricaoOriginal: string
  descricaoNormalizada: string
  valor: number
  parcelaAtual?: number
  totalParcelas?: number
  confianca: NivelConfiancaOcr
  motivoConfianca?: string
  origemImagemIndice: number
  linhaBruta: string
}

/**
 * Normaliza valores em reais do formato brasileiro (ex: R$ 121,07 ou 1.250,50 ou 77,49)
 */
export function extrairValorMonetario(
  texto: string,
): { valor: number; textoRestante: string } | null {
  // Procura padrão de valor monetário no fim da linha ou precedido de R$
  // Exemplos: R$ 121,07 | R$121,07 | 121,07 | 1.250,00 | R$ 1.250,00
  const regexValorFinal = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\b\s*$/i
  const match = texto.match(regexValorFinal)

  if (match && match[1]) {
    const limpo = match[1].replace(/\./g, '').replace(',', '.')
    const v = parseFloat(limpo)
    if (!isNaN(v) && v > 0) {
      const idx = match.index ?? 0
      const textoRestante = texto.substring(0, idx).trim()
      return { valor: v, textoRestante }
    }
  }

  // Alternativa: R$ no meio
  const regexRSMeio = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/i
  const matchRS = texto.match(regexRSMeio)
  if (matchRS && matchRS[1]) {
    const limpo = matchRS[1].replace(/\./g, '').replace(',', '.')
    const v = parseFloat(limpo)
    if (!isNaN(v) && v > 0) {
      const textoRestante = texto.replace(matchRS[0], ' ').replace(/\s+/g, ' ').trim()
      return { valor: v, textoRestante }
    }
  }

  return null
}

/**
 * Extrai data inicial dd/mm ou dd/mm/aaaa
 */
export function extrairDataInicial(texto: string): {
  dataIso: string
  diaMes: string
  textoRestante: string
} | null {
  const regexData = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b\s*/
  const match = texto.match(regexData)
  if (!match) return null

  const dia = parseInt(match[1], 10)
  const mes = parseInt(match[2], 10)

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) {
    return null
  }

  const anoAtual = new Date().getFullYear()
  let ano = anoAtual
  if (match[3]) {
    ano = parseInt(match[3], 10)
    if (ano < 100) ano += 2000
  }

  const diaFormatado = String(dia).padStart(2, '0')
  const mesFormatado = String(mes).padStart(2, '0')
  const dataIso = `${ano}-${mesFormatado}-${diaFormatado}`
  const diaMes = `${diaFormatado}/${mesFormatado}`
  const textoRestante = texto.substring(match[0].length).trim()

  return { dataIso, diaMes, textoRestante }
}

/**
 * Extrai parcelamento da descrição (01/02 ou 04 DE 10 ou 1/12 ou PARC 02/05)
 */
export function extrairParcelamento(texto: string): {
  parcelaAtual: number
  totalParcelas: number
  textoLimpo: string
} | null {
  // Padrão 1: "01/02" ou "1/2" ou "04/10"
  const regexBarra = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/
  const matchBarra = texto.match(regexBarra)
  if (matchBarra) {
    const p = parseInt(matchBarra[1], 10)
    const t = parseInt(matchBarra[2], 10)
    if (p >= 1 && t >= 2 && p <= t && t <= 99) {
      const textoLimpo = texto.replace(matchBarra[0], ' ').replace(/\s+/g, ' ').trim()
      return { parcelaAtual: p, totalParcelas: t, textoLimpo }
    }
  }

  // Padrão 2: "04 DE 10" ou "4 DE 12" ou "PARC 04 DE 10"
  const regexDe = /\b(?:PARC(?:ELA)?\s*)?(\d{1,2})\s+DE\s+(\d{1,2})\b/i
  const matchDe = texto.match(regexDe)
  if (matchDe) {
    const p = parseInt(matchDe[1], 10)
    const t = parseInt(matchDe[2], 10)
    if (p >= 1 && t >= 2 && p <= t && t <= 99) {
      const textoLimpo = texto.replace(matchDe[0], ' ').replace(/\s+/g, ' ').trim()
      return { parcelaAtual: p, totalParcelas: t, textoLimpo }
    }
  }

  return null
}

/**
 * Tenta parsear uma única linha de texto bruto extraída do OCR
 */
export function interpretarLinhaOcr(
  linha: string,
  indiceImagem: number,
  ordem: number,
): ItemExtraidoOcr | null {
  const textoLimpo = linha.replace(/\s+/g, ' ').trim()
  if (!textoLimpo || textoLimpo.length < 5) return null

  // Linhas que tipicamente são cabeçalhos ou ruídos
  const minuscula = textoLimpo.toLowerCase()
  if (
    minuscula.startsWith('total') ||
    minuscula.startsWith('fatura') ||
    minuscula.startsWith('data') ||
    minuscula.startsWith('lançamento') ||
    minuscula.startsWith('lançamentos') ||
    minuscula.startsWith('transações') ||
    minuscula.startsWith('resumo') ||
    minuscula.startsWith('subtotal') ||
    minuscula.startsWith('saldo') ||
    minuscula.includes('vencimento')
  ) {
    return null
  }

  // 1. Extrai data inicial
  const dataExt = extrairDataInicial(textoLimpo)
  if (!dataExt) {
    return null
  }

  // 2. Extrai valor monetário
  const valorExt = extrairValorMonetario(dataExt.textoRestante)
  if (!valorExt) {
    return null
  }

  // 3. Descrição intermediária
  let descRaw = valorExt.textoRestante.trim()
  if (!descRaw || descRaw.length < 2) {
    return null
  }

  // 4. Extrai parcelamento se houver
  const parcExt = extrairParcelamento(descRaw)
  let parcelaAtual: number | undefined = undefined
  let totalParcelas: number | undefined = undefined
  if (parcExt) {
    parcelaAtual = parcExt.parcelaAtual
    totalParcelas = parcExt.totalParcelas
    descRaw = parcExt.textoLimpo
  }

  // Normalização do estabelecimento
  const descNormalizada = normalizarNomeEstabelecimento(descRaw)

  // Avaliação de confiança
  let confianca: NivelConfiancaOcr = 'alta'
  let motivoConfianca: string | undefined = undefined

  // Se a descrição for muito curta ou cheia de caracteres estranhos
  if (descRaw.length < 3 || /[^a-zA-Z0-9\s.*-/]/.test(descRaw)) {
    confianca = 'media'
    motivoConfianca = 'Descrição com caracteres atípicos'
  }

  // Se valor for suspeito ou nulo
  if (valorExt.valor <= 0 || valorExt.valor > 500000) {
    confianca = 'baixa'
    motivoConfianca = 'Valor atípico'
  }

  return {
    ordem,
    dataStr: dataExt.dataIso,
    diaMes: dataExt.diaMes,
    descricaoOriginal: descRaw,
    descricaoNormalizada: descNormalizada || descRaw,
    valor: valorExt.valor,
    parcelaAtual,
    totalParcelas,
    confianca,
    motivoConfianca,
    origemImagemIndice: indiceImagem,
    linhaBruta: textoLimpo,
  }
}

/**
 * Processa as linhas brutas de múltiplas imagens consecutivas com tolerância de sobreposição.
 * C3: Se houver repetição entre imagens consecutivas (ex: Imagem 1 termina DROGASIL, Imagem 2 começa DROGASIL),
 * detecta e sinaliza como duplicado (ou descarta caso seja sobreposição inequívoca).
 */
export interface ImagemEntradaOcr {
  indice: number
  nome: string
  lines?: string[]
  linhas?: string[]
}

export function processarLinhasOcrMultiplasImagens(
  imagens: Array<ImagemEntradaOcr>,
  opcoes?: OpcoesProcessamentoOcr,
): ResultadoOcrImagens {
  const itensCandidatos: ItemExtraidoOcr[] = []
  const diagnosticos: ImagemExtraidaDiagnostico[] = []
  let ordemGlobal = 1
  let sobreposicoesDetectadas = 0
  const avisosGerais: string[] = []

  imagens.forEach((img) => {
    let reconhecidasImg = 0
    const naoInterpretadasImg: string[] = []
    const linhasOriginais = img.lines || img.linhas || []

    linhasOriginais.forEach((linha) => {
      const interpretada = interpretarLinhaOcr(linha, img.indice, ordemGlobal)
      if (interpretada) {
        itensCandidatos.push(interpretada)
        ordemGlobal++
        reconhecidasImg++
      } else {
        const t = linha.trim()
        if (t.length > 3) {
          naoInterpretadasImg.push(t)
        }
      }
    })

    diagnosticos.push({
      indice: img.indice,
      nome: img.nome,
      linhasBrutas: linhasOriginais,
      linhasReconhecidas: reconhecidasImg,
      linhasNaoInterpretadas: naoInterpretadasImg,
    })
  })

  // Detecção de sobreposição e repetições entre imagens consecutivas
  // Exemplo do documento: Imagem 1 termina "DROGASIL R$ 121,07", Imagem 2 começa "DROGASIL R$ 121,07"
  const linhasFinais: LinhaFaturaExtraida[] = []
  const chavesVistas = new Map<string, { ordem: number; imagemIndice: number }>()

  itensCandidatos.forEach((item) => {
    const chaveItem = `${item.dataStr}_${item.valor.toFixed(2)}_${item.descricaoNormalizada.toUpperCase()}_${item.parcelaAtual || 0}`
    const itemAnterior = chavesVistas.get(chaveItem)

    let ehDuplicadoSobreposicao = false
    if (itemAnterior) {
      // Se veio de imagem diferente subsequente, é provável repetição por sobreposição de captura!
      if (itemAnterior.imagemIndice !== item.origemImagemIndice) {
        sobreposicoesDetectadas++
        ehDuplicadoSobreposicao = true
        avisosGerais.push(
          `Provável repetição por sobreposição entre Imagem ${itemAnterior.imagemIndice + 1} e Imagem ${item.origemImagemIndice + 1}: "${item.descricaoOriginal}" (R$ ${item.valor.toFixed(2)}). Sinalizado como Provável Duplicado.`,
        )
      }
    } else {
      chavesVistas.set(chaveItem, { ordem: item.ordem, imagemIndice: item.origemImagemIndice })
    }

    const tipo: TipoLinhaFatura = item.parcelaAtual ? 'parcelado' : 'compra'
    const tratamento: TratamentoLinhaFatura = 'compra'

    const linhaExtraida: LinhaFaturaExtraida = {
      ordem: linhasFinais.length + 1,
      tipo,
      tratamento,
      data: item.dataStr,
      descricaoOriginal: item.descricaoOriginal,
      descricaoNormalizada: item.descricaoNormalizada,
      valor: item.valor,
      parcelaAtual: item.parcelaAtual,
      totalParcelas: item.totalParcelas,
      valorParcela: item.parcelaAtual ? item.valor : undefined,
      valorTotalEstimado:
        item.parcelaAtual && item.totalParcelas ? item.valor * item.totalParcelas : item.valor,
    }

    // Marcações em metadata
    if (ehDuplicadoSobreposicao) {
      ;(linhaExtraida as any).provavelDuplicadoSobreposicao = true
    }
    if (item.confianca === 'baixa' || item.confianca === 'media') {
      ;(linhaExtraida as any).confiancaOcr = item.confianca
      ;(linhaExtraida as any).motivoConfianca = item.motivoConfianca
    }

    linhasFinais.push(linhaExtraida)
  })

  const somaValores = linhasFinais.reduce((acc, l) => acc + l.valor, 0)

  // Monta cabecalho unificado
  const cabecalho: FaturaCabecalhoExtraido = {
    emissor: 'outro',
    emissorNome: opcoes?.nomeCartao
      ? `Captura por Imagem (${opcoes.nomeCartao})`
      : 'Captura por Imagem (OCR)',
    titulares: [],
    finais: [],
    competencia: undefined,
    vencimento: undefined,
    fechamento: undefined,
    valorTotalFatura: 0, // Captura parcial: conferência com o total integral não disponível
    moeda: 'BRL',
    quantidadeItens: linhasFinais.length,
    pdfProtegido: false,
  }

  const parserResult: ParserResult = {
    cabecalho,
    linhas: linhasFinais,
    avisos: avisosGerais,
    resumoFinanceiro: {
      valorTotalFatura: 0,
      comprasEncargosReconhecidos: somaValores,
      creditosRelevantes: 0,
      diferenca: somaValores,
      conferido: false,
    },
  }

  return {
    parserResult,
    diagnosticos,
    totalLinhasReconhecidas: linhasFinais.length,
    totalLinhasBrutas: imagens.reduce(
      (acc, img) => acc + (img.lines || img.linhas || []).length,
      0,
    ),
    sobreposicoesDetectadas,
    capturaParcial: true,
  }
}
