/**
 * T4 (TESTE CAPTURA 4) — Parsing de texto monetário BR, fonte ÚNICA do app.
 *
 * Regra: aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "12,5",
 * "1,234.56" (formato EN), símbolos e espaços. SEMPRE devolve um NUMBER.
 * Nunca lança: entrada inválida ⇒ 0.
 *
 * A LÓGICA DE CÁLCULO do app NÃO muda — este helper só normaliza a ENTRADA
 * antes dela chegar aos mesmos números/parse que já existiam.
 */

/** Limpa símbolos (R$, espaços, NBSP) mantendo dígitos, separadores e sinal. */
export function limparTextoMonetario(entrada: string): string {
  return String(entrada ?? '')
    .replace(/[^\d,.-]/g, '')
    .trim()
}

/**
 * Converte texto monetário (pt-BR ou en-US) em number.
 * - "1.234,56" → 1234.56
 * - "1234.56"  → 1234.56
 * - "12,5"     → 12.5
 * - ""/inválido → 0
 */
export function valorDeTextoMonetarioBR(entrada: string): number {
  let s = limparTextoMonetario(entrada)
  if (!s || s === '-' || s === '.' || s === ',') return 0

  if (s.includes(',') && s.includes('.')) {
    // Tem os dois separadores: o ÚLTIMO é o decimal; o outro é milhar.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // pt-BR: "1.234,56" → remove pontos, vírgula vira ponto
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // en-US: "1,234.56" → remove vírgulas
      s = s.replace(/,/g, '')
    }
  } else if (s.includes(',')) {
    // Só vírgula: vírgula é decimal (pt-BR). "1,234" ⇒ 1.234 (NÃO 1234).
    s = s.replace(',', '.')
  }
  // Só ponto: já está em formato numérico.

  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Formata number → string com vírgula decimal (exibição nos inputs). */
export function formatarValorComVirgula(valor: number, casas = 2): string {
  if (!Number.isFinite(valor)) return ''
  return valor.toFixed(casas).replace('.', ',')
}
