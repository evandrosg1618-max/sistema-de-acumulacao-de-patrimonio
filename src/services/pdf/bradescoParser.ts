import { LinhaFaturaExtraida, ParserResult } from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from './normalizadorEstabelecimento'

/**
 * Parser da fatura Bradesco Visa (fatura agrupada com múltiplos cartões/titulares).
 *
 * REGRA (C1): processa EXCLUSIVAMENTE o quadro "Lançamentos" da fatura.
 * Tabelas como "Limites", "Resumo da fatura" e totais ficam FORA do processamento —
 * nunca somar valor de outra tabela (ex.: 87.618,07 da tabela de Limites).
 * Diretriz do usuário: por linha basta data, descrição, valor e parcelas;
 * o resumo soma os lançamentos processados e compara com o Total declarado.
 */
export class BradescoParser {
  // Início do quadro cinza de lançamentos — pode reaparecer a cada página da fatura!
  private static readonly SECAO_INICIO = /^lan[çc]amentos\b/i

  // Títulos de outras seções que legitimamente encerram o quadro de lançamentos.
  // Rodapés de página ("Central de Relacionamento", "Ouvidoria", "Página X de Y", números de atendimento)
  // e títulos repetidos NÃO devem impedir a reabertura do quadro na página seguinte.
  // IMPORTANTE: Não deve casar com linhas com data ("01/10 Drogasil") nem com cartões.
  private static readonly SECAO_FIM =
    /^(?:resumo\s+da\s+fatura|limites|demonstrativo|saldo\s+(?:anterior|de|total|previsto)|pagamento\s+m[íi]nimo|programa\s+de\s+pontos|extrato\s+de\s+pontos)\b/i

  static parse(fullText: string, lines: string[]): ParserResult {
    const avisos: string[] = []
    const linhasExtraidas: LinhaFaturaExtraida[] = []
    const naoReconhecidas: string[] = []

    // 1. Metadados do Cabeçalho — C5: SEM CHUMBADOS (extraído do PDF)
    const titulares = new Set<string>()
    const finais = new Set<string>()
    let vencimento = ''
    let fechamento = ''
    let valorTotalDeclarado = 0
    let valorPagamentoAnterior = 0

    const matchVenc = fullText.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      const [d, m, y] = matchVenc[1].split('/')
      vencimento = `${y}-${m}-${d}`
    } else {
      avisos.push('Vencimento não identificado no cabeçalho do PDF Bradesco.')
    }

    const matchFech =
      fullText.match(/(?:melhor\s+dia|fechamento|corte)[^\d\n]*(\d{2}\/\d{2}\/\d{4})/i) ||
      fullText.match(/Previs[aã]o\s+de\s+fechamento[^\d\n]*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchFech) {
      const [d, m, y] = matchFech[1].split('/')
      fechamento = `${y}-${m}-${d}`
    }

    // Total declarado na fatura (cabeçalho/resumo) — fonte de dados, não de regras
    const matchTotal =
      fullText.match(/Total\s+da\s+fatura(?:\s+em\s+real)?\s*(?:R\$\s*)?([\d.]+,\d{2})/i) ||
      fullText.match(/Total\s+a\s+pagar\s*(?:R\$\s*)?([\d.]+,\d{2})/i)
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    const competencia = vencimento ? vencimento.slice(0, 7) : new Date().toISOString().slice(0, 7)
    const mesFatura = vencimento ? parseInt(vencimento.slice(5, 7), 10) : 11
    const anoFatura = vencimento ? parseInt(vencimento.slice(0, 4), 10) : new Date().getFullYear()

    // 2. Processar o quadro "Lançamentos" — C5: titular/final iniciais vazios, extraídos dinamicamente
    let titularAtual = ''
    let finalAtual = ''
    let ordemCounter = 1
    let inSecao = false
    let foraDaSecao = 0

    // Mudança de titular/cartão (dentro do quadro)
    // Ex: "EVANDRO DA SILVA GUEDES Cartão 4066 XXXX XXXX 6429"
    const titularCartaoRegex = /^([A-ZÀ-Ú\s]+)\s+Cart[aã]o\s+\d{4}\s+XXXX\s+XXXX\s+(\d{4})/i

    // Tolerância de layout (C4): data no início OU descrição antes da data;
    // valor com ou sem "R$"; sinal "-" com ou sem espaço.
    const linhaDataPrimeiro =
      /^(?:[•\-–]\s*)?(\d{2}\/\d{2})\s+(.+?)\s+(?:R\$\s*)?([\d.]+,\d{2})\s*(-?)\s*$/
    const linhaDescPrimeiro = /^(.+?)\s+(\d{2}\/\d{2})\s+(?:R\$\s*)?([\d.]+,\d{2})\s*(-?)\s*$/
    const dataSemValor = /^(?:[•\-–]\s*)?(\d{2}\/\d{2})\s*(.*)$/
    const somenteValor = /^(?:R\$\s*)?([\d.]+,\d{2})\s*(-?)$/

