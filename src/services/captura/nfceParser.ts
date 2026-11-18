/**
 * Parser de NFC-e / Cupom Fiscal — SAP v0.0.98
 *
 * DOIS PERFIS DISTINTOS (nunca reutilizar o parser de fatura, que busca
 * Data/Descrição/Parcela/Valor):
 *
 * 1. PAPEL (foto do cupom fiscal):
 *    Pares de linhas: a 1ª linha do par é a DESCRIÇÃO; o ÚLTIMO valor
 *    monetário da 2ª linha do par é o VALOR TOTAL. Demais dados ignorados.
 *    Exemplo do usuário:
 *      AMACIANTE YPE ACONCHEGO
 *      TOTAL: 21,96        → candidato "AMACIANTE YPE ACONCHEGO" R$ 21,96
 *
 * 2. DIGITAL (captura de tela da página da NFC-e):
 *    Bloco de itens (texto azul no documento). Descrição = texto da linha
 *    do item; Valor = último valor monetário da LINHA SEGUINTE.
 *    Exemplo do usuário: "CENOURA KGR" / "3,35" → "CENOURA KGR" R$ 3,35.
 *    Cabeçalho (emitente, CNPJ, chave de acesso), totais de tributos e
 *    QR Code são ignorados. Quantidade > 1 usa o VALOR TOTAL DA LINHA
 *    (nunca o unitário).
 */

export type TrilhaCaptura = 'papel' | 'digital'

export type StatusItemCaptura = 'pronto' | 'revisar' | 'repetido'

export interface ItemCandidatoOcr {
  descricao: string
  valor: number
  quantidade: number | null
  valorUnitario: number | null
  status: StatusItemCaptura
  confianca: 'alta' | 'baixa'
  origemImagemIndex: number
  linhaBruta: string
}

const RE_VALOR = /(?:R?\$?\s*)?(\d{1,3}(?:\.\d{3})*),(\d{2})\b/g
const RE_QTD = /(\d{1,4})\s*(?:UN|UNID|UNIDADES?|KG|G|ML|L|CX|PC|PCT|LT)\b/i

/** Extrai todos os valores monetários de uma linha (formato pt-BR: 1.234,56). */
export function extrairValoresLinha(linha: string): number[] {
  const valores: number[] = []
  RE_VALOR.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_VALOR.exec(linha)) !== null) {
    const inteiro = m[1].replace(/\./g, '')
    const v = Number(`${inteiro}.${m[2]}`)
    if (Number.isFinite(v) && v >= 0) valores.push(v)
  }
  return valores
}

function normalizarDescricao(txt: string): string {
  return txt
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\d.\-*#|]+/, '')
    .replace(/[\s.:;\-|]+$/, '')
    .trim()
}

function linhaPareceRuido(linha: string): boolean {
  const up = linha.toUpperCase()
  if (up.length < 2) return true
  const ruidos = [
    'CNPJ',
    'IE:',
    'CHAVE DE ACESSO',
    'QR CODE',
    'EMITENTE',
    'DANFE',
    'DOCUMENTO AUXILIAR',
    'SEFIN',
    'TRIBUTOS',
    'TRIBUTOS FEDERAIS',
    'VALOR TOTAL',
    'VALOR A PAGAR',
    'TOTAL DA NOTA',
    'Nº',
    'N°',
    'SERIE',
    'SÉRIE',
    'PROTOCOLO',
    'DATA DE EMISSÃO',
    'FORMA DE PAGAMENTO',
    'OBSERV',
    'CONSUMIDOR',
    'AMBIENTE',
    'AUTORIZ',
    'MUNICIPIO',
    'MUNICÍPIO',
    'ENDEREÇO',
    'BAIRRO',
    'CEP',
    'TELEFONE',
    'FONE',
    'www.',
    'HTTP',
  ]
  return ruidos.some((r) => up.includes(r))
}

function confiancaDe(descricao: string, valor: number): 'alta' | 'baixa' {
  if (!descricao || descricao.length < 2) return 'baixa'
  if (descricao.length < 3) return 'baixa'
  if (!Number.isFinite(valor) || valor <= 0 || valor > 500000) return 'baixa'
  if (/^[^a-zA-ZÀ-ÿ]+$/.test(descricao)) return 'baixa'
  return 'alta'
}

const RótulosValor = /(?:TOTAL|VALOR|SUBTOTAL|R\$|\$)\s*:?/gi

