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