    // Linha quebrada em duas (data+desc numa, valor noutra)
    let pendente: { data: string; desc: string } | null = null

    const emitir = (
      dataDiaMes: string,
      rawDescricao: string,
      rawValor: string,
      sinalMenos: boolean,
    ) => {
      const valorNum = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
      const isSinalMenos = sinalMenos || rawDescricao.endsWith('-')

      const descUpper = rawDescricao.toUpperCase()
      if (
        descUpper.includes('PAGTO. POR DEB') ||
        descUpper.includes('PAGTO POR DEB') ||
        descUpper.includes('PAGTO.POR DEB') ||
        descUpper.includes('PAGAMENTO DE FATURA') ||
        descUpper.includes('PAGAMENTO FICHA') ||
        descUpper.includes('OBRIGADO PELO PAGAMENTO')
      ) {
        // Informativo de pagamento — BLOCO 9: não vira lançamento de forma alguma.
        valorPagamentoAnterior += valorNum
        return
      }

      // Parcelamento no meio da descrição: 01/02, 11/21, 04/04, 01/12
      let parcelaAtual: number | undefined
      let totalParcelas: number | undefined
      const matchParcela = rawDescricao.match(/\b(\d{1,2})\/(\d{1,2})\b/)
      if (matchParcela) {
        parcelaAtual = parseInt(matchParcela[1], 10)
        totalParcelas = parseInt(matchParcela[2], 10)
      }

      // Ano inferido (BLOCO G): parcela N/Total numa fatura de M/AAAA →
      // compra ocorreu ~(N+1) faturas antes; ano recua quando o mês zera.
      const [diaStr, mesStr] = dataDiaMes.split('/')
      const dia = parseInt(diaStr, 10)
      const mes = parseInt(mesStr, 10)
      let anoInferido = anoFatura
      let dataInferidaDeAnoAnterior = false

      if (parcelaAtual && parcelaAtual > 1) {
        let mesCalculado = mesFatura - parcelaAtual - 1
        let anoCalculado = anoFatura
        while (mesCalculado <= 0) {
          mesCalculado += 12
          anoCalculado -= 1
        }
        anoInferido = anoCalculado
        if (anoCalculado < anoFatura) {
          dataInferidaDeAnoAnterior = true
        }
      }

      const dataFormatada = `${anoInferido}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

      let tipo: 'compra' | 'parcelado' | 'credito' | 'encargo' = 'compra'
      let tratamento: 'compra' | 'estorno' | 'credito_ajuste' | 'ignorar' = 'compra'

      if (isSinalMenos) {
        tipo = 'credito'
        tratamento = 'estorno'
      } else if (parcelaAtual && totalParcelas && totalParcelas > 1) {
        tipo = 'parcelado'
      }

      const descNormal = normalizarNomeEstabelecimento(rawDescricao)
      const valorEstimado =
        parcelaAtual && totalParcelas ? Math.round(valorNum * totalParcelas * 100) / 100 : valorNum

      linhasExtraidas.push({
        ordem: ordemCounter++,
        tipo,
        tratamento,
        data: dataFormatada,
        descricaoOriginal: rawDescricao.trim(),
        descricaoNormalizada: descNormal,
        valor: valorNum,
        parcelaAtual,
        totalParcelas,
        valorParcela: parcelaAtual ? valorNum : undefined,
        valorTotalEstimado: valorEstimado,
        finalCartao: finalAtual,
        titular: titularAtual,
        isCredito: isSinalMenos,
        dataInferidaDeAnoAnterior,
      })
    }

    for (const rawLine of lines) {
      const line = rawLine
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!line) continue

      // Início do quadro "Lançamentos" (ou reabertura na página seguinte)
      if (BradescoParser.SECAO_INICIO.test(line)) {
        inSecao = true
        pendente = null
        continue
      }

      // Fim do quadro: somente se NÃO for uma linha de lançamento com data e coincidir com SECAO_FIM
      if (inSecao && BradescoParser.SECAO_FIM.test(line) && !/^\d{2}\/\d{2}/.test(line)) {
        inSecao = false
        pendente = null
        foraDaSecao++
        continue
      }

      // Mudança de titular/cartão (pode ocorrer antes ou dentro do quadro)
      const matchTitular = line.match(titularCartaoRegex)
      if (matchTitular) {
        titularAtual = matchTitular[1].trim()
        finalAtual = matchTitular[2].trim()
        titulares.add(titularAtual)
        finais.add(finalAtual)
        pendente = null
        continue
      }

      // Ignora rodapés de página conhecidos do Bradesco (não devem fechar a seção nem gerar avisos)
      if (
        /^(?:Central\s+de\s+Relacionamento|SAC\s+Bradesco|Ouvidoria|P[aá]gina\s+\d+|Para\s+mais\s+informa[çc][õo]es|Demais\s+regi[õo]es|Capitais\s+e\s+regi[õo]es)/i.test(
          line,
        )
      ) {
        continue
      }

      // Totais/subtotais dentro do quadro não são lançamentos
      if (
        /^(total\b|total para\b|subtotal)/i.test(line) ||
        line.includes('Previsão de fechamento')
      ) {
        pendente = null
        continue
      }

      // Se não estamos formalmente inSecao:
      // Se a linha tem cara clara de lançamento com data (ex: "01/10 DROGASIL ... 121,07"),
      // e NÃO é de limites ou resumo, reabrimos a seção inSecao automaticamente (C7)
      if (!inSecao) {
        const isTabelaLimites = /limite|cr[ée]dito\s+total|saque|dispon[íi]vel/i.test(line)
        const temDataEValor = linhaDataPrimeiro.test(line) || linhaDescPrimeiro.test(line)
        if (temDataEValor && !isTabelaLimites) {
          inSecao = true
        } else {
          foraDaSecao++
          continue
        }
      }

      // Cabeçalho de colunas da tabela: ignorar
      if (/^(?:Data|Movimenta[cç][aã]o|Valor|Hist[óo]rico|Descri[cç][aã]o)/i.test(line)) {
        continue
      }

      // Variante 1: data no início
      let m = line.match(linhaDataPrimeiro)
      if (m) {
        pendente = null
        emitir(m[1], m[2], m[3], m[4] === '-')
        continue
      }
      // Variante 2: descrição antes da data (layout extraído)
      m = line.match(linhaDescPrimeiro)
      if (m) {
        pendente = null
        emitir(m[2], m[1], m[3], m[4] === '-')
        continue
      }
      // Valor em linha separada (descrição quebrada)
      const mv = line.match(somenteValor)
      if (mv && pendente) {
        emitir(pendente.data, pendente.desc, mv[1], mv[2] === '-')
        pendente = null
        continue
      }
      // Data (com ou sem descrição) em linha separada
      const md = line.match(dataSemValor)
      if (md) {
        if (pendente && pendente.desc.trim()) {
          pendente = { data: pendente.data, desc: `${pendente.desc} ${md[2]}`.trim() }
        } else {
          pendente = { data: md[1], desc: md[2].trim() }
        }
        continue
      }
      // Continuação de descrição quebrada
      if (pendente) {
        pendente = { data: pendente.data, desc: `${pendente.desc} ${line}`.trim() }
        continue
      }

      // Nada cai em silêncio dentro do quadro correto
      naoReconhecidas.push(line)
    }

    if (pendente && pendente.desc.trim()) {
      naoReconhecidas.push(`${pendente.data} ${pendente.desc}`)
    }

    if (foraDaSecao > 0) {
      avisos.push(
        `${foraDaSecao} linha(s) fora do quadro "Lançamentos" descartadas (Limites, Resumo, totais etc.) — não entram na conferência.`,
      )
    }
    for (const texto of naoReconhecidas) {
      avisos.push(`Linha não reconhecida (texto): "${texto}"`)
    }
    if (valorPagamentoAnterior > 0) {
      avisos.push(
        `Pagamento/saldo anterior de R$ ${valorPagamentoAnterior
          .toFixed(2)
          .replace('.', ',')} ignorado como lançamento (informativo de pagamento).`,
      )
    }

    if (linhasExtraidas.length === 0) {
      avisos.push('Nenhum lançamento reconhecido no quadro Lançamentos do Bradesco.')
      const amostra = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 15)
      if (amostra.length > 0) {
        avisos.push(
          `Amostra do texto extraído do PDF Bradesco (primeiras 15 linhas):\n` +
            amostra.map((l, idx) => `${idx + 1}: ${l}`).join('\n'),
        )
      }
    }

    // Conferência (diretriz do usuário): soma dos lançamentos processados
    // × Total declarado × diferença. NUNCA valor de outra tabela.
    const somaProcessada = linhasExtraidas
      .filter((l) => !l.isCredito)
      .reduce((sum, l) => sum + l.valor, 0)
    const creditos = linhasExtraidas.filter((l) => l.isCredito).reduce((sum, l) => sum + l.valor, 0)
    const diferenca = Math.round((valorTotalDeclarado - somaProcessada) * 100) / 100

    return {
      cabecalho: {
        emissor: 'bradesco',
        emissorNome: 'Bradesco Visa Infinite Prime',
        titulares: Array.from(titulares),
        finais: Array.from(finais),
        competencia,
        vencimento,
        fechamento,
        valorTotalFatura: valorTotalDeclarado,
        moeda: 'BRL',
        quantidadeItens: linhasExtraidas.length,
        pdfProtegido: false,
      },
      linhas: linhasExtraidas,
      avisos,
      resumoFinanceiro: {
        valorTotalFatura: valorTotalDeclarado,
        comprasEncargosReconhecidos: Math.round(somaProcessada * 100) / 100,
        creditosRelevantes: Math.round(creditos * 100) / 100,
        diferenca,
        conferido: Math.abs(diferenca) < 0.05,
      },
    }
  }
}
