import { LinhaFaturaExtraida, ParserResult, EmissorFatura } from '@/types/faturaPdf'
import { normalizarNomeEstabelecimento } from './normalizadorEstabelecimento'

/**
 * Adaptador / Parser unificado para CAIXA (Mastercard e Visa).
 *
 * REGRA (C2): processa EXCLUSIVAMENTE as seções cujo título contém
 * "COMPRAS" ou "COMPRAS PARCELADAS". Linhas do Demonstrativo (AJUSTE CRED,
 * OBRIGADO PELO PAGAMENTO, saldos) NÃO viram linha de revisão — são
 * descartadas sem nem serem mostradas (decisão do usuário).
 *
 * Tolerância de layout (C4): espaço entre valor e sufixo D/C, descrição
 * quebrada em duas linhas, valor em linha separada.
 *
 * Padrão de parcelas: "04 DE 10", "08 DE 08", "02 DE 05", "11 DE 12".
 */
export class CaixaParser {
  // Seções válidas: título contendo "COMPRAS PARCELADAS", "COMPRAS NACIONAIS", "COMPRAS INTERNACIONAIS" ou "COMPRAS"
  // Tolerante a espaços, hífens, asteriscos e quebras
  private static readonly SECAO_COMPRAS =
    /^\s*[*•\-–]*\s*(compras\s+parceladas|compras\s+nacionais|compras\s+internacionais|compras)\b/i

  // Títulos que legitimamente encerram o bloco de compras quando iniciam a linha
  // NUNCA casar se for linha com data (ex: "28/09 PAGAMENTO..."), nem se a palavra aparecer no meio de uma descrição
  private static readonly SECAO_FIM =
    /^(?:demonstrativo|anuidade|extrato|encargos|juros|central\s+de\s+atendimento|ouvidoria|atendimento|dep[óo]sitos?|d[ée]bitos?\s+autom[aá]ticos?|op[cç][õo]es\s+de\s+parcelamento)\b/i

