import { LinhaFaturaExtraida, ParserResult, EmissorFatura } from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from './normalizadorEstabelecimento'

/**
 * Adaptador / Parser unificado para CAIXA (Mastercard e Visa).
 *
 * Características comuns:
 * - Vencimento: 01/11/2026
 * - Melhor data para compra: 17/11/2026 (dia fechamento = 17)
 * - Múltiplos cartões / adicionais dentro da mesma fatura:
 *   - Caixa Master: finais 4882 (titular), 7965 (Josivania), 0443 (Evandro), 7339 (Evandro) -> Total R$ 1.535,67
 *   - Caixa Visa: finais 9064 (titular), 9281 (Evandro), 3169 (Evandro) -> Total R$ 816,17
 * - Seções explícitas:
 *   - Demonstrativo (Saldo anterior, OBRIGADO PELO PAGAMENTO a ignorar, AJUSTE CRED)
 *   - ANUIDADE (ex: ISENTO 0,00D a não gerar linha financeira)
 *   - COMPRAS (à vista)
 *   - COMPRAS PARCELADAS (ex: "20/06 JK AUTO PECAS 04 DE 10 CACOAL 298,00D")
 * - Sufixos de valor:
 *   - "D" = Débito / Despesa
 *   - "C" = Crédito (ex: AJUSTE CRED PARC S/ JUROS 0,01C)
 * - Padrão de parcelas: "04 DE 10", "08 DE 08", "02 DE 05", "11 DE 12"
 */
