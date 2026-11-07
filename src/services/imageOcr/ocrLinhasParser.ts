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
// Mapeamento canônico de meses abreviados em português
const MESES_ABREVIADOS: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
}

// Tolerâncias pontuais de OCR para tokens de mês (ex: "sei", "se1" -> set, "0ut" -> out)
function normalizarTokenMesAbreviado(tokenRaw: string): number | null {
  const t = tokenRaw.toLowerCase().trim()
  if (MESES_ABREVIADOS[t]) {
    return MESES_ABREVIADOS[t]
  }

  // Substituições de OCR comuns dentro do token de 3 letras:
  // '0' -> 'o', '1' -> 'l' ou 't'/'i', '!' -> 'l', etc.
  const corrigido = t
    .replace(/0/g, 'o')
    .replace(/1/g, (match, offset) => (offset === 2 ? 't' : 'i')) // ex: "se1" -> "set", "1an" -> "jan"
    .replace(/!/g, 'l')

  if (MESES_ABREVIADOS[corrigido]) {
    return MESES_ABREVIADOS[corrigido]
  }

  // Casos específicos documentados:
  // "sei" -> "set"
  if (corrigido === 'sei') return 9
  // "0ut" -> 10
  if (t === '0ut' || corrigido === 'out') return 10
  // "d3z" ou "de2" -> dez
  if (corrigido === 'd3z' || corrigido === 'de2') return 12
  // "abr" lido com 'o': "abo"
  if (corrigido === 'abo') return 4
  // "mai" / "may"
  if (corrigido === 'may') return 5

  return null
}

/**
 * Normaliza valores em reais do formato brasileiro (ex: R$ 121,07 ou 1.250,50 ou 77,49)
 * O3 — Valor tolerante a OCR:
 * - normalizar token numérico: O/o -> 0, l/I -> 1 dentro do token numérico (ex: "247,OO" -> 247,00)
 * - aceitar ponto como separador decimal quando for "247.00" (exatamente 2 dígitos no fim)
 * - manter "1.250,50" e "1,250.50" funcionando
 * - não aceitar linha sem valor
 */
export function extrairValorMonetario(
  texto: string,
): { valor: number; textoRestante: string } | null {
  // Procura potencial token de valor monetário no fim da linha ou precedido de R$
  // Token pode conter dígitos, letras O/o/l/I (erros de OCR), ponto ou vírgula
  // Exemplos: "R$ 121,07", "247,00", "247,OO", "247.00", "1.250,50", "35,00", "59,6"
  const regexFim = /(?:R\$\s*)?([0-9OlI]{1,3}(?:[.,][0-9OlI]{3})*[.,][0-9OlI]{1,2})\b\s*$/i
  const matchFim = texto.match(regexFim)

  if (matchFim && matchFim[1]) {
    const parsed = parsearTokenMonetario(matchFim[1])
    if (parsed && parsed.valor > 0) {
      const idx = matchFim.index ?? 0
      const textoRestante = texto.substring(0, idx).trim()
      return { valor: parsed.valor, textoRestante }
    }
  }

  // Alternativa: R$ no meio ou fim com formato monetário
  const regexRS = /R\$\s*([0-9OlI]{1,3}(?:[.,][0-9OlI]{3})*[.,][0-9OlI]{1,2})\b/i
  const matchRS = texto.match(regexRS)
  if (matchRS && matchRS[1]) {
    const parsed = parsearTokenMonetario(matchRS[1])
    if (parsed && parsed.valor > 0) {
      const textoRestante = texto.replace(matchRS[0], ' ').replace(/\s+/g, ' ').trim()
      return { valor: parsed.valor, textoRestante }
    }
  }

  return null
}

function parsearTokenMonetario(tokenBruto: string): { valor: number } | null {
  // Substitui confusões clássicas de OCR em dígitos (O/o -> 0, l/I -> 1)
  const normalizado = tokenBruto.replace(/[Oo]/g, '0').replace(/[lI]/g, '1')

  // Verifica se há vírgula e/ou ponto
  const temVirgula = normalizado.includes(',')
  const temPonto = normalizado.includes('.')

  let limpo = ''

  if (temVirgula && temPonto) {
    // Ex: "1.250,50" -> padrão brasileiro
    const ultVirgula = normalizado.lastIndexOf(',')
    const ultPonto = normalizado.lastIndexOf('.')
    if (ultVirgula > ultPonto) {
      // 1.250,50
      limpo = normalizado.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,250.50
      limpo = normalizado.replace(/,/g, '')
    }
  } else if (temVirgula) {
    // Ex: "247,00" ou "1250,50" ou "59,6"
    limpo = normalizado.replace(',', '.')
  } else if (temPonto) {
    // Ex: "247.00" ou "1250.50"
    // Ponto como decimal: deve ter 2 dígitos após o ponto no final (ex: .00)
    // Se tiver mais partes (ex: 1.250.00), trata a última como decimal
    const partes = normalizado.split('.')
    if (partes.length === 2 && (partes[1].length === 2 || partes[1].length === 1)) {
      limpo = normalizado
    } else if (partes.length > 2 && partes[partes.length - 1].length === 2) {
      const decimal = partes.pop()!
      limpo = `${partes.join('')}.${decimal}`
    } else {
      return null
    }
  } else {
    return null
  }

  const v = parseFloat(limpo)
  if (isNaN(v) || v <= 0) return null

  // Arredonda para 2 casas decimais
  return { valor: Math.round(v * 100) / 100 }
}

