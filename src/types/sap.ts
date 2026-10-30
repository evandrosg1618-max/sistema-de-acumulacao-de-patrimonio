export type PerfilUsuario = 'Administrador' | 'Cliente' | 'Colaborador'
export type StatusMembro = 'ativo' | 'inativo' | 'pendente'
export type TipoConta =
  | 'movimento'
  | 'provisao'
  | 'investimento'
  | 'Reserva de Emergência'
  | 'Reserva de Investimento'
  | 'Reserva de Sonhos'

export type MeioPagamentoTipo = 'CONTA' | 'CARTAO' | 'DINHEIRO'

export type CategoriaTipo = 'despesa' | 'receita'

// NOVA TAXONOMIA ANALÍTICA (SEÇÃO 2 A 11 DO PRD):
// Despesas:
export type ClassificacaoDespesa = 'Essencial' | 'Ajustável' | 'Discricionária' | 'Supérflua'
export type NaturezaDespesa = 'Consumo' | 'Patrimonial'

// Receitas:
export type RegularidadeReceita =
  | 'Recorrente mensal'
  | 'Recorrente anual'
  | 'Recorrente variável'
  | 'Eventual'
export type OrigemEconomicaReceita = 'Trabalho' | 'Capital' | 'Outras'

// Tipos legados mantidos apenas para compatibilidade de tipagem se necessário
export type NaturezaCategoria = 'fixa' | 'variavel'
export type ClassificacaoGerencial =
  | 'Receitas Fixas'
  | 'Receitas Variáveis'
  | 'Custo de Vida'
  | 'Despesas Variáveis'
  | 'Dívidas'
  | 'Liberdade'
  | 'Acumulação de Capital'
  | 'Acumulação de Patrimônio'

export type TipoLancamento = 'despesa' | 'receita' | 'transferencia'
export type RegimeLancamento = 'unico' | 'fixo' | 'parcelado'
export type StatusPagamento = 'pendente' | 'pago' | 'cancelado'
export type StatusFatura = 'aberta' | 'paga' | 'fechada'

export interface Workspace {
  id: string
  nome: string
  owner_user_id: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  perfil: PerfilUsuario
  role_id?: string | null
  status: StatusMembro
  convidado_por?: string | null
  invited_at: string
  accepted_at?: string | null
  created_at: string
  user_email?: string
  user_nome?: string
}

export interface UserProfileData {
  id: string
  nome: string
  email: string
  moeda: string
  timezone: string
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  codigo: string
  modulo: string
  acao: string
  descricao: string
}

export interface AuditoriaOperacao {
  id: string
  workspace_id: string
  entidade: string
  entidade_id: string
  acao: string
  estado_anterior?: any
  estado_posterior?: any
  idempotency_key?: string | null
  created_by?: string | null
  created_at: string
}

export interface UserInvitation {
  id: string
  workspace_id: string
  email: string
  perfil: PerfilUsuario
  token_hash: string
  expira_em: string
  status: 'pendente' | 'aceito' | 'cancelado' | 'expirado'
  convidado_por?: string | null
  created_at: string
}

