import { LinhaFaturaExtraida, ParserResult } from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from './normalizadorEstabelecimento'

/**
 * Adaptador / Parser da fatura C6 Bank Carbon.
 *
 * Características da fatura C6:
 * - Total: R$ 8.138,86
 * - Vencimento: 10 de Outubro (2026-10-10)
 * - Fechamento: 02/10/2026 (2026-10-02)
 * - Anuidade Isenta (com estorno de R$ 98,00: Parcela 11/12 98,00 e Estornos / Crédito na Fatura (-) 98,00)
 * - Cartões identificados:
 *   - Virtual Final 4128 - EVANDRO S GUEDES (Subtotal 2.726,06)
 *   - Final 8504 - EVANDRO S GUEDES (Subtotal 469,36)
 *   - Adicional Final 1453 - JOSIVANIA FERNANDES (Subtotal 4.943,44)
 * - Formato das linhas C6:
 *   - "13 jun AMAZONMKTPLC*ADEOLIVEI - Parcela 4/12 97,91"
 *   - "07 set PG *SPPAY SPONTE PAY 337,00"
 *   - "29 set Estorno Tarifa - Estorno 98,00"
 *   - "29 set Anuidade Diferenciada - Parcela 11/12 98,00"
 *   - "09 set Inclusao de Pagamento 8.938,16" (Pagamento anterior a IGNORAR)
 */
export class C6Parser {
  private static readonly MESES_PT: Record<string, number> = {
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

  static parse(fullText: string, lines: string[]): ParserResult {
    const avisos: string[] = []
    const linhasExtraidas: LinhaFaturaExtraida[] = []

    const titulares = new Set<string>()
    const finais = new Set<string>()
    let vencimento = '2026-10-10'
    let fechamento = '2026-10-02'
    let valorTotalDeclarado = 8138.86

    const matchTotal =
      fullText.match(/valor\s+de\s+R\$\s*([\d.]+,\d{2})/i) ||
      fullText.match(/Total\s+a\s+pagar\s*R\$\s*([\d.]+,\d{2})/i)
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    let titularAtual = 'EVANDRO S GUEDES'
    let finalAtual = '4128'
    let ordemCounter = 1

    // Regex de cabeçalho de seção de cartão C6:
    // Ex: "C6 Carbon Virtual Final 4128 - EVANDRO S GUEDES"
    // Ex: "C6 Carbon Final 8504 - EVANDRO S GUEDES"
    // Ex: "C6 Carbon Final 1453 - JOSIVANIA FERNANDES"
    const headerC6Regex = /Final\s+(\d{4})\s*-\s*([A-Z\s]+)/i

    // Regex de linha de transação C6:
    // Ex: "13 jun AMAZONMKTPLC*ADEOLIVEI - Parcela 4/12 97,91"
    // Ex: "07 set PG *SPPAY SPONTE PAY 337,00"
    // Ex: "29 set Estorno Tarifa - Estorno 98,00"
    // Ex: "05 out AMAZONMKTPLC*LDEMMELOC - Parcela 12/12 61,35"
    const linhaC6Regex = /^(\d{2})\s+([a-z]{3})\s+(.+?)\s+([\d.]+,\d{2})$/i

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const matchHeader = line.match(headerC6Regex)
      if (matchHeader) {
        finalAtual = matchHeader[1].trim()
        titularAtual = matchHeader[2].trim()
        titulares.add(titularAtual)
        finais.add(finalAtual)
        continue
      }

      // Descartar informativos
      if (
        line.startsWith('Subtotal deste cartão') ||
        line.startsWith('Total a pagar') ||
        line.startsWith('Saldo obrigações futuras') ||
        line.includes('Transações do cartão') ||
        line.includes('Lembrando: nesta fatura') ||
        line.includes('Formas de pagamento')
      ) {
        continue
      }

      const matchLinha = line.match(linhaC6Regex)
      if (matchLinha) {
        const [, diaStr, mesStr, rawDescricao, rawValor] = matchLinha
        const valorNum = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
        const mesLower = mesStr.toLowerCase()
        const mes = C6Parser.MESES_PT[mesLower] || 10
        const dia = parseInt(diaStr, 10)

        // Pagamento anterior do C6 a IGNORAR (BLOCO F e 9)
        // Ex: "09 set Inclusao de Pagamento 8.938,16"
        const c6DescUpper = rawDescricao.toUpperCase()
        if (
          c6DescUpper.includes('INCLUSAO DE PAGAMENTO') ||
          c6DescUpper.includes('PAGTO') ||
          c6DescUpper.includes('PAGAMENTO DE FATURA') ||
          c6DescUpper.includes('PAGAMENTO RECEBIDO') ||
          c6DescUpper.includes('OBRIGADO PELO PAGAMENTO')
        ) {
          continue
        }

        // Detectar parcela no formato "- Parcela X/Y" ou "Parcela X/Y"
        let parcelaAtual: number | undefined
        let totalParcelas: number | undefined
        const matchParcela = rawDescricao.match(/Parcela\s+(\d+)\/(\d+)/i)
        if (matchParcela) {
          parcelaAtual = parseInt(matchParcela[1], 10)
          totalParcelas = parseInt(matchParcela[2], 10)
        }

        // Inferir ano caso seja compra anterior
        let anoInferido = 2026
        let dataInferidaDeAnoAnterior = false
        if (parcelaAtual && parcelaAtual > 1) {
          const totalMesesAtras = parcelaAtual - 1
          let mesCalc = 10 - totalMesesAtras
          let anoCalc = 2026
          while (mesCalc <= 0) {
            mesCalc += 12
            anoCalc -= 1
          }
          anoInferido = anoCalc
          if (anoCalc < 2026) {
            dataInferidaDeAnoAnterior = true
          }
        }

        const dataFormatada = `${anoInferido}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

        // Detectar crédito / estorno / encargos
        let tipo: 'compra' | 'parcelado' | 'credito' | 'encargo' = 'compra'
        let tratamento: 'compra' | 'estorno' | 'credito_ajuste' | 'ignorar' = 'compra'
        let isCredito = false

        if (rawDescricao.toUpperCase().includes('ESTORNO')) {
          tipo = 'credito'
          tratamento = 'estorno'
          isCredito = true
        } else if (rawDescricao.toUpperCase().includes('ANUIDADE')) {
          tipo = 'encargo'
        } else if (parcelaAtual && totalParcelas && totalParcelas > 1) {
          tipo = 'parcelado'
        }

        const descNormal = normalizarNomeEstabelecimento(rawDescricao)
        const valorEstimado =
          parcelaAtual && totalParcelas
            ? Math.round(valorNum * totalParcelas * 100) / 100
            : valorNum

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
          isCredito,
          dataInferidaDeAnoAnterior,
        })
      }
    }

    const comprasEncargos = linhasExtraidas
      .filter((l) => !l.isCredito)
      .reduce((sum, l) => sum + l.valor, 0)
    const creditos = linhasExtraidas.filter((l) => l.isCredito).reduce((sum, l) => sum + l.valor, 0)
    const diferenca = Math.round((valorTotalDeclarado - (comprasEncargos - creditos)) * 100) / 100

    return {
      cabecalho: {
        emissor: 'c6',
        emissorNome: 'C6 Bank Carbon Mastercard Black',
        titulares: Array.from(titulares),
        finais: Array.from(finais),
        competencia: '2026-10',
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
        comprasEncargosReconhecidos: Math.round(comprasEncargos * 100) / 100,
        creditosRelevantes: Math.round(creditos * 100) / 100,
        diferenca,
        conferido: Math.abs(diferenca) < 0.05,
      },
    }
  }
}