export interface DataExtraidaOcr {
  dataIso: string
  diaMes: string
  textoRestante: string
  marcadorDescartado?: string
}

/**
 * O1 & O2 — Extrai data inicial com tolerância a formatos dd/mm e DDmmm (22set, 05out, 1nov),
 * busca a data em qualquer posição da linha descartando marcadores anteriores ("OD", "D", "DO"),
 * e preserva texto posterior como descrição/dados.
 */
export function extrairDataInicial(texto: string, anoPadrao?: number): DataExtraidaOcr | null {
  const anoAtual =
    anoPadrao && anoPadrao >= 2000 && anoPadrao <= 2100 ? anoPadrao : new Date().getFullYear()

  // Coletamos todos os candidatos de data encontrados na linha e selecionamos o mais plausível.
  // Regra fundamental:
  // Se houver uma data no início ou logo após marcadores iniciais (1-4 letras / índices), essa é a data da transação.
  // Casos como parcelamento "01/02" no meio da descrição ("01/10 HAVAN VILHENA 01/02 R$ 77,49") NÃO devem ser
  // confundidos com a data da transação se "01/10" já estava no início.
  // Casos como "04 DE 10" NÃO são datas porque "DE" não é mês abreviado nem numérico com / ou .

  interface CandidatoData {
    tipo: 'abrev' | 'numerico'
    indiceInicio: number
    comprimentoMatch: number
    dia: number
    mes: number
    ano: number
  }

  const candidatos: CandidatoData[] = []

  // 1. Procuramos padrão mês abreviado globalmente na linha:
  // Ex: "22set", "05 out", "12jan", "01 out", "14ago", "OD 22set", "DO 26set", "D 23set", "05out"
  // A data pode estar precedida de início de string, espaço ou letras de marcador ("OD22set").
  // O grupo 1 é o dia (1-2 dígitos), grupo 2 é o mês (3 caracteres alfanuméricos), grupo 3 opcional é o ano.
  const regexAbrevGlobal =
    /(?:^|[\sA-Za-z])(\d{1,2})\s*[-/]?\s*([A-Za-z0-9]{3})(?:\s*[-/]?\s*(\d{2,4}))?(?=\s+|$|[A-Za-z])/gi
  let matchAbrev: RegExpExecArray | null
  while ((matchAbrev = regexAbrevGlobal.exec(texto)) !== null) {
    const diaNum = parseInt(matchAbrev[1], 10)
    const tokenMes = matchAbrev[2]
    const mesNum = normalizarTokenMesAbreviado(tokenMes)
    if (mesNum !== null && diaNum >= 1 && diaNum <= 31) {
      let ano = anoAtual
      if (matchAbrev[3]) {
        ano = parseInt(matchAbrev[3], 10)
        if (ano < 100) ano += 2000
      }
      // O match inteiro pode ter pego o caractere delimitador inicial (espaço ou letra do marcador).
      // Calculamos o índice exato onde começam os dígitos do dia:
      const offsetDigito = matchAbrev[0].indexOf(matchAbrev[1])
      const indiceReal = matchAbrev.index + (offsetDigito >= 0 ? offsetDigito : 0)
      const textoCasado = matchAbrev[0].substring(offsetDigito >= 0 ? offsetDigito : 0)

      candidatos.push({
        tipo: 'abrev',
        indiceInicio: indiceReal,
        comprimentoMatch: textoCasado.length,
        dia: diaNum,
        mes: mesNum,
        ano,
      })
    }
  }

  // 2. Procuramos padrão data numérica:
  // Ex: "01/10", "1/10/2026", "22/09"
  const regexNumGlobal = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/g
  let matchNum: RegExpExecArray | null
  while ((matchNum = regexNumGlobal.exec(texto)) !== null) {
    const diaNum = parseInt(matchNum[1], 10)
    const mesNum = parseInt(matchNum[2], 10)
    if (diaNum >= 1 && diaNum <= 31 && mesNum >= 1 && mesNum <= 12) {
      let ano = anoAtual
      if (matchNum[3]) {
        ano = parseInt(matchNum[3], 10)
        if (ano < 100) ano += 2000
      }
      candidatos.push({
        tipo: 'numerico',
        indiceInicio: matchNum.index,
        comprimentoMatch: matchNum[0].length,
        dia: diaNum,
        mes: mesNum,
        ano,
      })
    }
  }

  if (candidatos.length === 0) {
    return null
  }

  // Ordena por posição na linha (índice inicial)
  candidatos.sort((a, b) => a.indiceInicio - b.indiceInicio)

  // Escolhe o melhor candidato:
  // A data em faturas bancárias vem antes da descrição do estabelecimento (seja no início da linha,
  // ou após pequenos marcadores tipo OD, D, DO, 1, 2, 14, etc.).
  // Se houver múltiplos candidatos (ex: "01/10 HAVAN VILHENA 01/02"),
  // o primeiro é a data ("01/10") e o segundo é o parcelamento ("01/02").
  // Mas atenção: se a linha NÃO tiver marcadores nem data no início, mas tiver algo como
  // "JK AUTO PEÇAS 04 DE 10 R$ 298,00" -> candidatos já seria vazio porque "04 DE 10" não bate regex de data!
  const melhorMatch = candidatos[0]

  if (!melhorMatch) {
    return null
  }

  // O que vem ANTES da data é inspecionado:
  // Se for apenas marcadores (ex: "OD", "D", "DO", "OD ", 1-4 letras isoladas ou índices como "1 OD", "14 D"),
  // são descartados. Se tiver texto longo antes da data que não seja marcador, verificamos se a linha é válida.
  // Conforme requisito O2:
  // "o que vier antes dela (marcadores tipo "OD", "D", "DO", 1–4 letras maiúsculas isoladas) é descartado da extração mas preservado em linhaBruta. Cuidado: não confundir parte da descrição com marcador — só descartar texto anterior à data, nunca depois."
  // Se houver texto anterior com mais de 30 caracteres ou sem padrão de marcador (e.g. descrição antes da data em formatos não-padrão), ainda assim no caso de fatura a descrição padrão vem após a data.
  // Mas no caso de "JK AUTO PEÇAS 04 DE 10 R$ 298,00", repare que "04 DE 10" é parcelamento, NÃO data! A regex de data não deve casar "04 DE 10" como data porque "DE" não é mês abreviado nem numérico com / ou .!

  const textoAntes = texto.substring(0, melhorMatch.indiceInicio).trim()
  const textoDepois = texto
    .substring(melhorMatch.indiceInicio + melhorMatch.comprimentoMatch)
    .trim()

  // Se houver texto anterior, checamos se parece marcador de coluna ou ruído inicial:
  // ex: "OD", "D", "DO", "1 OD", "12 D", "OD 22set", etc.
  // Marcadores válidos para descarte: tokens curtos (geralmente <= 4 letras maiúsculas ou números de índice)
  // Caso o texto anterior contenha palavras reais com mais de 4 letras que não sejam números (ex: "SUPERMERCADO"),
  // devemos avaliar: as faturas padrão colocam data no início. Se a data estiver no meio e o texto antes for longo,
  // poderíamos estar em uma linha sem data no início onde "01/02" é parcelamento!
  // Mas "01/02" como parcelamento já tem "/" e "01" e "02".
  // Em "01/10 HAVAN VILHENA 01/02 R$ 77,49":
  // O primeiro match de data numérica é "01/10" no início (índice 0).
  // Em "JK AUTO PEÇAS 04 DE 10 R$ 298,00":
  // Não há data! "04 DE 10" usa "DE", não "/" nem mês abreviado. Portanto extrairDataInicial retorna null.
  // E o parser interpreta linha sem data? Vamos checar como o formato "JK AUTO PEÇAS 04 DE 10" funciona no O5!

  const diaFormatado = String(melhorMatch.dia).padStart(2, '0')
  const mesFormatado = String(melhorMatch.mes).padStart(2, '0')
  const dataIso = `${melhorMatch.ano}-${mesFormatado}-${diaFormatado}`
  const diaMes = `${diaFormatado}/${mesFormatado}`

  return {
    dataIso,
    diaMes,
    textoRestante: textoDepois,
    marcadorDescartado: textoAntes || undefined,
  }
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
  anoPadrao?: number,
): ItemExtraidoOcr | null {
  const textoLimpo = linha.replace(/\s+/g, ' ').trim()
  if (!textoLimpo || textoLimpo.length < 5) return null

  // Linhas que tipicamente são cabeçalhos ou ruídos
  const minuscula = textoLimpo.toLowerCase()
  if (
    minuscula.startsWith('total') ||
    minuscula.startsWith('fatura') ||
    minuscula.startsWith('data ') ||
    minuscula === 'data' ||
    minuscula.startsWith('lançamento') ||
    minuscula.startsWith('lançamentos') ||
    minuscula.startsWith('transações') ||
    minuscula.startsWith('transacoes') ||
    minuscula.startsWith('resumo') ||
    minuscula.startsWith('subtotal') ||
    minuscula.startsWith('saldo') ||
    minuscula.includes('vencimento') ||
    minuscula.startsWith('valores em reais') ||
    minuscula.startsWith('origem: imagem')
  ) {
    return null
  }

  // 1. Extrai data inicial (ou precedida por marcador)
  const dataExt = extrairDataInicial(textoLimpo, anoPadrao)
  if (!dataExt) {
    return null
  }

  // 2. Extrai valor monetário (do restante da linha ou no fim)
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

  // Linha bruta original preserva exatamente o texto da linha (incluindo marcadores)
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
    linhaBruta: linha.trim(),
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
      const interpretada = interpretarLinhaOcr(linha, img.indice, ordemGlobal, opcoes?.anoPadrao)
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