  static parse(fullText: string, lines: string[], emissorForcado?: EmissorFatura): ParserResult {
    const avisos: string[] = []
    const linhasExtraidas: LinhaFaturaExtraida[] = []

    const isMaster =
      fullText.includes('5530.XXXX') ||
      fullText.includes('Mastercard') ||
      emissorForcado === 'caixa_master'
    const emissor: EmissorFatura = isMaster ? 'caixa_master' : 'caixa_visa'
    const emissorNome = isMaster ? 'CAIXA Mastercard' : 'CAIXA Visa Infinite'

    // Metadados — C5: NENHUM valor ou data chumbada
    const titulares = new Set<string>()
    const finais = new Set<string>()
    let vencimento = ''
    let fechamento = ''
    let valorTotalDeclarado = 0
    let valorPagamentoAnterior = 0

    // Vencimento: busca "VENCIMENTO 01/11/2026" ou similar no texto completo
    const matchVenc = fullText.match(/VENCIMENTO[^\d\n]*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      const [d, m, y] = matchVenc[1].split('/')
      vencimento = `${y}-${m}-${d}`
    } else {
      avisos.push('Vencimento não identificado automaticamente no PDF da CAIXA.')
    }

    // Fechamento: busca "MELHOR DIA PARA COMPRA" ou "FECHAMENTO" ou "DATA DE CORTE"
    const matchFech =
      fullText.match(/(?:melhor\s+dia|fechamento|corte)[^\d\n]*(\d{2}\/\d{2}\/\d{4})/i) ||
      fullText.match(
        /per[íi]odo[^\d\n]*\d{2}\/\d{2}\/\d{4}\s*(?:a|at[é|e])\s*(\d{2}\/\d{2}\/\d{4})/i,
      )
    if (matchFech) {
      const [d, m, y] = matchFech[1].split('/')
      fechamento = `${y}-${m}-${d}`
    }

    const matchTotal =
      fullText.match(/VALOR\s+TOTAL\s+DESTA\s+FATURA\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i) ||
      fullText.match(/TOTAL\s+DA\s+FATURA\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i) ||
      fullText.match(/TOTAL\s+A\s+PAGAR\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i)
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    let titularAtual = ''
    let finalAtual = ''
    // Competência derivada do vencimento extraído do PDF
    const competencia = vencimento ? vencimento.slice(0, 7) : new Date().toISOString().slice(0, 7)
    const mesFatura = vencimento ? parseInt(vencimento.slice(5, 7), 10) : 11
    const anoFatura = vencimento ? parseInt(vencimento.slice(0, 4), 10) : new Date().getFullYear()

    let inSecaoCompras = false
    let secoesComprasEncontradas = 0
    let ordemCounter = 1

    // Regex de cabeçalho de seção de cartão:
    // Ex: "EVANDRO DA SILVA GUEDES (Cartão 4882)"
    // Ex: "JOSIVANIA M FERNANDES (Cartão 7965)"
    // Ex: "Cartão 4882 - EVANDRO DA SILVA GUEDES"
    const headerCartaoRegex = /^([A-ZÀ-Ú\s]+?)\s*\((?:Cart[aã]o|Cartao)\s+(\d{4})\)/i
    const headerCartaoAltRegex = /^(?:Cart[aã]o|Cartao)\s+(\d{4})\s*[-–]\s*([A-ZÀ-Ú\s]+)/i

    // Regex de linha CAIXA (tolerante a variações de layout):
    // Ex: "20/06 JK AUTO PECAS 04 DE 10 CACOAL 298,00D"
    // Ex: "28/09 EBN*SPOTIFY CURITIBA 23,90D"
    // Ex: "28/09 EBN*SPOTIFY CURITIBA 23,90 D" (espaço entre valor e sufixo)
    // Ex: "28/09 EBN*SPOTIFY CURITIBA R$ 23,90 D"
    const linhaCaixaRegex =
      /^(\d{2}\/\d{2})\s+(.+?)\s+(?:R\$\s*)?([\d.]+,\d{2})\s*\**\s*([DC])(?:\s*\((?:P|D)\))?$/i

    // Descrição quebrada: data + início da descrição numa linha, valor noutra
    const linhaSemValor = /^(\d{2}\/\d{2})\s+(.+)$/
    const somenteValor = /^([\d.]+,\d{2})\s*\**\s*([DC])$/i
    let pendente: { data: string; desc: string } | null = null

    const emitir = (
      dataDiaMes: string,
      rawDescricao: string,
      rawValor: string,
      sufixoDC: string,
    ) => {
      const valorNum = parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
      const isCredito = sufixoDC.toUpperCase() === 'C'

      // Padrão de parcelas CAIXA: "04 DE 10", "08 DE 08", "02 DE 05"
      let parcelaAtual: number | undefined
      let totalParcelas: number | undefined
      const matchParcela = rawDescricao.match(/(\d{1,2})\s+DE\s+(\d{1,2})\b/i)
      if (matchParcela) {
        parcelaAtual = parseInt(matchParcela[1], 10)
        totalParcelas = parseInt(matchParcela[2], 10)
      }

      // Inferência do ano (BLOCO G): parcela N/Total numa fatura de M/AAAA →
      // compra ocorreu ~(N+1) faturas antes; o ano recua quando o mês zera.
      const [diaStr, mesStr] = dataDiaMes.split('/')
      const dia = parseInt(diaStr, 10)
      const mes = parseInt(mesStr, 10)
      let anoInferido = anoFatura
      let dataInferidaDeAnoAnterior = false

      if (parcelaAtual && parcelaAtual > 1) {
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
        tratamento = rawDescricao.toUpperCase().includes('AJUSTE CRED')
          ? 'credito_ajuste'
          : 'estorno'
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
        finalCartao: finalAtual || null,
        titular: titularAtual || null,
        isCredito,
        dataInferidaDeAnoAnterior,
      })
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i]
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!rawLine) continue
      const line = rawLine

      // Mudança de cartão / titular (vale dentro ou fora da seção)
      const matchHeaderCartao = line.match(headerCartaoRegex) || line.match(headerCartaoAltRegex)
      if (matchHeaderCartao) {
        const t1 = matchHeaderCartao[1].trim()
        const t2 = matchHeaderCartao[2].trim()
        if (/^\d{4}$/.test(t1)) {
          finalAtual = t1
          titularAtual = t2
        } else {
          titularAtual = t1
          finalAtual = t2
        }
        titulares.add(titularAtual)
        finais.add(finalAtual)
        pendente = null
        continue
      }

      // Delimitação de seção (C2 e C6):
      // Início de compras: "COMPRAS", "COMPRAS PARCELADAS", "COMPRAS NACIONAIS", etc.
      if (CaixaParser.SECAO_COMPRAS.test(line)) {
        inSecaoCompras = true
        secoesComprasEncontradas++
        pendente = null
        continue
      }

      // Fim de seção de compras: só deve encerrar se NÃO tiver data (não for lançamento)
      // e começar explicitamente com uma das palavras-chave de fim
      if (inSecaoCompras && CaixaParser.SECAO_FIM.test(line) && !/^\d{2}\/\d{2}/.test(line)) {
        inSecaoCompras = false
        pendente = null
        continue
      }

      // Linhas fora da seção de compras são ignoradas
      if (!inSecaoCompras) {
        // Se encontramos uma linha com formato claro de transação CAIXA fora de seção formalmente aberta,
        // mas já tivemos um titular/cartão, pode ser que o cabeçalho de compras tenha quebrado
        // Ex: "JK AUTO PECAS 04 DE 10" com data
        // Vamos checar se começa com data e termina com D/C
        if (
          linhaCaixaRegex.test(line) &&
          !line.toUpperCase().includes('PAGAMENTO') &&
          !line.toUpperCase().includes('OBRIGADO')
        ) {
          // É uma transação de compras legítima cujo cabeçalho foi engolido ou variado
          inSecaoCompras = true
          secoesComprasEncontradas++
        } else {
          continue
        }
      }

      if (!inSecaoCompras) continue

      // Totais dentro da seção não são lançamentos
      if (/^(total\b|total final|valor total)/i.test(line)) {
        pendente = null
        continue
      }

      // Cabeçalho decorativo da tabela (Data / Lançamentos / Valor etc.)
      if (/^(data|lan[çc]amentos?|valor|descri[çc][aã]o)\b/i.test(line) && line.length < 60) {
        continue
      }

      const matchLinha = line.match(linhaCaixaRegex)
      if (matchLinha) {
        pendente = null
        emitir(matchLinha[1], matchLinha[2], matchLinha[3], matchLinha[4])
        continue
      }

      // Valor sozinho numa linha (descrição quebrada em duas)
      const mv = line.match(somenteValor)
      if (mv && pendente) {
        emitir(pendente.data, pendente.desc, mv[1], mv[2])
        pendente = null
        continue
      }

      // Data + descrição sem valor (continuação na linha seguinte)
      const md = line.match(linhaSemValor)
      if (md && !/^\d{2}\/\d{2}$/.test(line)) {
        pendente = { data: md[1], desc: md[2].trim() }
        continue
      }

      // Continuação pura de descrição quebrada
      if (pendente) {
        pendente = { data: pendente.data, desc: `${pendente.desc} ${line}`.trim() }
        continue
      }

      // C4: linha da seção correta que não casou — registra para diagnóstico
      avisos.push(`Linha não reconhecida (texto): "${line}"`)
    }

    if (pendente && pendente.desc.trim()) {
      avisos.push(`Linha não reconhecida (texto): "${pendente.data} ${pendente.desc}"`)
    }

    // C2 estrito: AJUSTE/C não devem aparecer; se sobrou algum dentro de COMPRAS
    // (raro), descarta sem mostrar, conforme decisão do usuário.
    const ajustesDentroDeCompras = linhasExtraidas.filter(
      (l) => l.isCredito && l.tratamento === 'credito_ajuste',
    )
    for (const a of ajustesDentroDeCompras) {
      linhasExtraidas.splice(linhasExtraidas.indexOf(a), 1)
      avisos.push(`Ajuste de crédito descartado conforme configurado: "${a.descricaoOriginal}"`)
    }

    // Diretriz do usuário: SOMA dos lançamentos processados × Total declarado × diferença
    const comprasEncargos = linhasExtraidas
      .filter((l) => !l.isCredito)
      .reduce((sum, l) => sum + l.valor, 0)
    const creditos = linhasExtraidas.filter((l) => l.isCredito).reduce((sum, l) => sum + l.valor, 0)
    const diferenca = Math.round((valorTotalDeclarado - (comprasEncargos - creditos)) * 100) / 100

    if (linhasExtraidas.length === 0) {
      avisos.push(
        'Nenhum lançamento reconhecido nas seções COMPRAS / COMPRAS PARCELADAS. Verifique se o PDF é uma fatura CAIXA e se as seções de compras estão presentes.',
      )
      // Amostra das 15 primeiras linhas para diagnóstico
      const amostra = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 15)
      if (amostra.length > 0) {
        avisos.push(
          `Amostra do texto extraído do PDF da CAIXA (primeiras 15 linhas):\n` +
            amostra.map((l, idx) => `${idx + 1}: ${l}`).join('\n'),
        )
      }
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
