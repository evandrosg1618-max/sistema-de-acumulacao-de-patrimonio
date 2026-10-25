export function formatMoneyBRL(val: number | string | null | undefined): string {
  const num = typeof val === 'string' ? parseFloat(val) : Number(val || 0)
  if (isNaN(num)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatPercentBR(val: number | string | null | undefined): string {
  const num = typeof val === 'string' ? parseFloat(val) : Number(val || 0)
  if (isNaN(num)) return '0,00%'
  return `${num.toFixed(2).replace('.', ',')}%`
}

/**
 * Retorna a data no formato YYYY-MM-DD considerando o fuso horário especificado.
 * Padrão SAP: America/Porto_Velho (UTC-4).
 * Corrige o problema onde após às 20h a data UTC avança para o dia seguinte.
 */
export function getTodayDateString(timezone: string = 'America/Porto_Velho'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  } catch {
    // Fallback seguro caso o timezone seja inválido
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}

export function getCurrentAnoMes(timezone: string = 'America/Porto_Velho'): string {
  const today = getTodayDateString(timezone)
  return today.substring(0, 7)
}

export function formatAnoMesPT(anoMes: string): string {
  if (!anoMes || !anoMes.includes('-')) return anoMes
  const [ano, mes] = anoMes.split('-')
  const meses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ]
  const idx = parseInt(mes, 10) - 1
  return `${meses[idx] || mes} de ${ano}`
}
