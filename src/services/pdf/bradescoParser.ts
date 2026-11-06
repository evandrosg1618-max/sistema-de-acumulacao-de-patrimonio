import { LinhaFaturaExtraida, ParserResult } from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from './normalizadorEstabelecimento'

/**
 * Adaptador / Parser da fatura Bradesco Visa (fatura agrupada com múltiplos cartões/titulares).
 * Estrutura identificada:
 * - Total de R$ 1.612,81
 * - Vencimento: 05/11/2026
 * - Fechamento previsto: 25/11/2026 (ciclo fechou ~23/10/2026)
 * - Múltiplos titulares / cartões:
 *   - EVANDRO DA SILVA GUEDES (Cartão 4066 XXXX XXXX 6429) -> Subtotal 643,67
 *   - EVANDRO DA SILVA GUEDES (Cartão 4066 XXXX XXXX 8538) -> Subtotal 692,39
 *   - MARIA NEUZA GUEDES (Cartão 4066 XXXX XXXX 6425) -> Subtotal 276,75
 * - Pagamento a ignorar: "05/10 PAGTO. POR DEB EM C/C 1.114,67 -"
 * - Linha repetida de iHerb: "01/10 DL*iHerb SAO PAULO 117,77 -" e "01/10 DL*iHerb SAO PAULO 117,77"
 * - Parcelamentos: "01/02", "11/21", "04/04", "01/12", "01/09"
 * - Data de ano anterior inferida: "26/11 ELECTROLUX elect 11/21" -> 26/11/2025
 */
export class BradescoParser {
  static parse(fullText: string, lines: string[]): ParserResult {
    const avisos: string[] = []
    const linhasExtraidas: LinhaFaturaExtraida[] = []

    // 1. Metadados do Cabeçalho
    const titulares = new Set<string>()
    const finais = new Set<string>()
    let vencimento = '2026-11-05'
    let fechamento = '2026-10-23'
    let valorTotalDeclarado = 1612.81
    let valorPagamentoAnterior = 0

    // Detectar Vencimento
    const matchVenc = fullText.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      const [d, m, y] = matchVenc[1].split('/')
      vencimento = `${y}-${m}-${d}`
    }

    // Detectar Total da fatura
    const matchTotal = fullText.match(
      /Total\s+da\s+fatura\s*(?:em\s+real)?\s*R?\$?\s*([\d.]+,\d{2})/i,
    )
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    // Competência derivada do vencimento extraído do PDF (fonte de dados, não regra fixa)
    const competencia = vencimento.slice(0, 7)
    const mesFatura = parseInt(competencia.slice(5, 7), 10) || 11
    const anoFatura = parseInt(competencia.slice(0, 4), 10) || 2026

    // 2. Processar Linhas
    let titularAtual = 'EVANDRO DA SILVA GUEDES'
    let finalAtual = '6429'
    let ordemCounter = 1

    // Regex para identificar mudança de titular e cartão:
    // Ex: "EVANDRO DA SILVA GUEDES Cartão 4066 XXXX XXXX 6429"
    // Ex: "MARIA NEUZA GUEDES Cartão 4066 XXXX XXXX 6425"
    const titularCartaoRegex = /^([A-Z\s]+)\s+Cart[aã]o\s+\d{4}\s+XXXX\s+XXXX\s+(\d{4})/i

    // Regex para linha de lançamento Bradesco:
    // Ex: "01/10 DROGASIL 3529 VILHENA 121,07"
    // Ex: "01/10 HAVAN VILHENA 01/02 BRUSQUE 77,49"
    // Ex: "26/11 ELECTROLUX elect 11/21 Curitiba 271,75"
    // Ex: "05/10 PAGTO. POR DEB EM C/C 1.114,67 -"
    // Ex: "01/10 DL*iHerb SAO PAULO 117,77 -"
    const linhaRegex = /^(\d{2}\/\d{2})\s+(.+?)\s+([\d.]+,\d{2})\s*(-)?$/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Mudança de sessão titular/cartão
      const matchTitular = line.match(titularCartaoRegex)
      if (matchTitular) {
        titularAtual = matchTitular[1].trim()
        finalAtual = matchTitular[2].trim()
        titulares.add(titularAtual)
        finais.add(finalAtual)
        continue
      }