function montarItem(
  descricaoBruta: string,
  valor: number,
  _trilha: TrilhaCaptura,
  origemImagemIndex: number,
  linhaBruta: string,
): ItemCandidatoOcr {
  let descricao = normalizarDescricao(descricaoBruta)
  let quantidade: number | null = null
  let valorUnitario: number | null = null

  // Quantidade interna (validação apenas — nunca campo do lançamento)
  const mq = linhaBruta.match(RE_QTD) || descricaoBruta.match(RE_QTD)
  if (mq) {
    const q = Number(mq[1])
    if (Number.isFinite(q) && q > 0) quantidade = q
  }
  const valores = extrairValoresLinha(linhaBruta)
  if (quantidade && quantidade > 1 && valores.length >= 2) {
    // valor unitário provável = primeiro valor; total da linha = último
    valorUnitario = valores[0]
  }

  // Remove rótulos tipo "TOTAL:" encrustados
  descricao = descricao.replace(/^(TOTAL|VALOR TOTAL|SUBTOTAL)\s*:?\s*/i, '').trim()

  const confianca = confiancaDe(descricao, valor)
  return {
    descricao,
    valor,
    quantidade,
    valorUnitario,
    status: confianca === 'alta' ? 'pronto' : 'revisar',
    confianca,
    origemImagemIndex,
    linhaBruta: linhaBruta.slice(0, 200),
  }
}

/**
 * PERFIL PAPEL — pares de linhas: descrição na 1ª, último valor na 2ª.
 * Ignora linhas de ruído (cabeçalho, totais, QR Code, tributos).
 */
export function parseItensPapel(linhas: string[], origemImagemIndex = 0): ItemCandidatoOcr[] {
  const itens: ItemCandidatoOcr[] = []
  let descricaoPendente: string | null = null

  for (const linhaRaw of linhas) {
    const linha = (linhaRaw || '').trim()
    if (!linha) continue

    const valores = extrairValoresLinha(linha)
    const ehRuido = linhaPareceRuido(linha)

    if (valores.length === 0) {
      // linha sem valor: se não é ruído, é candidata a descrição
      if (!ehRuido && /[a-zA-ZÀ-ÿ]{2,}/.test(linha)) {
        descricaoPendente = linha
      }
      continue
    }

    // linha COM valor
    if (descricaoPendente) {
      // par completo: descrição pendente + último valor desta linha
      const valor = valores[valores.length - 1]
      itens.push(
        montarItem(
          descricaoPendente,
          valor,
          'papel',
          origemImagemIndex,
          `${descricaoPendente} ${linha}`,
        ),
      )
      descricaoPendente = null
    } else if (!ehRuido) {
      // descrição e valor na mesma linha (ex: "ARROZ  R$ 34,90")
      const desc = linha.replace(RE_VALOR, ' ').replace(RótulosValor, ' ').trim()
      const valor = valores[valores.length - 1]
      if (desc && /[a-zA-ZÀ-ÿ]{2,}/.test(desc)) {
        itens.push(montarItem(desc, valor, 'papel', origemImagemIndex, linha))
      }
    }
  }

  return itens
}

/**
 * PERFIL DIGITAL — bloco de itens: descrição numa linha, último valor da
 * LINHA SEGUINTE. Ignora cabeçalho/tributos/QR Code. Em linhas do formato
 * "qtd UN x valor unitário … total", usa o ÚLTIMO valor (total da linha).
 */
export function parseItensDigital(linhas: string[], origemImagemIndex = 0): ItemCandidatoOcr[] {
  const itens: ItemCandidatoOcr[] = []
  let descricaoPendente: string | null = null

  for (const linhaRaw of linhas) {
    const linha = (linhaRaw || '').trim()
    if (!linha) continue

    const valores = extrairValoresLinha(linha)
    const ehRuido = linhaPareceRuido(linha)

    if (valores.length === 0) {
      if (!ehRuido && /[a-zA-ZÀ-ÿ]{2,}/.test(linha)) {
        descricaoPendente = linha
      }
      continue
    }

    // Descrições de item digitais podem trazer "R$ 6,00" com valor na mesma
    // linha ("3 UN x R$ 6,00") — nesse caso a linha é a linha de composição,
    // e a descrição pendente permanece.
    const pareceComposicao =
      /(\d+\s*(?:UN|UNID|KG|G|ML|L|CX|PC|PCT|LT)\s*[x×]\s*R?\$)/i.test(linha) ||
      /^\d+\s+[a-zA-ZÀ-ÿ]/.test(linha)

    if (descricaoPendente && !pareceComposicao) {
      const valor = valores[valores.length - 1]
      itens.push(
        montarItem(
          descricaoPendente,
          valor,
          'digital',
          origemImagemIndex,
          `${descricaoPendente} ${linha}`,
        ),
      )
      descricaoPendente = null
    } else if (!descricaoPendente && !ehRuido && !pareceComposicao) {
      const desc = linha.replace(RE_VALOR, ' ').replace(RótulosValor, ' ').trim()
      const valor = valores[valores.length - 1]
      if (desc && /[a-zA-ZÀ-ÿ]{2,}/.test(desc)) {
        itens.push(montarItem(desc, valor, 'digital', origemImagemIndex, linha))
      }
    }
  }

  return itens
}

/** Dispatcher por trilha. */
export function parseItensNfce(
  linhas: string[],
  trilha: TrilhaCaptura,
  origemImagemIndex = 0,
): ItemCandidatoOcr[] {
  return trilha === 'papel'
    ? parseItensPapel(linhas, origemImagemIndex)
    : parseItensDigital(linhas, origemImagemIndex)
}

/**
 * Tenta reconhecer o TOTAL do documento com confiança (BLOCO 17).
 * Nunca gera ajuste — apenas alimenta a conferência informativa.
 */
