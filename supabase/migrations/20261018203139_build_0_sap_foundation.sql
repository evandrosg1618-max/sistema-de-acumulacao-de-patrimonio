-- Migration Build 0: SAP Fundação
-- Versão 3.0: Workspaces, Memberships, Perfis, Permissões, Escopos, Convites, 
-- Contas, Cartões, Categorias, Lançamentos, Séries, Parcelas, Faturas, Pagamentos,
-- Movimentações, Orçamentos, Metas, Auditoria e Idempotência.
-- RLS habilitado em todas as tabelas com políticas ativas.
-- Seed do usuário administrador inicial evandro.s.g1618@gmail.com

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  timezone TEXT NOT NULL DEFAULT 'America/Porto_Velho',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WORKSPACES
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ROLES
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  sistema BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, nome)
);

-- 5. PERMISSIONS
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  descricao TEXT NOT NULL
);

-- 6. ROLE_PERMISSIONS
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  permitido BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(role_id, permission_id)
);

-- 7. WORKSPACE_MEMBERS
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil TEXT NOT NULL CHECK (perfil IN ('Administrador', 'Cliente', 'Colaborador')),
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'pendente')),
  convidado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 8. MEMBER_SCOPES
CREATE TABLE IF NOT EXISTS public.member_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  tipo_escopo TEXT NOT NULL CHECK (tipo_escopo IN ('conta', 'cartao')),
  entidade_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, tipo_escopo, entidade_id)
);

-- 9. USER_INVITATIONS
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('Administrador', 'Cliente', 'Colaborador')),
  token_hash TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'cancelado', 'expirado')),
  convidado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. CONTAS (Saldo inicial auditado, tipos do PRD)
CREATE TABLE IF NOT EXISTS public.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'movimento',
    'provisao',
    'investimento',
    'Reserva de Emergência',
    'Reserva de Investimento',
    'Reserva de Sonhos'
  )),
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  saldo_atual NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  cor TEXT DEFAULT '#17C3B2',
  icone TEXT DEFAULT 'wallet',
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 11. CARTOES
CREATE TABLE IF NOT EXISTS public.cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  bandeira TEXT NOT NULL DEFAULT 'Outro',
  dia_fechamento INTEGER NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  limite NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  cor TEXT DEFAULT '#4F46E5',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 12. MEIOS_PAGAMENTO (CONTA / CARTAO / DINHEIRO com vínculo exclusivo)
CREATE TABLE IF NOT EXISTS public.meios_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('CONTA', 'CARTAO', 'DINHEIRO')),
  conta_id UUID REFERENCES public.contas(id) ON DELETE CASCADE,
  cartao_id UUID REFERENCES public.cartoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_meio_exclusivo CHECK (
    (tipo = 'CONTA' AND conta_id IS NOT NULL AND cartao_id IS NULL) OR
    (tipo = 'CARTAO' AND cartao_id IS NOT NULL AND conta_id IS NULL) OR
    (tipo = 'DINHEIRO' AND conta_id IS NULL AND cartao_id IS NULL)
  )
);

-- 13. CATEGORIAS (Grupo, natureza fixa/variável, classificação gerencial)
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  natureza TEXT NOT NULL DEFAULT 'variavel' CHECK (natureza IN ('fixa', 'variavel')),
  classificacao_gerencial TEXT NOT NULL DEFAULT 'Custo de Vida' CHECK (classificacao_gerencial IN (
    'Receitas Fixas',
    'Receitas Variáveis',
    'Custo de Vida',
    'Despesas Variáveis',
    'Dívidas',
    'Liberdade',
    'Acumulação de Capital'
  )),
  cor TEXT DEFAULT '#64748B',
  icone TEXT DEFAULT 'tag',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 14. SUBCATEGORIAS