export interface Conta {
  id: string
  workspace_id: string
  nome: string
  tipo: TipoConta
  saldo_inicial: number
  saldo_atual: number
  cor?: string | null
  icone?: string | null
  ativa: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface CarteiraDinheiro {
  id: string
  workspace_id: string
  nome: string
  tipo: 'DINHEIRO'
  ativo: boolean
  saldo_atual: number
  cor?: string
  created_at: string
}

export interface Cartao {
  id: string
  workspace_id: string
  nome: string
  bandeira: string
  dia_fechamento: number
  dia_vencimento: number
  limite: number
  cor?: string | null
  ativo: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  fatura_atual?: number
  total_comprometido?: number
}

export interface MeioPagamento {
  id: string
  workspace_id: string
  tipo: MeioPagamentoTipo
  conta_id?: string | null
  cartao_id?: string | null
  nome: string
  ativo: boolean
  created_at: string
  saldo_atual?: number
  cor?: string
  conta?: Conta | null
  cartao?: Cartao | null
}

export interface Categoria {
  id: string
  workspace_id: string
  nome: string
  tipo: CategoriaTipo
  cor?: string | null
  icone?: string | null
  ativo: boolean
  arquivado?: boolean
  data_arquivamento?: string | null
  observacao?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  subcategorias?: Subcategoria[]
  // Campos legados mantidos como opcionais para compatibilidade
  natureza?: NaturezaCategoria | null
  classificacao_gerencial?: ClassificacaoGerencial | string | null
}

export interface Subcategoria {
  id: string
  workspace_id: string
  categoria_id: string
  nome: string
  // Novos atributos analíticos por subcategoria
  classificacao?: ClassificacaoDespesa | null
  natureza?: NaturezaDespesa | null
  regularidade?: RegularidadeReceita | null
  origem_economica?: OrigemEconomicaReceita | null
  cor?: string | null
  icone?: string | null
  observacao?: string | null
  ativo: boolean
  arquivado?: boolean
  data_arquivamento?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface Orcamento {
  id: string
  workspace_id: string
  categoria_id: string
  ano_mes: string
  limite: number
  created_by?: string | null
  created_at: string
  updated_at: string
  categoria?: Categoria | null
  consumo_atual?: number
}

export interface Lancamento {
  id: string
  workspace_id: string
  tipo: TipoLancamento
  regime: RegimeLancamento
  serie_id?: string | null
  data: string
  competencia: string
  descricao: string
  valor: number
  meio_pagamento_tipo: MeioPagamentoTipo
  conta_origem_id?: string | null
  conta_destino_id?: string | null
  cartao_id?: string | null
  categoria_id?: string | null
  subcategoria_id?: string | null
  status_pagamento: StatusPagamento
  data_pagamento?: string | null
  observacao?: string | null
  quantidade_parcelas?: number
  conciliado?: boolean
  data_conciliacao?: string | null
  conciliado_por?: string | null
  idempotency_key?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  numero_parcela?: number | null
  total_parcelas?: number | null
  lancamento_pai_id?: string | null
  natureza_previsao?: boolean
  eh_excecao?: boolean
  categoria?: Categoria | null
  subcategoria?: Subcategoria | null
  conta_origem?: Conta | null
  conta_destino?: Conta | null
  cartao?: Cartao | null
  series_lancamentos?: {
    id: string
    prazo?: PrazoFixo | null
    quantidade_total?: number | null
    descricao?: string | null
  } | null
}

export interface Fatura {
  id: string
  workspace_id: string
  cartao_id: string
  competencia: string
  data_fechamento: string
  data_vencimento: string
  status: StatusFatura
  valor_total: number
  created_at: string
  updated_at: string
  cartao?: Cartao | null
}

export interface PagamentoFatura {
  id: string
  workspace_id: string
  fatura_id: string
  conta_id: string
  valor: number
  data_pagamento: string
  status: 'efetivado' | 'estornado'
  idempotency_key?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  conta?: Conta | null
  fatura?: Fatura | null
}

export type PeriodicidadeFixo = 'mensal' | 'semestral' | 'anual'
export type PrazoFixo = 'indeterminado' | 'determinado'

export interface SerieLancamento {
  id: string
  workspace_id: string
  descricao: string
  tipo: TipoLancamento
  periodicidade: PeriodicidadeFixo
  prazo: PrazoFixo
  quantidade_total?: number | null
  ocorrencias_geradas: number
  proxima_competencia: string
  ativo: boolean
  data_inicio?: string
  dia_vencimento?: number
  valor?: number
  meio_pagamento_tipo?: MeioPagamentoTipo
  conta_origem_id?: string | null
  conta_destino_id?: string | null
  cartao_id?: string | null
  categoria_id?: string | null
  subcategoria_id?: string | null
  observacao?: string | null
  data_limite_projecao?: string
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface ConciliacaoConta {
  id: string
  workspace_id: string
  conta_id: string
  data_extrato: string
  saldo_sistema: number
  saldo_extrato: number
  divergencia: number
  ajustado: boolean
  lancamento_ajuste_id?: string | null
  observacao?: string | null
  created_by?: string | null
  created_at: string
  conta?: Conta | null
}

// BUILD 6: Interfaces para Orçamento Familiar Mensal
export interface OrcamentoSubcategoriaItem {
  id: string // subcategoria_id
  nome: string
  limite_definido: number
  valor_efetivado: number
  gasto_periodo_anterior: number
}

export interface OrcamentoCategoriaItem {
  id: string // categoria_id
  nome: string
  cor?: string | null
  icone?: string | null
  limite_definido: number
  valor_efetivado: number
  gasto_periodo_anterior: number
  subcategorias: OrcamentoSubcategoriaItem[]
}

export interface OrcamentoConsolidado {
  competencia: string
  competencia_anterior: string
  tem_limites: boolean
  tem_limites_anterior: boolean
  despesas_efetivado: number
  despesas_limite: number
  categorias: OrcamentoCategoriaItem[]
}

export interface LancamentoPeriodoAnteriorItem {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  status_pagamento: string
  meio_pagamento_tipo: string
  categoria_nome?: string | null
  subcategoria_nome?: string | null
  conta_nome?: string | null
  cartao_nome?: string | null
}