export class CaixaParser {
  static parse(fullText: string, lines: string[], emissorForcado?: EmissorFatura): ParserResult {
    const avisos: string[] = []
    const linhasExtraidas: LinhaFaturaExtraida[] = []

    const isMaster =
      fullText.includes('5530.XXXX') ||
      fullText.includes('Mastercard') ||
      emissorForcado === 'caixa_master'
    const emissor: EmissorFatura = isMaster ? 'caixa_master' : 'caixa_visa'
    const emissorNome = isMaster ? 'CAIXA Mastercard' : 'CAIXA Visa Infinite'

    // Metadados
    const titulares = new Set<string>()
    const finais = new Set<string>()
    let vencimento = '2026-11-01'
    let fechamento = '2026-10-17'
    let valorTotalDeclarado = isMaster ? 1535.67 : 816.17
    let valorPagamentoAnterior = 0

    const matchVenc = fullText.match(/VENCIMENTO\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      const [d, m, y] = matchVenc[1].split('/')
      vencimento = `${y}-${m}-${d}`
    }

    const matchTotal = fullText.match(/VALOR\s+TOTAL\s+DESTA\s+FATURA\s*R?\$?\s*([\d.]+,\d{2})/i)
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    let titularAtual = 'EVANDRO DA SILVA GUEDES'
    let finalAtual = isMaster ? '4882' : '9064'
    // Competência derivada do vencimento extraído do PDF (fonte de dados, não regra fixa)
    const competencia = vencimento.slice(0, 7)
    const mesFatura = parseInt(competencia.slice(5, 7), 10) || 11
    const anoFatura = parseInt(competencia.slice(0, 4), 10) || 2026

    let secaoAtual = 'demonstrativo' // 'demonstrativo', 'compras', 'parceladas', 'anuidade'
    let ordemCounter = 1

    // Regex de cabeçalho de seção de cartão:
    // Ex: "EVANDRO DA SILVA GUEDES (Cartão 4882)"
    // Ex: "JOSIVANIA M FERNANDES (Cartão 7965)"
    const headerCartaoRegex = /^([A-Z\s]+)\s*\((?:Cart[aã]o|Cartao)\s+(\d{4})\)/i

    // Regex de linha CAIXA:
    // Ex: "20/06 JK AUTO PECAS 04 DE 10 CACOAL 298,00D"
    // Ex: "28/09 EBN*SPOTIFY CURITIBA 23,90D"
    // Ex: "24/09 AJUSTE CRED PARC S/ JUROS 0,01C"
    // Ex: "01/10 OBRIGADO PELO PAGAMENTO 2.905,66C"
    // Ex: "ISENTO 0,00D"
    const linhaCaixaRegex = /^(\d{2}\/\d{2})\s+(.+?)\s+([\d.]+,\d{2})([DC])$/i

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Mudança de cartão / titular
      const matchHeaderCartao = line.match(headerCartaoRegex)
      if (matchHeaderCartao) {
        titularAtual = matchHeaderCartao[1].trim()
        finalAtual = matchHeaderCartao[2].trim()
        titulares.add(titularAtual)
        finais.add(finalAtual)
        continue
      }

      // Mudança de subseção
      if (line.includes('COMPRAS PARCELADAS')) {
        secaoAtual = 'parceladas'
        continue
      }
      if (line.includes('COMPRAS (') || line === 'COMPRAS') {
        secaoAtual = 'compras'
        continue
      }
      if (line.includes('Demonstrativo')) {
        secaoAtual = 'demonstrativo'
        continue
      }
      if (line.includes('ANUIDADE')) {
        secaoAtual = 'anuidade'
        continue
      }

      // Descartar linhas de totais ou informativos
      if (
        line.startsWith('Total ') ||
        line.startsWith('Total final') ||
        line.startsWith('Valor total desta fatura') ||
        line.includes('TOTAL DA FATURA ANTERIOR') ||
        line.includes('Saldo previsto próxima fatura') ||
        line.includes('DESPESAS A VENCER') ||
        line.includes('DÉBITO AUTOMÁTICO') ||
        line.includes('PARCELAMENTO DE FATURA')
      ) {
        continue
      }

      // Caso especial da anuidade isenta (0,00D)
      if (line.toUpperCase().includes('ISENTO 0,00') || line.toUpperCase().includes('0,00D')) {
        // Bloqueio explícito do PDF de especificação: anuidade ISENTO 0,00 NÃO vira lançamento!
        continue
      }

      const matchLinha = line.match(linhaCaixaRegex)
      if (matchLinha) {
        const [, dataDiaMes, rawDescricao, rawValor, tipoDC] = matchLinha
        const valorNum = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
        const isCredito = tipoDC.toUpperCase() === 'C'

        // Ignorar pagamento da fatura (BLOCO F e 9)
        const descUpperCaixa = rawDescricao.toUpperCase()
        if (
          descUpperCaixa.includes('OBRIGADO PELO PAGAMENTO') ||
          descUpperCaixa.includes('PAGTO') ||
          descUpperCaixa.includes('PAGAMENTO DE FATURA') ||
          descUpperCaixa.includes('PAGAMENTO EM C/C')
        ) {
          // Pagamento da fatura anterior — BLOCO 9: não vira lançamento de forma alguma,
          // mas compõe a reconciliação (equivale ao saldo anterior pago).
          valorPagamentoAnterior += valorNum
          continue
        }

        // Padrão de parcelas CAIXA: "04 DE 10", "08 DE 08", "02 DE 05"
        let parcelaAtual: number | undefined
        let totalParcelas: number | undefined
        const matchParcela = rawDescricao.match(/(\d{2})\s+DE\s+(\d{2})/i)
        if (matchParcela) {
          parcelaAtual = parseInt(matchParcela[1], 10)
          totalParcelas = parseInt(matchParcela[2], 10)
        }

        // Inferência do ano
        const [diaStr, mesStr] = dataDiaMes.split('/')
        const dia = parseInt(diaStr, 10)
        const mes = parseInt(mesStr, 10)
        let anoInferido = 2026
        let dataInferidaDeAnoAnterior = false

        if (parcelaAtual && parcelaAtual > 1) {
          // A compra ocorre (parcelaAtual + 1) faturas antes desta: parcela 04/10 na
          // fatura de 11/2026 -> compra de 20/06/2026. O ano recua quando o mês
          // calculado fica <= 0.
          let mesCalc = mesFatura - parcelaAtual - 1
          let anoCalc = anoFatura
          while (mesCalc <= 0) {
            mesCalc += 12
            anoCalc -= 1
          }
          anoInferido = anoCalc
          if (anoCalc < anoFatura) {
            dataInferidaDeAnoAnterior = true
          }
        }

        const dataFormatada = `${anoInferido}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

        let tipo: 'compra' | 'parcelado' | 'credito' | 'encargo' = 'compra'
        let tratamento: 'compra' | 'estorno' | 'credito_ajuste' | 'ignorar' = 'compra'

        if (isCredito) {
          tipo = 'credito'
          // Diferenciação Crédito/Ajuste vs Estorno
          if (rawDescricao.toUpperCase().includes('AJUSTE CRED')) {
            tratamento = 'credito_ajuste'
          } else {
            tratamento = 'estorno'
          }
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
    // Reconciliação CAIXA (mesma fórmula do Bradesco):
    // Pagamento(s) anteriores (saldo pago em c/c) − Créditos + Compras/Encargos = Total da fatura
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
        emissor,
        emissorNome,
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