export function extrairTotalDocumento(linhas: string[]): {
  total: number | null
  confianca: 'alta' | 'baixa'
} {
  const chavesFortes = [
    'VALOR TOTAL',
    'TOTAL DA NOTA',
    'VALOR A PAGAR',
    'TOTAL A PAGAR',
    'TOTAL R$',
    'TOTAL:',
  ]
  for (const linha of linhas) {
    const up = linha.toUpperCase()
    if (chavesFortes.some((c) => up.includes(c))) {
      const valores = extrairValoresLinha(linha)
      if (valores.length > 0) {
        return { total: valores[valores.length - 1], confianca: 'alta' }
      }
    }
  }
  return { total: null, confianca: 'baixa' }
}

/** Tenta reconhecer a data da compra (dd/mm/aaaa ou aaaa-mm-dd). */
export function extrairDataDocumento(linhas: string[]): {
  data: string | null
  confianca: 'alta' | 'baixa'
} {
  const reData = /(\d{2})\/(\d{2})\/(\d{4})/
  for (const linha of linhas) {
    const up = linha.toUpperCase()
    if (!/EMISS|DATA/.test(up)) continue
    const m = linha.match(reData)
    if (m) {
      const [dd, mm, aaaa] = [m[1], m[2], m[3]]
      const mes = Number(mm)
      const dia = Number(dd)
      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
        return { data: `${aaaa}-${mm}-${dd}`, confianca: 'alta' }
      }
    }
  }
  return { data: null, confianca: 'baixa' }
}

/**
 * T4.0 — Controle de qualidade ANTES dos candidatos: elimina DUPLICATAS DE
 * PROCESSAMENTO (mesma linha de texto OCR repetida por capturas sobrepostas
 * ou blocos duplicados do Tesseract). Duplicata EXATA = descrição normalizada
 * idêntica + mesmo valor + MESMA imagem de origem (ou imagem adjacente com a
 * mesma linha bruta — sobreposição). Itens iguais que representam COMPRA
 * REPETIDA (linhas brutas diferentes, imagens distintas) seguem o fluxo atual:
 * marcarRepeticoesEntreCapturas marca "Possível item repetido" para o usuário.
 */
export function eliminarDuplicatasProcessamento(itens: ItemCandidatoOcr[]): ItemCandidatoOcr[] {
  const saida: ItemCandidatoOcr[] = []
  const vistas = new Set<string>()
  const vistasSobreposicao = new Set<string>()
  for (const item of itens) {
    const desc = normalizarDescricao(item.descricao).toUpperCase()
    const bruta = (item.linhaBruta || '')
      .toUpperCase()
      .replace(/\s{2,}/g, ' ')
      .trim()
    const chave = `${desc}|${item.valor.toFixed(2)}|${item.origemImagemIndex}|${bruta}`
    // Mesma imagem: só é duplicata se a linha BRUTA inteira for idêntica
    // (compra repetida na MESMA captura tem linha bruta igual porém sequência
    // distinta — comparar também a posição relativa evita removê-la).
    if (vistas.has(chave)) continue
    // Sobreposição entre capturas consecutivas: mesma desc+valor+linha bruta
    // em imagem adjacente => a MESMA linha foi processada duas vezes.
    const chaveSobreposicao = `${desc}|${item.valor.toFixed(2)}|adj|${bruta}`
    if (bruta && vistasSobreposicao.has(chaveSobreposicao)) continue

    saida.push(item)
    vistas.add(chave)
    if (bruta) {
      vistasSobreposicao.add(chaveSobreposicao)
      // Registra a linha bruta também como pertencente à imagem ADJACENTE
      // (anterior e seguinte), para detectar sobreposição de capturas.
      vistasSobreposicao.add(
        `${desc}|${item.valor.toFixed(2)}|adj@${item.origemImagemIndex - 1}|${bruta}`,
      )
      vistasSobreposicao.add(
        `${desc}|${item.valor.toFixed(2)}|adj@${item.origemImagemIndex + 1}|${bruta}`,
      )
    }
  }
  return saida
}

/**
 * Marca como "Possível item repetido" itens com mesma descrição+valor vindos
 * de CAPTURAS DIFERENTES (compra genuinamente repetida entre fotos) — nunca
 * remove o item, apenas sinaliza para conferência do usuário.
 */
export function marcarRepeticoesEntreCapturas(itens: ItemCandidatoOcr[]): ItemCandidatoOcr[] {
  const vistos = new Map<string, number>()
  const saida: ItemCandidatoOcr[] = []
  for (const item of itens) {
    const chave = `${item.descricao.toUpperCase().trim()}|${item.valor.toFixed(2)}`
    const ultimaImagem = vistos.get(chave)
    if (ultimaImagem !== undefined && item.origemImagemIndex !== ultimaImagem) {
      saida.push({ ...item, status: 'repetido', confianca: item.confianca })
    } else {
      saida.push(item)
    }
    vistos.set(chave, item.origemImagemIndex)
  }
  return saida
}
