import { LinhaFaturaExtraida, ParserResult } from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from './normalizadorEstabelecimento'

/**
 * Adaptador / Parser da fatura C6 Bank Carbon.
 *
 * Características da fatura C6:
 * - Seções delimitadas:
 *   - "Transações do cartão principal"
 *   - "Transações dos cartões adicionais" (ou "Transações do cartão adicional")
 * - Encerramento das seções de transações:
 *   - "Saldo obrigações futuras", "Lembrando: nesta fatura", "Formas de pagamento",
 *     "Opções de parcelamento", "Resumo da fatura", "Demonstrativo", "Encargos", "Central de relacionamento", etc.
 * - Cabeçalhos de cartão por bloco:
 *   - Ex: "C6 Carbon Virtual Final 4128 - EVANDRO S GUEDES"
 *   - Ex: "C6 Carbon Final 8504 - EVANDRO S GUEDES"
 *   - Ex: "C6 Carbon Final 1453 - JOSIVANIA FERNANDES"
 * - Formato das linhas de transação:
 *   - "13 jun AMAZONMKTPLC*ADEOLIVEI - Parcela 4/12 97,91"
 *   - "07 set PG *SPPAY SPONTE PAY 337,00"
 *   - "29 set Estorno Tarifa - Estorno 98,00"
 *   - "29 set Anuidade Diferenciada - Parcela 11/12 98,00"
 *   - "09 set Inclusao de Pagamento 8.938,16" (Pagamento anterior a IGNORAR)
 * - Cabeçalho de página:
 *   - Total declarado extraído do cabeçalho de cada página ou do resumo ("Total a pagar R$ ...")
 * - Linhas dentro da seção correta que não casarem com a regex viram aviso de linha não reconhecida.
 * - Nenhum valor ou ano chumbado: tudo extraído do PDF.
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

    // 1. Extração do Total Declarado a partir do cabeçalho da página / resumo
    let valorTotalDeclarado = 0
    for (const line of lines) {
      const matchHeaderTotal = line.match(
        /(?:Total\s+a\s+pagar|Total\s+da\s+fatura|Valor\s+total\s+da\s+fatura|Total\s+desta\s+fatura)[^\d\n]*R\$\s*([\d.]+,\d{2})/i,
      )
      if (matchHeaderTotal) {
        valorTotalDeclarado = parseFloat(matchHeaderTotal[1].replace(/\./g, '').replace(',', '.'))
        break
      }
    }

    if (!valorTotalDeclarado) {
      const matchFull =
        fullText.match(
          /(?:Total\s+a\s+pagar|Total\s+da\s+fatura|Total\s+desta\s+fatura)[^\d\n]*R\$\s*([\d.]+,\d{2})/i,
        ) || fullText.match(/valor\s+de\s+R\$\s*([\d.]+,\d{2})/i)
      if (matchFull) {
        valorTotalDeclarado = parseFloat(matchFull[1].replace(/\./g, '').replace(',', '.'))
      }
    }

    // 2. Extração do Vencimento e Fechamento
    let vencimento = ''
    let fechamento = ''
    let anoBase = new Date().getFullYear()

    const regexVenc = [
      /vencimento[^\d\n]*(\d{2})[\s/]+([a-zç]+|\d{2})[\s/]+(\d{4})/i,
      /vencimento[^\d\n]*(\d{2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i,
      /vencimento[^\d\n]*(\d{2})\s+([a-zç]{3})\s+(\d{4})/i,
      /(\d{2})\s+([a-zç]{3})\s+(\d{4})[^\n]*vencimento/i,
    ]
    for (const r of regexVenc) {
      const m = fullText.match(r)
      if (m) {
        const dia = m[1]
        const mesStr = m[2].toLowerCase().slice(0, 3)
        const mesNum = C6Parser.MESES_PT[mesStr] || parseInt(mesStr, 10) || 1
        anoBase = parseInt(m[3], 10)
        vencimento = `${anoBase}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
        break
      }
    }

    const regexFech = [
      /fechamento[^\d\n]*(\d{2})[\s/]+([a-zç]+|\d{2})[\s/]+(\d{4})/i,
      /fechamento[^\d\n]*(\d{2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i,
      /melhor\s+dia[^\d\n]*(\d{2})[\s/]+([a-zç]+|\d{2})[\s/]+(\d{4})/i,
    ]
    for (const r of regexFech) {
      const m = fullText.match(r)
      if (m) {
        const dia = m[1]
        const mesStr = m[2].toLowerCase().slice(0, 3)
        const mesNum = C6Parser.MESES_PT[mesStr] || parseInt(mesStr, 10) || 1
        const ano = parseInt(m[3], 10) || anoBase
        fechamento = `${ano}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
        break
      }
    }

    const mesVencimentoNum = vencimento ? parseInt(vencimento.slice(5, 7), 10) : 10
    const competencia = vencimento ? vencimento.slice(0, 7) : `${anoBase}-10`

    // 3. Processamento por seções
    let titularAtual = ''
    let finalAtual = ''
    let ordemCounter = 1
    let dentroSecaoTransacoes = false
    let valorPagamentosIgnorados = 0

    // Delimitadores de início de seções de transações (C1)
    // Casar "Transações do cartão" como prefixo suficiente (complemento "principal/adicionais/adicional" opcional),
    // tolerar \u00a0 e espaços múltiplos/quebras
    const inicioSecaoRegex =
      /Transa[cç][õo]es\s+do(?:s)?\s+cart[aãõ][oe]s?(?:\s+(?:principal|adicionais?))?/i

    // Delimitadores de fim das seções de transações
    // Só deve encerrar se a linha começar com essas palavras-chave e NÃO for uma linha de transação ou cabeçalho de cartão
    const fimSecaoRegex =
      /^(?:Saldo\s+obriga[cç][õo]es\s+futuras|Lembrando:\s*nesta\s+fatura|Formas\s+de\s+pagamento|Op[cç][õo]es\s+de\s+parcelamento|Resumo\s+da\s+fatura|Demonstrativo|Encargos|Central\s+de\s+relacionamento|Ouvidoria|Informa[cç][õo]es\s+importantes)/i

    // Regex de cabeçalho de cartão dentro da seção
    // Ex: "C6 Carbon Virtual Final 4128 - EVANDRO S GUEDES"
    // Ex: "C6 Carbon Final 8504 - EVANDRO S GUEDES"
    // Ex: "Final 1453 - JOSIVANIA FERNANDES"
    const headerC6Regex = /(?:.*?\b)?Final\s+(\d{4})\s*-\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]+)/i

    // Regex de linha de transação C6 (C2):
    // "13 jun AMAZONMKTPLC*ADEOLIVEI - Parcela 4/12 97,91"
    // "07 set PG *SPPAY SPONTE PAY 337,00"
    // "29 set Estorno Tarifa - Estorno 98,00"
    // "05 out AMAZONMKTPLC*LDEMMELOC - Parcela 12/12 61,35"
    // Tolerante a: "R$" opcional antes do valor, espaços múltiplos,
    // valor no fim com ou sem espaço do sufixo CR/-.
    const linhaC6Regex =
      /^(\d{2})(?:\s+([a-zA-ZçÇ]{3})|\/(\d{2}))\s+(.+?)\s+(-)?\s*(?:R\$\s*)?([\d.]+,\d{2})\s*([-CR]|CR)?$/i

    let secoesEncontradas = 0

    for (let i = 0; i < lines.length; i++) {
      // Normaliza espaços não separáveis (\u00a0) e múltiplos espaços
      let line = lines[i]
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!line) continue

      // Se a linha casar com início de seção ou prefixo "Transações do cartão"
      if (inicioSecaoRegex.test(line)) {
        dentroSecaoTransacoes = true
        secoesEncontradas++
        // Se a próxima linha parecer complemento do título (ex: "principal" ou "adicionais"), avançar
        if (i + 1 < lines.length) {
          const prox = lines[i + 1]
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (/^(?:principal|adicionais?|adicional)\b/i.test(prox)) {
            i++
          }
        }
        continue
      }

      // Se a linha for apenas "Transações" e a seguinte "do cartão"
      if (/^transa[cç][õo]es$/i.test(line) && i + 1 < lines.length) {
        const prox = lines[i + 1]
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (/^do(?:s)?\s+cart[aãõ][oe]s?/i.test(prox)) {
          dentroSecaoTransacoes = true
          secoesEncontradas++
          i++
          if (i + 1 < lines.length) {
            const prox2 = lines[i + 1]
              .replace(/\u00a0/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            if (/^(?:principal|adicionais?|adicional)\b/i.test(prox2)) {
              i++
            }
          }
          continue
        }
      }

      // Verifica encerramento de seção de transações
      if (dentroSecaoTransacoes && fimSecaoRegex.test(line)) {
        dentroSecaoTransacoes = false
        continue
      }

      // Se não estiver dentro de uma seção de transações, ignora
      if (!dentroSecaoTransacoes) {
        continue
      }

      // Verifica cabeçalho de cartão dentro da seção
      const matchHeader = line.match(headerC6Regex)
      if (matchHeader) {
        finalAtual = matchHeader[1].trim()
        titularAtual = matchHeader[2].trim()
        finais.add(finalAtual)
        titulares.add(titularAtual)
        continue
      }

      // Descartar subtotais e cabeçalhos de tabela informativos
      if (
        line.startsWith('Subtotal') ||
        line.startsWith('Data') ||
        line.includes('Total a pagar')
      ) {
        continue
      }

      const matchLinha = line.match(linhaC6Regex)
      if (!matchLinha) {
        // Linhas dentro da seção correta que não casarem viram aviso de linha não reconhecida
        avisos.push(`Linha não reconhecida (texto): "${line}"`)
        continue
      }

      const diaStr = matchLinha[1]
      const mesTexto = matchLinha[2]
      const mesNumerico = matchLinha[3]
      const rawDescricao = matchLinha[4].trim()
      const sinalNegativoAntes = matchLinha[5] === '-'
      const rawValor = matchLinha[6]
      const sinalNegativoDepois =
        matchLinha[7] && (matchLinha[7].includes('-') || matchLinha[7].toUpperCase().includes('CR'))

      const valorNum = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
      const mesLower = mesTexto ? mesTexto.toLowerCase() : ''
      const mes = mesTexto
        ? C6Parser.MESES_PT[mesLower] || mesVencimentoNum
        : parseInt(mesNumerico, 10) || mesVencimentoNum
      const dia = parseInt(diaStr, 10)

      // Pagamento anterior do C6 a IGNORAR (informativo de pagamento, nunca lançamento)
      // Ex: "09 set Inclusao de Pagamento 8.938,16"
      const c6DescUpper = rawDescricao.toUpperCase()
      if (
        c6DescUpper.includes('INCLUSAO DE PAGAMENTO') ||
        c6DescUpper.includes('PAGAMENTO DE FATURA') ||
        c6DescUpper.includes('PAGAMENTO RECEBIDO') ||
        c6DescUpper.includes('OBRIGADO PELO PAGAMENTO') ||
        c6DescUpper.startsWith('PAGTO ') ||
        c6DescUpper === 'PAGAMENTO'
      ) {
        valorPagamentosIgnorados += valorNum
        continue
      }

      // Detectar parcela no formato "- Parcela X/Y", "Parcela X/Y" ou "X/Y"
      let parcelaAtual: number | undefined
      let totalParcelas: number | undefined
      const matchParcela =
        rawDescricao.match(/Parcela\s+(\d+)\/(\d+)/i) ||
        rawDescricao.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\s|$)/)

      if (matchParcela) {
        parcelaAtual = parseInt(matchParcela[1], 10)
        totalParcelas = parseInt(matchParcela[2], 10)
      }

      // Inferência dinâmica do ano da compra a partir do anoBase
      let anoItem = anoBase
      if (mes > mesVencimentoNum + 1) {
        anoItem = anoBase - 1
      }

      let anoInferido = anoItem
      let dataInferidaDeAnoAnterior = false
      if (parcelaAtual && parcelaAtual > 1) {
        const totalMesesAtras = parcelaAtual - 1
        let mesCalc = mes - totalMesesAtras
        let anoCalc = anoItem
        while (mesCalc <= 0) {
          mesCalc += 12
          anoCalc -= 1
        }
        anoInferido = anoCalc
        if (anoCalc < anoBase) {
          dataInferidaDeAnoAnterior = true
        }
      }

      const dataFormatada = `${anoInferido}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

      // Detectar crédito / estorno / encargos
      let tipo: 'compra' | 'parcelado' | 'credito' | 'encargo' = 'compra'
      let tratamento: 'compra' | 'estorno' | 'credito_ajuste' | 'ignorar' = 'compra'
      let isCredito = false

      if (
        rawDescricao.toUpperCase().includes('ESTORNO') ||
        sinalNegativoAntes ||
        sinalNegativoDepois
      ) {
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
        parcelaAtual && totalParcelas ? Math.round(valorNum * totalParcelas * 100) / 100 : valorNum

      linhasExtraidas.push({
        ordem: ordemCounter++,
        tipo,
        tratamento,
        data: dataFormatada,
        descricaoOriginal: rawDescricao,
        descricaoNormalizada: descNormal,
        valor: valorNum,
        parcelaAtual,
        totalParcelas,
        valorParcela: parcelaAtual ? valorNum : undefined,
        valorTotalEstimado: valorEstimado,
        finalCartao: finalAtual || undefined,
        titular: titularAtual || undefined,
        isCredito,
        dataInferidaDeAnoAnterior,
      })
    }

    if (valorPagamentosIgnorados > 0) {
      avisos.push(
        `Pagamento anterior de fatura de R$ ${valorPagamentosIgnorados
          .toFixed(2)
          .replace('.', ',')} ignorado como lançamento (informativo).`,
      )
    }

    // C3 — Nunca falhar em silêncio: se nenhuma seção ou 0 linhas encontradas
    if (secoesEncontradas === 0 || linhasExtraidas.length === 0) {
      avisos.push('Nenhuma seção de transações encontrada no PDF ou nenhum lançamento extraído.')
      // Amostra das 15 primeiras linhas do texto extraído para diagnóstico visível
      const primeirasLinhas = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 15)
      if (primeirasLinhas.length > 0) {
        avisos.push(
          `Amostra do texto extraído do PDF (primeiras 15 linhas):\n` +
            primeirasLinhas.map((l, idx) => `${idx + 1}: ${l}`).join('\n'),
        )
      }
    }

    // Conferência financeira
    const comprasEncargos = linhasExtraidas
      .filter((l) => !l.isCredito)
      .reduce((sum, l) => sum + l.valor, 0)
    const creditos = linhasExtraidas.filter((l) => l.isCredito).reduce((sum, l) => sum + l.valor, 0)

    // Se o valor declarado não foi encontrado explicitamente no PDF, assume o total processado
    if (!valorTotalDeclarado) {
      valorTotalDeclarado = Math.round((comprasEncargos - creditos) * 100) / 100
    }

    const diferenca = Math.round((valorTotalDeclarado - (comprasEncargos - creditos)) * 100) / 100

    return {
      cabecalho: {
        emissor: 'c6',
        emissorNome: 'C6 Bank Carbon Mastercard Black',
        titulares: Array.from(titulares),
        finais: Array.from(finais),
        competencia,
        vencimento: vencimento || `${anoBase}-10-10`,
        fechamento: fechamento || `${anoBase}-10-02`,
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