CREATE TABLE IF NOT EXISTS public.subcategorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 15. SERIES_LANCAMENTOS (Fixos recorrentes e projeção)
CREATE TABLE IF NOT EXISTS public.series_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  periodicidade TEXT NOT NULL DEFAULT 'mensal' CHECK (periodicidade IN ('mensal', 'semanal', 'anual')),
  prazo TEXT NOT NULL DEFAULT 'indeterminado' CHECK (prazo IN ('determinado', 'indeterminado')),
  quantidade_total INTEGER,
  ocorrencias_geradas INTEGER NOT NULL DEFAULT 0,
  proxima_competencia TEXT NOT NULL, -- YYYY-MM
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. LANCAMENTOS (Base de despesa, receita e transferência)
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita', 'transferencia')),
  regime TEXT NOT NULL DEFAULT 'unico' CHECK (regime IN ('unico', 'fixo', 'parcelado')),
  serie_id UUID REFERENCES public.series_lancamentos(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  competencia TEXT NOT NULL, -- YYYY-MM
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  meio_pagamento_tipo TEXT NOT NULL CHECK (meio_pagamento_tipo IN ('CONTA', 'CARTAO', 'DINHEIRO')),
  conta_origem_id UUID REFERENCES public.contas(id) ON DELETE RESTRICT,
  conta_destino_id UUID REFERENCES public.contas(id) ON DELETE RESTRICT,
  cartao_id UUID REFERENCES public.cartoes(id) ON DELETE RESTRICT,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE RESTRICT,
  subcategoria_id UUID REFERENCES public.subcategorias(id) ON DELETE RESTRICT,
  status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago', 'cancelado')),
  data_pagamento DATE,
  observacao TEXT,
  quantidade_parcelas INTEGER DEFAULT 1,
  idempotency_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_transferencia_contas CHECK (
    tipo != 'transferencia' OR (conta_origem_id IS NOT NULL AND conta_destino_id IS NOT NULL AND conta_origem_id != conta_destino_id)
  )
);

-- 17. FATURAS
CREATE TABLE IF NOT EXISTS public.faturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL, -- YYYY-MM
  data_fechamento DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'fechada')),
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, cartao_id, competencia)
);

-- 18. PARCELAS
CREATE TABLE IF NOT EXISTS public.parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lancamento_id UUID NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  competencia TEXT NOT NULL, -- YYYY-MM
  data_vencimento DATE NOT NULL,
  fatura_id UUID REFERENCES public.faturas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lancamento_id, numero_parcela)
);

-- 19. FATURA_PARCELAS
CREATE TABLE IF NOT EXISTS public.fatura_parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fatura_id UUID NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  parcela_id UUID NOT NULL REFERENCES public.parcelas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fatura_id, parcela_id)
);

-- 20. PAGAMENTOS_FATURA
CREATE TABLE IF NOT EXISTS public.pagamentos_fatura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fatura_id UUID NOT NULL REFERENCES public.faturas(id) ON DELETE RESTRICT,
  conta_id UUID NOT NULL REFERENCES public.contas(id) ON DELETE RESTRICT,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'efetivado' CHECK (status IN ('efetivado', 'estornado')),
  idempotency_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. MOVIMENTACOES_CONTA
CREATE TABLE IF NOT EXISTS public.movimentacoes_conta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  lancamento_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  pagamento_fatura_id UUID REFERENCES public.pagamentos_fatura(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'transferencia_entrada', 'transferencia_saida', 'estorno')),
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  idempotency_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. ORCAMENTOS
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  ano_mes TEXT NOT NULL, -- YYYY-MM
  limite NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (limite >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, categoria_id, ano_mes)
);

-- 23. METAS_ACUMULACAO
CREATE TABLE IF NOT EXISTS public.metas_acumulacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ano_mes TEXT NOT NULL, -- YYYY-MM
  criterio TEXT NOT NULL CHECK (criterio IN (
    'Receitas Fixas',
    'Receitas Variáveis',
    'Custo de Vida',
    'Despesas Variáveis',
    'Dívidas',
    'Liberdade',
    'Acumulação de Capital'
  )),
  valor_previsto NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  valor_realizado NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, ano_mes, criterio)
);

