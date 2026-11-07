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
  // Seções válidas: título contendo "COMPRAS PARCELADAS" ou "COMPRAS"
  private static readonly SECAO_COMPRAS = /^\s*\**\s*(compras\s+parceladas|compras)\b/i
  // Títulos que encerram a seção de compras (Demonstrativo, Anuidade, totais etc.)
  private static readonly SECAO_FIM =
    /(demonstrativo|anuidade|extrato|pagamentos?|encargos|juros|saldo|total|fatura|atendimento|dep[óo]sitos?|d[ée]bitos?\s+autom)/i

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
    let valorTotalDeclarado = 0
    let valorPagamentoAnterior = 0

    const matchVenc = fullText.match(/VENCIMENTO\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      const [d, m, y] = matchVenc[1].split('/')
      vencimento = `${y}-${m}-${d}`
    }

    const matchTotal = fullText.match(
      /VALOR\s+TOTAL\s+DESTA\s+FATURA\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    )
    if (matchTotal) {
      valorTotalDeclarado = parseFloat(matchTotal[1].replace(/\./g, '').replace(',', '.'))
    }

    let titularAtual = ''
    let finalAtual = ''
    // Competência derivada do vencimento extraído do PDF (fonte de dados, não regra fixa)
    const competencia = vencimento.slice(0, 7)
    const mesFatura = parseInt(competencia.slice(5, 7), 10) || 11
    const anoFatura = parseInt(competencia.slice(0, 4), 10) || new Date().getFullYear()

    let inSecaoCompras = false
    let ordemCounter = 1

    // Regex de cabeçalho de seção de cartão:
    // Ex: "EVANDRO DA SILVA GUEDES (Cartão 4882)"
    // Ex: "JOSIVANIA M FERNANDES (Cartão 7965)"
    const headerCartaoRegex = /^([A-ZÀ-Ú\s]+?)\s*\((?:Cart[aã]o|Cartao)\s+(\d{4})\)/i

    // Regex de linha CAIXA (C4 — tolerante a variações de layout):
    // Ex: "20/06 JK AUTO PECAS 04 DE 10 CACOAL 298,00D"
    // Ex: "28/09 EBN*SPOTIFY CURITIBA 23,90D"
    // Ex: "28/09 EBN*SPOTIFY CURITIBA 23,90 D" (espaço entre valor e sufixo)
    const linhaCaixaRegex =
      /^(\d{2}\/\d{2})\s+(.+?)\s+([\d.]+,\d{2})\s*\**\s*([DC])\s*(?:\((?:P|D)\))?$/i

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
      const line = lines[i].trim()
      if (!line) continue

      // Mudança de cartão / titular (vale dentro ou fora da seção)
      const matchHeaderCartao = line.match(headerCartaoRegex)
      if (matchHeaderCartao) {
        titularAtual = matchHeaderCartao[1].trim()
        finalAtual = matchHeaderCartao[2].trim()
        titulares.add(titularAtual)
        finais.add(finalAtual)
        pendente = null
        continue
      }

      // Delimitação de seção (C2)
      if (
        CaixaParser.SECAO_COMPRAS.test(line) &&
        !CaixaParser.SECAO_FIM.test(line.replace(CaixaParser.SECAO_COMPRAS, ''))
      ) {
        inSecaoCompras = true
        pendente = null
        continue
      }
      // Qualquer outro título de seção/rodapé encerra a seção de compras
      if (
        !CaixaParser.SECAO_COMPRAS.test(line) &&
        CaixaParser.SECAO_FIM.test(line) &&
        !/^\d{2}\/\d{2}/.test(line)
      ) {
        inSecaoCompras = false
        pendente = null
        continue
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
