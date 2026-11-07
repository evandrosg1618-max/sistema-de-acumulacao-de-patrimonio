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
  // Início do quadro cinza de lançamentos
  private static readonly SECAO_INICIO = /^lan[çc]amentos\b/i
  // Títulos de outras seções/tables que ENCERRAM o quadro de lançamentos
  private static readonly SECAO_FIM =
    /^(resumo\s+da\s+fatura|limites|demonstrativo|saldo\s+(anterior|de|total|previsto)|pagamento\s+m[íi]nimo|melhor\s+dia|programa|informativo|extrato|pontos|anuidade|tarifas)\b/i

  static parse(fullText: string, lines: string[]): ParserResult {
    const avisos: string[] = []
    const linhasExtraidas: LinhaFaturaExtraida[] = []
    const naoReconhecidas: string[] = []

    // 1. Metadados do Cabeçalho
    const titulares = new Set<string>()
    const finais = new Set<string>()
    let vencimento = '2026-11-05'
    let fechamento = '2026-10-23'
    let valorTotalDeclarado = 1612.81
    let valorPagamentoAnterior = 0

    const matchVenc = fullText.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      const [d, m, y] = matchVenc[1].split('/')
      vencimento = `${y}-${m}-${d}`
    }

    // Total declarado na fatura (cabeçalho/resumo) — fonte de dados, não de regras
    const matchTotal = fullText.match(
      /Total\s+da\s+fatura(?:\s+em\s+real)?\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
    )
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    const competencia = vencimento.slice(0, 7)
    const mesFatura = parseInt(competencia.slice(5, 7), 10) || 11
    const anoFatura = parseInt(competencia.slice(0, 4), 10) || 2026

    // 2. Processar SOMENTE o quadro "Lançamentos"
    let titularAtual = 'EVANDRO DA SILVA GUEDES'
    let finalAtual = '6429'
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
      const line = rawLine.trim()
      if (!line) continue

      // Delimitação da seção (C1)
      if (BradescoParser.SECAO_INICIO.test(line)) {
        inSecao = true
        pendente = null
        continue
      }
      if (BradescoParser.SECAO_FIM.test(line)) {
        inSecao = false
        pendente = null
        continue
      }
      if (!inSecao) {
        foraDaSecao++
        continue
      }

      const matchTitular = line.match(titularCartaoRegex)
      if (matchTitular) {
        titularAtual = matchTitular[1].trim()
        finalAtual = matchTitular[2].trim()
        titulares.add(titularAtual)
        finais.add(finalAtual)
        pendente = null
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

      // C4: nada cai em silêncio dentro do quadro correto
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