-- 24. AUDITORIA_SERIES
CREATE TABLE IF NOT EXISTS public.auditoria_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  serie_id UUID NOT NULL REFERENCES public.series_lancamentos(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  escopo TEXT NOT NULL,
  detalhes JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. AUDITORIA_OPERACOES (Estado anterior/posterior de operações críticas)
CREATE TABLE IF NOT EXISTS public.auditoria_operacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entidade TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  acao TEXT NOT NULL,
  estado_anterior JSONB,
  estado_posterior JSONB,
  idempotency_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. IDEMPOTENCY_REQUESTS
CREATE TABLE IF NOT EXISTS public.idempotency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  operacao TEXT NOT NULL,
  solicitante UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hash_entrada TEXT NOT NULL,
  resultado JSONB,
  status TEXT NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'concluido', 'falha')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, chave)
);

-- 27. INDEXES
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contas_ws ON public.contas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cartoes_ws ON public.cartoes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_categorias_ws ON public.categorias(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subcategorias_ws ON public.subcategorias(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_ws_data ON public.lancamentos(workspace_id, data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_ws_comp ON public.lancamentos(workspace_id, competencia);
CREATE INDEX IF NOT EXISTS idx_faturas_ws_comp ON public.faturas(workspace_id, cartao_id, competencia);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_ws_data ON public.movimentacoes_conta(workspace_id, data);
CREATE INDEX IF NOT EXISTS idx_orcamentos_ws_mes ON public.orcamentos(workspace_id, ano_mes);
CREATE INDEX IF NOT EXISTS idx_auditoria_operacoes_ws ON public.auditoria_operacoes(workspace_id, created_at DESC);

-- 28. ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meios_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatura_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_fatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_acumulacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_requests ENABLE ROW LEVEL SECURITY;

-- 29. HELPER SECURITY DEFINER FUNCTION FOR WORKSPACE ACCESS
-- Avoids recursive RLS checks when querying workspace_members
CREATE OR REPLACE FUNCTION public.is_member_of_workspace(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND status = 'ativo'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_of_workspace(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND status = 'ativo'
      AND perfil = 'Administrador'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 30. RLS POLICIES

-- PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- WORKSPACES
DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_member_of_workspace(id));

DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_admin_of_workspace(id))
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin_of_workspace(id));

-- WORKSPACE_MEMBERS
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_member_of_workspace(workspace_id));

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_of_workspace(workspace_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (public.is_admin_of_workspace(workspace_id))
  WITH CHECK (public.is_admin_of_workspace(workspace_id));

DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;
CREATE POLICY "workspace_members_delete" ON public.workspace_members
  FOR DELETE TO authenticated
  USING (public.is_admin_of_workspace(workspace_id));

-- ROLES & PERMISSIONS
DROP POLICY IF EXISTS "permissions_select" ON public.permissions;
CREATE POLICY "permissions_select" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select" ON public.roles
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_member_of_workspace(workspace_id));

DROP POLICY IF EXISTS "roles_manage" ON public.roles;
CREATE POLICY "roles_manage" ON public.roles
  FOR ALL TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_admin_of_workspace(workspace_id))
  WITH CHECK (workspace_id IS NOT NULL AND public.is_admin_of_workspace(workspace_id));

DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- MEMBER_SCOPES
DROP POLICY IF EXISTS "member_scopes_select" ON public.member_scopes;
CREATE POLICY "member_scopes_select" ON public.member_scopes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "member_scopes_manage" ON public.member_scopes;
CREATE POLICY "member_scopes_manage" ON public.member_scopes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.id = member_id AND public.is_admin_of_workspace(m.workspace_id)
  ));

