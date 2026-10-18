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

export function getCurrentAnoMes(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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
