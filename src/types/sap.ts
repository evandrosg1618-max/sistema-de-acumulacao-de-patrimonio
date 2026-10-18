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
export type NaturezaCategoria = 'fixa' | 'variavel'
export type ClassificacaoGerencial =
  | 'Receitas Fixas'
  | 'Receitas Variáveis'
  | 'Custo de Vida'
  | 'Despesas Variáveis'
  | 'Dívidas'
  | 'Liberdade'
  | 'Acumulação de Capital'

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
  natureza: NaturezaCategoria
  classificacao_gerencial: ClassificacaoGerencial
  cor?: string | null
  icone?: string | null
  ativo: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  subcategorias?: Subcategoria[]
}

export interface Subcategoria {
  id: string
  workspace_id: string
  categoria_id: string
  nome: string
  observacao?: string | null
  ativo: boolean
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
  categoria?: Categoria | null
  subcategoria?: Subcategoria | null
  conta_origem?: Conta | null
  conta_destino?: Conta | null
  cartao?: Cartao | null
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
