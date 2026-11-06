-- Migration: 20261106053000_importacao_faturas_pdf.sql
-- Objetivo: Estruturas temporárias de importação de faturas PDF,
-- linhas temporárias para revisão do usuário e tabela de aprendizado de regras de classificação.

-- 1. Sessões de Importação Temporária
CREATE TABLE IF NOT EXISTS public.fatura_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  emissor_detectado TEXT,
  competencia TEXT,
  data_vencimento DATE,
  data_fechamento DATE,
  valor_total_fatura NUMERIC(14, 2) DEFAULT 0.00,
  moeda TEXT DEFAULT 'BRL',
  quantidade_itens INTEGER DEFAULT 0,
  pdf_protegido BOOLEAN DEFAULT false,
  titulares_encontrados JSONB DEFAULT '[]'::jsonb,
  finais_encontrados JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'em_revisao', -- 'em_revisao', 'concluida', 'cancelada'
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fatura_importacoes_ws ON public.fatura_importacoes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_fatura_importacoes_hash ON public.fatura_importacoes(workspace_id, arquivo_hash);
CREATE INDEX IF NOT EXISTS idx_fatura_importacoes_cartao ON public.fatura_importacoes(cartao_id);

-- RLS para fatura_importacoes
ALTER TABLE public.fatura_importacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fatura_importacoes_all" ON public.fatura_importacoes;
CREATE POLICY "fatura_importacoes_all" ON public.fatura_importacoes
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'ativo'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'ativo'
    )
  );

-- 2. Linhas Temporárias de Revisão
CREATE TABLE IF NOT EXISTS public.fatura_importacao_linhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID NOT NULL REFERENCES public.fatura_importacoes(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  selecionado BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'novo', -- 'novo', 'preenchido_regra', 'conciliado', 'provavel_duplicado', 'duplicado', 'requer_revisao', 'ignorado', 'pronto', 'importado', 'erro'
  tipo_linha TEXT NOT NULL DEFAULT 'compra', -- 'compra', 'parcelado', 'credito', 'encargo', 'informativo'
  tratamento TEXT NOT NULL DEFAULT 'compra', -- 'compra', 'estorno', 'credito_ajuste', 'ignorar'
  data DATE NOT NULL,
  descricao_original TEXT NOT NULL,
  descricao_normalizada TEXT NOT NULL,
  descricao_editavel TEXT NOT NULL,
  valor NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  parcela_atual INTEGER,
  total_parcelas INTEGER,
  valor_parcela NUMERIC(14, 2),
  valor_total_estimado NUMERIC(14, 2),
  marcar_historicas_anteriores BOOLEAN DEFAULT true,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  subcategoria_id UUID REFERENCES public.subcategorias(id) ON DELETE SET NULL,
  modalidade_saida TEXT NOT NULL DEFAULT 'compra_propria',
  valor_proprio NUMERIC(14, 2),
  valor_terceiros NUMERIC(14, 2) DEFAULT 0.00,
  afeta_resultado BOOLEAN NOT NULL DEFAULT true,
  afeta_orcamento BOOLEAN NOT NULL DEFAULT true,
  final_cartao TEXT,
  titular TEXT,
  observacao TEXT,
  origem_classificacao TEXT DEFAULT 'manual', -- 'manual', 'regra_aprendida', 'padrao'
  regra_aprendida_id UUID,
  correspondencia_id UUID,
  correspondencia_tipo TEXT, -- 'lancamento', 'parcela'
  lancamento_criado_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  mensagem_erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fatura_linhas_importacao ON public.fatura_importacao_linhas(importacao_id);
CREATE INDEX IF NOT EXISTS idx_fatura_linhas_ws ON public.fatura_importacao_linhas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_fatura_linhas_status ON public.fatura_importacao_linhas(status);

-- RLS para fatura_importacao_linhas
ALTER TABLE public.fatura_importacao_linhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fatura_importacao_linhas_all" ON public.fatura_importacao_linhas;
CREATE POLICY "fatura_importacao_linhas_all" ON public.fatura_importacao_linhas
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'ativo'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'ativo'
    )
  );

-- 3. Regras Aprendidas de Classificação (Aprendizado de Máquina de Regras)
CREATE TABLE IF NOT EXISTS public.regras_classificacao_fatura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  padrao_busca TEXT NOT NULL, -- termo normalizado (ex: 'DROGASIL', 'AMAZON')
  descricao_sugerida TEXT,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  subcategoria_id UUID REFERENCES public.subcategorias(id) ON DELETE SET NULL,
  modalidade_saida TEXT DEFAULT 'compra_propria',
  afeta_resultado BOOLEAN DEFAULT true,
  afeta_orcamento BOOLEAN DEFAULT true,
  vezes_utilizada INTEGER DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_regras_classificacao_ws_padrao UNIQUE (workspace_id, padrao_busca)
);

CREATE INDEX IF NOT EXISTS idx_regras_classificacao_ws ON public.regras_classificacao_fatura(workspace_id);
CREATE INDEX IF NOT EXISTS idx_regras_classificacao_padrao ON public.regras_classificacao_fatura(workspace_id, padrao_busca);

-- RLS para regras_classificacao_fatura
ALTER TABLE public.regras_classificacao_fatura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regras_classificacao_fatura_all" ON public.regras_classificacao_fatura;
CREATE POLICY "regras_classificacao_fatura_all" ON public.regras_classificacao_fatura
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'ativo'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'ativo'
    )
  );