-- USER_INVITATIONS
DROP POLICY IF EXISTS "user_invitations_select" ON public.user_invitations;
CREATE POLICY "user_invitations_select" ON public.user_invitations
  FOR SELECT TO authenticated
  USING (public.is_member_of_workspace(workspace_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "user_invitations_manage" ON public.user_invitations;
CREATE POLICY "user_invitations_manage" ON public.user_invitations
  FOR ALL TO authenticated
  USING (public.is_admin_of_workspace(workspace_id))
  WITH CHECK (public.is_admin_of_workspace(workspace_id));

-- GENERIC MACRO POLICIES FOR WORKSPACE-OWNED TABLES
-- (contas, cartoes, meios_pagamento, categorias, subcategorias, series_lancamentos, lancamentos, faturas, parcelas, fatura_parcelas, pagamentos_fatura, movimentacoes_conta, orcamentos, metas_acumulacao, auditoria_series, auditoria_operacoes, idempotency_requests)

-- CONTAS
DROP POLICY IF EXISTS "contas_all" ON public.contas;
CREATE POLICY "contas_all" ON public.contas
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- CARTOES
DROP POLICY IF EXISTS "cartoes_all" ON public.cartoes;
CREATE POLICY "cartoes_all" ON public.cartoes
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- MEIOS_PAGAMENTO
DROP POLICY IF EXISTS "meios_pagamento_all" ON public.meios_pagamento;
CREATE POLICY "meios_pagamento_all" ON public.meios_pagamento
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- CATEGORIAS
DROP POLICY IF EXISTS "categorias_all" ON public.categorias;
CREATE POLICY "categorias_all" ON public.categorias
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- SUBCATEGORIAS
DROP POLICY IF EXISTS "subcategorias_all" ON public.subcategorias;
CREATE POLICY "subcategorias_all" ON public.subcategorias
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- SERIES_LANCAMENTOS
DROP POLICY IF EXISTS "series_lancamentos_all" ON public.series_lancamentos;
CREATE POLICY "series_lancamentos_all" ON public.series_lancamentos
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- LANCAMENTOS
DROP POLICY IF EXISTS "lancamentos_all" ON public.lancamentos;
CREATE POLICY "lancamentos_all" ON public.lancamentos
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- FATURAS
DROP POLICY IF EXISTS "faturas_all" ON public.faturas;
CREATE POLICY "faturas_all" ON public.faturas
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- PARCELAS
DROP POLICY IF EXISTS "parcelas_all" ON public.parcelas;
CREATE POLICY "parcelas_all" ON public.parcelas
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- FATURA_PARCELAS
DROP POLICY IF EXISTS "fatura_parcelas_all" ON public.fatura_parcelas;
CREATE POLICY "fatura_parcelas_all" ON public.fatura_parcelas
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- PAGAMENTOS_FATURA
DROP POLICY IF EXISTS "pagamentos_fatura_all" ON public.pagamentos_fatura;
CREATE POLICY "pagamentos_fatura_all" ON public.pagamentos_fatura
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- MOVIMENTACOES_CONTA
DROP POLICY IF EXISTS "movimentacoes_conta_all" ON public.movimentacoes_conta;
CREATE POLICY "movimentacoes_conta_all" ON public.movimentacoes_conta
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- ORCAMENTOS
DROP POLICY IF EXISTS "orcamentos_all" ON public.orcamentos;
CREATE POLICY "orcamentos_all" ON public.orcamentos
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- METAS_ACUMULACAO
DROP POLICY IF EXISTS "metas_acumulacao_all" ON public.metas_acumulacao;
CREATE POLICY "metas_acumulacao_all" ON public.metas_acumulacao
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- AUDITORIA_SERIES
DROP POLICY IF EXISTS "auditoria_series_all" ON public.auditoria_series;
CREATE POLICY "auditoria_series_all" ON public.auditoria_series
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- AUDITORIA_OPERACOES
DROP POLICY IF EXISTS "auditoria_operacoes_all" ON public.auditoria_operacoes;
CREATE POLICY "auditoria_operacoes_all" ON public.auditoria_operacoes
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- IDEMPOTENCY_REQUESTS
DROP POLICY IF EXISTS "idempotency_requests_all" ON public.idempotency_requests;
CREATE POLICY "idempotency_requests_all" ON public.idempotency_requests
  FOR ALL TO authenticated
  USING (public.is_member_of_workspace(workspace_id))
  WITH CHECK (public.is_member_of_workspace(workspace_id));

-- 31. TRIGGERS AUTOMÁTICOS
-- Auto-cria perfil e workspace inicial quando um usuário se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_nome TEXT;
  v_ws_id UUID;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  
  -- 1. Cria perfil
  INSERT INTO public.profiles (id, nome, email, moeda, timezone)
  VALUES (NEW.id, v_nome, NEW.email, 'BRL', 'America/Porto_Velho')
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email;

  -- 2. Cria workspace familiar inicial se o usuário não for membro de nenhum
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.workspaces (nome, owner_user_id, ativo)
    VALUES ('Família ' || v_nome, NEW.id, TRUE)
    RETURNING id INTO v_ws_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, perfil, status, accepted_at)
    VALUES (v_ws_id, NEW.id, 'Administrador', 'ativo', NOW())
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 32. SEED DE PERMISSÕES PADRÃO DO PRD
INSERT INTO public.permissions (codigo, modulo, acao, descricao) VALUES
  ('view', 'global', 'view', 'Visualização de dados autorizados'),
  ('create', 'lancamentos', 'create', 'Criar lançamentos e movimentações'),
  ('update', 'lancamentos', 'update', 'Alterar lançamentos e cadastros'),
  ('cancel', 'lancamentos', 'cancel', 'Cancelar ou estornar lançamentos'),
  ('pay', 'pagamentos', 'pay', 'Pagar faturas e despesas não cartão'),
  ('reverse_payment', 'pagamentos', 'reverse_payment', 'Estornar pagamentos de faturas e despesas'),
  ('transfer', 'contas', 'transfer', 'Realizar transferências entre contas'),
  ('manage_budget', 'orcamento', 'manage_budget', 'Definir e gerenciar limites orçamentários'),
  ('manage_recurring', 'fixos', 'manage_recurring', 'Criar, alterar e materializar séries de Fixos'),
  ('view_reports', 'relatorios', 'view_reports', 'Consultar relatórios e gráficos gerenciais'),
  ('export', 'exportacao', 'export', 'Exportar dados autorizados do workspace'),
  ('view_audit', 'auditoria', 'view_audit', 'Visualizar trilha de auditoria e operações críticas'),
  ('manage_users', 'usuarios', 'manage_users', 'Gerenciar membros, convites e perfis'),
  ('manage_permissions', 'permissoes', 'manage_permissions', 'Conceder e alterar permissões granulares')
ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- 33. SEED DO USUÁRIO INICIAL CONFORME O SKILL SUPABASE
-- Email: evandro.s.g1618@gmail.com / Senha: Skip@Pass
DO $$
DECLARE
  v_seed_user_id UUID;
  v_seed_ws_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'evandro.s.g1618@gmail.com') THEN
    v_seed_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_seed_user_id,
      '00000000-0000-0000-0000-000000000000',
      'evandro.s.g1618@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Evandro"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );

    INSERT INTO public.profiles (id, nome, email, moeda, timezone)
    VALUES (v_seed_user_id, 'Evandro', 'evandro.s.g1618@gmail.com', 'BRL', 'America/Porto_Velho')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.workspaces (nome, owner_user_id, ativo)
    VALUES ('Família Evandro', v_seed_user_id, TRUE)
    RETURNING id INTO v_seed_ws_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, perfil, status, accepted_at)
    VALUES (v_seed_ws_id, v_seed_user_id, 'Administrador', 'ativo', NOW())
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END IF;
END $$;
