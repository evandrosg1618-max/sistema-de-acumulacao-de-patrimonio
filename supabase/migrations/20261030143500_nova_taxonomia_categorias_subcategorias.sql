-- Migração: Nova Taxonomia Analítica de Categorias e Subcategorias do SAP
-- 1. Novos campos em subcategorias:
--    Despesa: classificacao ('Essencial', 'Ajustavel', 'Discricionaria', 'Superflua'), natureza ('Consumo', 'Patrimonial')
--    Receita: regularidade ('Recorrente mensal', 'Recorrente anual', 'Recorrente variavel', 'Eventual'), origem_economica ('Trabalho', 'Capital', 'Outras')
--    Visual & Controle: cor, icone, observacao (já existe), arquivado (boolean default false), data_arquivamento
-- 2. Categorias: arquivado (boolean default false), data_arquivamento
--    Remoção dos checks legados de natureza ('fixa'/'variavel') e classificacao_gerencial nas categorias, tornando-os opcionais / descontinuados.
-- 3. RPCs atômicas com verificação de integridade referencial:
--    - verificar_exclusao_subcategoria_rpc
--    - excluir_subcategoria_rpc
--    - arquivar_subcategoria_rpc
--    - desarquivar_subcategoria_rpc
--    - verificar_exclusao_categoria_rpc
--    - excluir_categoria_rpc
--    - arquivar_categoria_rpc
--    - desarquivar_categoria_rpc

-- A. Alterações na tabela categorias
ALTER TABLE public.categorias
  DROP CONSTRAINT IF EXISTS categorias_natureza_check,
  DROP CONSTRAINT IF EXISTS categorias_classificacao_gerencial_check;

ALTER TABLE public.categorias
  ALTER COLUMN natureza DROP NOT NULL,
  ALTER COLUMN classificacao_gerencial DROP NOT NULL;

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_arquivamento TIMESTAMPTZ DEFAULT NULL;

-- B. Alterações na tabela subcategorias
ALTER TABLE public.subcategorias
  ADD COLUMN IF NOT EXISTS classificacao TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS natureza TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS regularidade TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS origem_economica TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS icone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_arquivamento TIMESTAMPTZ DEFAULT NULL;

-- Constraints de validação analítica (quando informadas)
ALTER TABLE public.subcategorias
  DROP CONSTRAINT IF EXISTS subcategorias_classificacao_check,
  DROP CONSTRAINT IF EXISTS subcategorias_natureza_check,
  DROP CONSTRAINT IF EXISTS subcategorias_regularidade_check,
  DROP CONSTRAINT IF EXISTS subcategorias_origem_economica_check;

ALTER TABLE public.subcategorias
  ADD CONSTRAINT subcategorias_classificacao_check
    CHECK (classificacao IS NULL OR classificacao IN ('Essencial', 'Ajustável', 'Discricionária', 'Supérflua')),
  ADD CONSTRAINT subcategorias_natureza_check
    CHECK (natureza IS NULL OR natureza IN ('Consumo', 'Patrimonial')),
  ADD CONSTRAINT subcategorias_regularidade_check
    CHECK (regularidade IS NULL OR regularidade IN ('Recorrente mensal', 'Recorrente anual', 'Recorrente variável', 'Eventual')),
  ADD CONSTRAINT subcategorias_origem_economica_check
    CHECK (origem_economica IS NULL OR origem_economica IN ('Trabalho', 'Capital', 'Outras'));

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_subcategorias_arquivado ON public.subcategorias(workspace_id, arquivado);
CREATE INDEX IF NOT EXISTS idx_categorias_arquivado ON public.categorias(workspace_id, arquivado);