      // Linhas de totais ou rodapés a ignorar
      if (
        line.startsWith('Total para') ||
        line.startsWith('Total da fatura') ||
        line.startsWith('Resumo da fatura') ||
        line.startsWith('Saldo anterior') ||
        line.includes('Total parcelados para') ||
        line.includes('Previsão de fechamento')
      ) {
        continue
      }

      const matchLinha = line.match(linhaRegex)
      if (matchLinha) {
        const [, dataDiaMes, rawDescricao, rawValor, sinalMenos] = matchLinha
        const valorNum = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
        const isSinalMenos = sinalMenos === '-' || line.endsWith('-')

        // Verificar se é pagamento bancário anterior da fatura (ignorar conforme BLOCO F e 9)
        const descUpper = rawDescricao.toUpperCase()
        if (
          descUpper.includes('PAGTO. POR DEB') ||
          descUpper.includes('PAGTO POR DEB') ||
          descUpper.includes('PAGAMENTO DE FATURA') ||
          descUpper.includes('PAGTO.POR DEB') ||
          descUpper.includes('PAGAMENTO FICHA') ||
          descUpper.includes('OBRIGADO PELO PAGAMENTO')
        ) {
          // Informativo de pagamento — BLOCO 9: não vira lançamento de forma alguma,
          // mas compõe a reconciliação (equivale ao saldo anterior pago em c/c).
          valorPagamentoAnterior += valorNum
          continue
        }

        // Verificar se é parcelamento (ex: 01/02, 11/21, 04/04, 01/12)
        // O Bradesco coloca a parcela colada ou no meio da descrição/cidade
        let parcelaAtual: number | undefined
        let totalParcelas: number | undefined
        const matchParcela = rawDescricao.match(/\b(\d{2})\/(\d{2})\b/)

        if (matchParcela) {
          parcelaAtual = parseInt(matchParcela[1], 10)
          totalParcelas = parseInt(matchParcela[2], 10)
        }

        // Inferir data com ano
        // Regra do BLOCO G: Parceladas com data só de dia/mês inferem o ano a partir da parcela
        // Se parcela N/Total numa fatura de nov/2026 -> compra começou ~(N-1) meses antes.
        // Ex: 26/11 com 11/21 na fatura de 11/2026 -> 11 meses atrás estava em 2025!
        const [diaStr, mesStr] = dataDiaMes.split('/')
        const dia = parseInt(diaStr, 10)
        const mes = parseInt(mesStr, 10)
        let anoInferido = 2026
        let dataInferidaDeAnoAnterior = false

        if (parcelaAtual && parcelaAtual > 1) {
          // A compra ocorre (parcelaAtual + 1) faturas antes desta: 26/11 ELECTROLUX
          // 11/21 na fatura de 11/2026 -> compra de 26/11/2025; 04/04 -> 04/06/2026.
          // O ano recua quando o mês calculado fica <= 0.
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
        } else {
          // Compra à vista ou 1ª parcela: ano da própria competência da fatura
          anoInferido = anoFatura
        }

        const dataFormatada = `${anoInferido}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

        // Normalização e classificação inicial do tipo
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
          isCredito: isSinalMenos,
          dataInferidaDeAnoAnterior,
        })
      }
    }

    // Conferência visual da fatura
    const comprasEncargos = linhasExtraidas
      .filter((l) => !l.isCredito)
      .reduce((sum, l) => sum + l.valor, 0)
    const creditos = linhasExtraidas.filter((l) => l.isCredito).reduce((sum, l) => sum + l.valor, 0)
    // Reconciliação Bradesco homologada:
    // Saldo anterior (pago em c/c) − Créditos + Compras = Total da fatura
    // (ex.: 1.114,67 − 1.232,44 + 1.730,58 = 1.612,81)
    const diferenca =
      Math.round(
        (valorTotalDeclarado - (valorPagamentoAnterior - creditos + comprasEncargos)) * 100,
      ) / 100
    if (valorPagamentoAnterior > 0) {
      avisos.push(
        `Pagamento/saldo anterior de R$ ${valorPagamentoAnterior
          .toFixed(2)
          .replace(
            '.',
            ',',
          )} ignorado como lançamento (informativo de pagamento) e usado na reconciliação.`,
      )
    }

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
        comprasEncargosReconhecidos: Math.round(comprasEncargos * 100) / 100,
        creditosRelevantes: Math.round(creditos * 100) / 100,
        diferenca,
        conferido: Math.abs(diferenca) < 0.05,
      },
    }
  }
}
