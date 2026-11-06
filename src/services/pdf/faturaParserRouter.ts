import { EmissorFatura, ParserResult } from '@/types/faturaPdf'
import { BradescoParser } from './bradescoParser'
import { CaixaParser } from './caixaParser'
import { C6Parser } from './c6Parser'

/**
 * Detecta o emissor da fatura a partir do conteúdo textual completo.
 */
export function detectarEmissorFatura(fullText: string): EmissorFatura {
  const upper = fullText.toUpperCase()

  if (
    upper.includes('BRADESCO') ||
    upper.includes('BRADESCO CARTÕES') ||
    upper.includes('BRADESCO CARTOES')
  ) {
    return 'bradesco'
  }

  if (upper.includes('C6 BANK') || upper.includes('BANCO C6') || upper.includes('C6 CARBON')) {
    return 'c6'
  }

  if (
    upper.includes('CARTÕES CAIXA') ||
    upper.includes('CARTOES CAIXA') ||
    upper.includes('CENTRAL DE ATENDIMENTO CARTÕES CAIXA')
  ) {
    if (upper.includes('5530.XXXX') || upper.includes('MASTERCARD')) {
      return 'caixa_master'
    }
    return 'caixa_visa'
  }

  return 'outro'
}

/**
 * Roteia a execução para o parser/adaptador correspondente.
 */
export function executarParserFatura(
  fullText: string,
  lines: string[],
  emissorForcado?: EmissorFatura,
): ParserResult {
  const emissor = emissorForcado || detectarEmissorFatura(fullText)

  switch (emissor) {
    case 'bradesco':
      return BradescoParser.parse(fullText, lines)
    case 'caixa_master':
      return CaixaParser.parse(fullText, lines, 'caixa_master')
    case 'caixa_visa':
      return CaixaParser.parse(fullText, lines, 'caixa_visa')
    case 'c6':
      return C6Parser.parse(fullText, lines)
    default:
      // Tenta heurística Bradesco depois Caixa
      if (fullText.includes('Total da fatura em real')) {
        return BradescoParser.parse(fullText, lines)
      }
      return CaixaParser.parse(fullText, lines)
  }
}