-- C. RPC: Verificar se subcategoria pode ser excluída fisicamente
CREATE OR REPLACE FUNCTION public.verificar_pode_excluir_subcategoria_rpc(
  p_workspace_id UUID,
  p_subcategoria_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_lancamentos INT := 0;
  v_total_series INT := 0;
  v_total_orcamentos INT := 0;
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM public.subcategorias
  WHERE id = p_subcategoria_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'pode_excluir', false, 'mensagem', 'Subcategoria não encontrada.');
  END IF;

  -- 1. Verificar em TODO o histórico de lançamentos (independente de mês, ano, situação, status ou deleted_at)
  SELECT COUNT(*) INTO v_total_lancamentos
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id
    AND subcategoria_id = p_subcategoria_id;

  -- 2. Verificar em séries recorrentes
  SELECT COUNT(*) INTO v_total_series
  FROM public.series_lancamentos
  WHERE workspace_id = p_workspace_id
    AND subcategoria_id = p_subcategoria_id;

  -- 3. Verificar em limites orçamentários
  SELECT COUNT(*) INTO v_total_orcamentos
  FROM public.orcamento_limites
  WHERE workspace_id = p_workspace_id
    AND subcategoria_id = p_subcategoria_id
    AND limite_definido > 0;

  IF v_total_lancamentos > 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'pode_excluir', false,
      'motivo', 'lancamentos',
      'total_lancamentos', v_total_lancamentos,
      'mensagem', 'Existem lançamentos registrados nesta subcategoria. Não é permitida a exclusão.'
    );
  END IF;

  IF v_total_series > 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'pode_excluir', false,
      'motivo', 'series',
      'total_series', v_total_series,
      'mensagem', 'Existem séries recorrentes vinculadas a esta subcategoria. Não é permitida a exclusão.'
    );
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pode_excluir', true,
    'total_lancamentos', 0,
    'mensagem', 'Subcategoria sem lançamentos históricos. Exclusão permitida.'
  );
END;
$$;

-- D. RPC: Excluir Subcategoria com proteção referencial
CREATE OR REPLACE FUNCTION public.excluir_subcategoria_rpc(
  p_workspace_id UUID,
  p_subcategoria_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_verificacao JSONB;
  v_sub RECORD;
BEGIN
  -- Lock na linha
  SELECT * INTO v_sub
  FROM public.subcategorias
  WHERE id = p_subcategoria_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Subcategoria não encontrada.');
  END IF;

  v_verificacao := public.verificar_pode_excluir_subcategoria_rpc(p_workspace_id, p_subcategoria_id);

  IF (v_verificacao->>'pode_excluir')::BOOLEAN IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'bloqueado', true,
      'mensagem', v_verificacao->>'mensagem',
      'motivo', v_verificacao->>'motivo'
    );
  END IF;

  -- Se possui apenas orçamentos zerados/sem lançamentos, limpar os limites órfãos
  DELETE FROM public.orcamento_limites
  WHERE workspace_id = p_workspace_id AND subcategoria_id = p_subcategoria_id;

  -- Excluir definitivamente a subcategoria
  DELETE FROM public.subcategorias
  WHERE id = p_subcategoria_id AND workspace_id = p_workspace_id;

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, created_by
  ) VALUES (
    p_workspace_id, 'subcategorias', p_subcategoria_id, 'excluir_definitivo', to_jsonb(v_sub), p_user_id
  );

  RETURN jsonb_build_object('sucesso', true, 'mensagem', 'Subcategoria excluída com sucesso.');
END;
$$;

-- E. RPC: Arquivar / Desarquivar Subcategoria
CREATE OR REPLACE FUNCTION public.arquivar_subcategoria_rpc(
  p_workspace_id UUID,
  p_subcategoria_id UUID,
  p_arquivar BOOLEAN,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub RECORD;
  v_data_arq TIMESTAMPTZ := CASE WHEN p_arquivar THEN now() ELSE NULL END;
BEGIN
  SELECT * INTO v_sub
  FROM public.subcategorias
  WHERE id = p_subcategoria_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Subcategoria não encontrada.');
  END IF;

  UPDATE public.subcategorias
  SET arquivado = p_arquivar,
      data_arquivamento = v_data_arq,
      updated_at = now()
  WHERE id = p_subcategoria_id AND workspace_id = p_workspace_id;

  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id,
    'subcategorias',
    p_subcategoria_id,
    CASE WHEN p_arquivar THEN 'arquivar' ELSE 'desarquivar' END,
    to_jsonb(v_sub),
    jsonb_build_object('arquivado', p_arquivar, 'data_arquivamento', v_data_arq),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'arquivado', p_arquivar,
    'mensagem', CASE WHEN p_arquivar THEN 'Subcategoria arquivada com sucesso.' ELSE 'Subcategoria reativada com sucesso.' END
  );
