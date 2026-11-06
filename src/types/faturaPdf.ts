export type EmissorFatura = 'c6' | 'bradesco' | 'caixa_master' | 'caixa_visa' | 'outro'

export type TipoLinhaFatura = 'compra' | 'parcelado' | 'credito' | 'encargo' | 'informativo'

export type TratamentoLinhaFatura = 'compra' | 'estorno' | 'credito_ajuste' | 'ignorar'

export type StatusLinhaFatura =
  | 'novo'
  | 'preenchido_regra'
  | 'conciliado'
  | 'provavel_duplicado'
  | 'duplicado'
  | 'requer_revisao'
  | 'ignorado'
  | 'pronto'
  | 'importado'
  | 'erro'

export interface FaturaCabecalhoExtraido {
  emissor: EmissorFatura
  emissorNome: string
  cartaoIdentificado?: string
  titulares: string[]
  finais: string[]
  competencia?: string // YYYY-MM
  vencimento?: string // YYYY-MM-DD
  fechamento?: string // YYYY-MM-DD
  valorTotalFatura?: number
  moeda: string
  quantidadeItens?: number
  pdfProtegido: boolean
}

export interface LinhaFaturaExtraida {
  ordem: number
  tipo: TipoLinhaFatura
  tratamento: TratamentoLinhaFatura
  data: string // YYYY-MM-DD
  descricaoOriginal: string
  descricaoNormalizada: string
  valor: number
  parcelaAtual?: number
  totalParcelas?: number
  valorParcela?: number
  valorTotalEstimado?: number
  finalCartao?: string
  titular?: string
  isCredito?: boolean
  isPagamento?: boolean
  dataInferidaDeAnoAnterior?: boolean
}

export interface ParserResult {
  cabecalho: FaturaCabecalhoExtraido
  linhas: LinhaFaturaExtraida[]
  avisos: string[]
  resumoFinanceiro: {
    valorTotalFatura: number
    comprasEncargosReconhecidos: number
    creditosRelevantes: number
    diferenca: number
    conferido: boolean
  }
}