END;
$$;

-- F. RPC: Verificar e Excluir Categoria Principal
CREATE OR REPLACE FUNCTION public.verificar_pode_excluir_categoria_rpc(
  p_workspace_id UUID,
  p_categoria_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_subs INT := 0;
  v_total_lancamentos INT := 0;
  v_cat RECORD;
BEGIN
  SELECT * INTO v_cat
  FROM public.categorias
  WHERE id = p_categoria_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'pode_excluir', false, 'mensagem', 'Categoria não encontrada.');
  END IF;

  SELECT COUNT(*) INTO v_total_subs
  FROM public.subcategorias
  WHERE workspace_id = p_workspace_id AND categoria_id = p_categoria_id;

  SELECT COUNT(*) INTO v_total_lancamentos
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id AND categoria_id = p_categoria_id;

  IF v_total_lancamentos > 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'pode_excluir', false,
      'motivo', 'lancamentos',
      'total_lancamentos', v_total_lancamentos,
      'mensagem', 'Existem lançamentos registrados nas subcategorias desta categoria. Não é permitida a exclusão.'
    );
  END IF;

  IF v_total_subs > 0 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'pode_excluir', false,
      'motivo', 'subcategorias',
      'total_subcategorias', v_total_subs,
      'mensagem', 'Existem subcategorias vinculadas a esta categoria. Remova ou arquive as subcategorias antes de excluir a categoria.'
    );
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pode_excluir', true,
    'mensagem', 'Categoria sem subcategorias nem lançamentos. Exclusão permitida.'
  );
END;
$$;

-- G. RPC: Arquivar / Desarquivar Categoria
CREATE OR REPLACE FUNCTION public.arquivar_categoria_rpc(
  p_workspace_id UUID,
  p_categoria_id UUID,
  p_arquivar BOOLEAN,
  p_arquivar_subcategorias BOOLEAN DEFAULT true,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cat RECORD;
  v_data_arq TIMESTAMPTZ := CASE WHEN p_arquivar THEN now() ELSE NULL END;
BEGIN
  SELECT * INTO v_cat
  FROM public.categorias
  WHERE id = p_categoria_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Categoria não encontrada.');
  END IF;

  UPDATE public.categorias
  SET arquivado = p_arquivar,
      data_arquivamento = v_data_arq,
      updated_at = now()
  WHERE id = p_categoria_id AND workspace_id = p_workspace_id;

  -- Se solicitado arquivar e arquivar subcategorias filhas também
  IF p_arquivar AND p_arquivar_subcategorias THEN
    UPDATE public.subcategorias
    SET arquivado = true,
        data_arquivamento = v_data_arq,
        updated_at = now()
    WHERE workspace_id = p_workspace_id AND categoria_id = p_categoria_id;
  ELSIF NOT p_arquivar THEN
    -- Desarquivar a categoria também desarquiva suas subcategorias
    UPDATE public.subcategorias
    SET arquivado = false,
        data_arquivamento = NULL,
        updated_at = now()
    WHERE workspace_id = p_workspace_id AND categoria_id = p_categoria_id;
  END IF;

  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id,
    'categorias',
    p_categoria_id,
    CASE WHEN p_arquivar THEN 'arquivar' ELSE 'desarquivar' END,
    to_jsonb(v_cat),
    jsonb_build_object('arquivado', p_arquivar, 'data_arquivamento', v_data_arq),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'arquivado', p_arquivar,
    'mensagem', CASE WHEN p_arquivar THEN 'Categoria arquivada com sucesso.' ELSE 'Categoria reativada com sucesso.' END
  );
END;
$$;
