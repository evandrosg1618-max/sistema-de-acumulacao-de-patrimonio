-- ============================================================================
-- BUILD 6: ORÇAMENTO FAMILIAR MENSAL
-- Tabela orcamento_limites (por subcategoria e competência), RLS, Auditoria e RPCs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orcamento_limites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subcategoria_id UUID NOT NULL REFERENCES public.subcategorias(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL, -- 'YYYY-MM'
  limite_definido NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (limite_definido >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_orcamento_limites_ws_sub_comp UNIQUE (workspace_id, subcategoria_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_limites_ws_comp
  ON public.orcamento_limites(workspace_id, competencia);

CREATE INDEX IF NOT EXISTS idx_orcamento_limites_subcat
  ON public.orcamento_limites(subcategoria_id);

-- RLS
ALTER TABLE public.orcamento_limites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orcamento_limites_all" ON public.orcamento_limites;
CREATE POLICY "orcamento_limites_all" ON public.orcamento_limites
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
    )
    OR
    workspace_id IN (
      SELECT w.id FROM public.workspaces w WHERE w.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
    )
    OR
    workspace_id IN (
      SELECT w.id FROM public.workspaces w WHERE w.owner_user_id = auth.uid()
    )
  );

GRANT ALL ON public.orcamento_limites TO authenticated;
GRANT ALL ON public.orcamento_limites TO service_role;

-- ============================================================================
-- RPC 1: gravar_limite_subcategoria_rpc
-- Grava ou atualiza atomicamente o limite de uma subcategoria numa competência.
-- Se limite = 0 ou nulo, se existir registro pode atualizar para 0 ou remover. Mantemos valor numérico >= 0.
-- Registra auditoria e retorna o registro gravado.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.gravar_limite_subcategoria_rpc(
  p_workspace_id UUID,
  p_subcategoria_id UUID,
  p_competencia TEXT,
  p_limite NUMERIC,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subcat RECORD;
  v_limite_num NUMERIC := COALESCE(p_limite, 0.00);
  v_registro RECORD;
  v_anterior JSONB := NULL;
  v_posterior JSONB := NULL;
  v_acao TEXT := 'insert';
BEGIN
  -- Validações de entrada
  IF p_workspace_id IS NULL OR p_subcategoria_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios workspace, subcategoria e competência não fornecidos.';
  END IF;

  IF v_limite_num < 0 THEN
    RAISE EXCEPTION 'O limite definido não pode ser negativo.';
  END IF;

  -- Validar se a subcategoria pertence ao workspace e é de categoria de despesa
  SELECT s.id, s.nome, s.categoria_id, c.tipo
  INTO v_subcat
  FROM public.subcategorias s
  JOIN public.categorias c ON c.id = s.categoria_id
  WHERE s.id = p_subcategoria_id
    AND s.workspace_id = p_workspace_id
    AND s.deleted_at IS NULL
    AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada ou não pertence a este espaço de trabalho.';
  END IF;

  IF v_subcat.tipo != 'despesa' THEN
    RAISE EXCEPTION 'Limites orçamentários só podem ser atribuídos a categorias de despesa.';
  END IF;

  -- Bloqueio e verificação de registro existente
  SELECT *
  INTO v_registro
  FROM public.orcamento_limites
  WHERE workspace_id = p_workspace_id
    AND subcategoria_id = p_subcategoria_id
    AND competencia = p_competencia
  FOR UPDATE;

  IF FOUND THEN
    v_anterior := to_jsonb(v_registro);
    v_acao := 'update';

    UPDATE public.orcamento_limites
    SET limite_definido = v_limite_num,
        updated_at = NOW(),
        created_by = COALESCE(p_user_id, created_by)
    WHERE id = v_registro.id
    RETURNING * INTO v_registro;
  ELSE
    INSERT INTO public.orcamento_limites (
      workspace_id,
      subcategoria_id,
      competencia,
      limite_definido,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      p_workspace_id,
      p_subcategoria_id,
      p_competencia,
      v_limite_num,
      p_user_id,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_registro;
  END IF;

  v_posterior := to_jsonb(v_registro);

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id,
    entidade,
    entidade_id,
    acao,
    estado_anterior,
    estado_posterior,
    created_by,
    created_at
  )
  VALUES (
    p_workspace_id,
    'orcamento_limites',
    v_registro.id,
    v_acao,
    v_anterior,
    v_posterior,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_registro.id,
    'workspace_id', v_registro.workspace_id,
    'subcategoria_id', v_registro.subcategoria_id,
    'competencia', v_registro.competencia,
    'limite_definido', v_registro.limite_definido
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gravar_limite_subcategoria_rpc(UUID, UUID, TEXT, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_limite_subcategoria_rpc(UUID, UUID, TEXT, NUMERIC, UUID) TO service_role;


-- ============================================================================
-- RPC 2: copiar_limites_periodo_anterior_rpc
-- Copia em transação única todos os limites da competência anterior para a atual.
-- Apenas insere ou sobrescreve os limites para as subcategorias ativas.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copiar_limites_periodo_anterior_rpc(
  p_workspace_id UUID,
  p_competencia_origem TEXT,
  p_competencia_destino TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_copiados INTEGER := 0;
  v_rec RECORD;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia_origem IS NULL OR p_competencia_destino IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios não fornecidos.';
  END IF;

  -- Copiar todos os limites definidos da competência de origem para a de destino
  -- usando ON CONFLICT DO UPDATE
  FOR v_rec IN
    SELECT ol.subcategoria_id, ol.limite_definido
    FROM public.orcamento_limites ol
    JOIN public.subcategorias s ON s.id = ol.subcategoria_id
    WHERE ol.workspace_id = p_workspace_id
      AND ol.competencia = p_competencia_origem
      AND s.deleted_at IS NULL
  LOOP
    INSERT INTO public.orcamento_limites (
      workspace_id,
      subcategoria_id,
      competencia,
      limite_definido,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      p_workspace_id,
      v_rec.subcategoria_id,
      p_competencia_destino,
      v_rec.limite_definido,
      p_user_id,
      NOW(),
      NOW()
    )
    ON CONFLICT (workspace_id, subcategoria_id, competencia)
    DO UPDATE SET
      limite_definido = EXCLUDED.limite_definido,
      updated_at = NOW();

    v_copiados := v_copiados + 1;
  END LOOP;

  -- Auditoria da cópia
  INSERT INTO public.auditoria_operacoes (
    workspace_id,
    entidade,
    entidade_id,
    acao,
    estado_anterior,
    estado_posterior,
    created_by,
    created_at
  )
  VALUES (
    p_workspace_id,
    'orcamento_limites',
    p_workspace_id,
    'copiar_periodo_anterior',
    jsonb_build_object('origem', p_competencia_origem, 'destino', p_competencia_destino),
    jsonb_build_object('copiados', v_copiados),
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'copiados', v_copiados,
    'competencia_origem', p_competencia_origem,
    'competencia_destino', p_competencia_destino
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.copiar_limites_periodo_anterior_rpc(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copiar_limites_periodo_anterior_rpc(UUID, TEXT, TEXT, UUID) TO service_role;


-- ============================================================================
-- RPC 3: obter_orcamento_consolidado_rpc
-- Retorna o painel completo de orçamento para a competência informada:
-- 1. Lista de categorias de despesa ativas do workspace;
-- 2. Lista de subcategorias vinculadas;
-- 3. Limite definido por subcategoria (da tabela orcamento_limites);
-- 4. Valor efetivado da competência (por subcategoria e categoria) com:
--    - Despesas pagas em conta (status_pagamento = 'pago') OU lançadas em cartão (CARTAO conta como pago);
--    - Filtradas pela competência ou data dentro do mês;
--    - Exclui pagamentos de fatura, transferências e ajustes;
-- 5. Valor efetivado do período anterior (mesmo critério de Saídas Efetivadas com cartão pago);
-- 6. Totais gerais de Despesas ({Valor Efetivado} de {Limite Definido}).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.obter_orcamento_consolidado_rpc(
  p_workspace_id UUID,
  p_competencia TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano INT;
  v_mes INT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_comp_anterior TEXT;
  v_data_inicio_ant DATE;
  v_data_fim_ant DATE;
  v_tem_limites BOOLEAN := FALSE;
  v_tem_limites_anterior BOOLEAN := FALSE;
  v_categorias_json JSONB;
  v_total_efetivado NUMERIC := 0.00;
  v_total_limite NUMERIC := 0.00;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Workspace e competência são obrigatórios.';
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;
  v_data_inicio := make_date(v_ano, v_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month' - interval '1 day')::DATE;

  -- Competência anterior
  v_data_inicio_ant := (v_data_inicio - interval '1 month')::DATE;
  v_data_fim_ant := (v_data_inicio - interval '1 day')::DATE;
  v_comp_anterior := to_char(v_data_inicio_ant, 'YYYY-MM');

  -- Verifica se existem limites definidos na competência atual
  SELECT EXISTS (
    SELECT 1 FROM public.orcamento_limites
    WHERE workspace_id = p_workspace_id
      AND competencia = p_competencia
      AND limite_definido > 0
  ) INTO v_tem_limites;

  -- Verifica se existem limites na competência anterior
  SELECT EXISTS (
    SELECT 1 FROM public.orcamento_limites
    WHERE workspace_id = p_workspace_id
      AND competencia = v_comp_anterior
      AND limite_definido > 0
  ) INTO v_tem_limites_anterior;

  -- Tabela temporária para agregações
  -- Gasto efetivado da competência atual por subcategoria
  -- Regra: Despesas não canceladas e não deletadas;
  -- Não soma filhos de parcelas filhas;
  -- Status pago em conta/dinheiro OU qualquer gasto em cartão de crédito (cartão conta como pago).
  -- Data entre início e fim do mês
  WITH gastos_atual AS (
    SELECT
      l.subcategoria_id,
      l.categoria_id,
      COALESCE(SUM(l.valor), 0.00) AS total_efetivado
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status_pagamento != 'cancelado'
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND (l.status_pagamento = 'pago' OR l.meio_pagamento_tipo = 'CARTAO')
      AND l.data >= v_data_inicio
      AND l.data <= v_data_fim
    GROUP BY l.subcategoria_id, l.categoria_id
  ),
  gastos_anterior AS (
    SELECT
      l.subcategoria_id,
      l.categoria_id,
      COALESCE(SUM(l.valor), 0.00) AS total_efetivado
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status_pagamento != 'cancelado'
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND (l.status_pagamento = 'pago' OR l.meio_pagamento_tipo = 'CARTAO')
      AND l.data >= v_data_inicio_ant
      AND l.data <= v_data_fim_ant
    GROUP BY l.subcategoria_id, l.categoria_id
  ),
  limites_atual AS (
    SELECT
      ol.subcategoria_id,
      ol.limite_definido
    FROM public.orcamento_limites ol
    WHERE ol.workspace_id = p_workspace_id
      AND ol.competencia = p_competencia
  ),
  subcats_dados AS (
    SELECT
      s.id AS subcategoria_id,
      s.categoria_id,
      s.nome AS subcategoria_nome,
      COALESCE(la.limite_definido, 0.00) AS limite_definido,
      COALESCE(ga.total_efetivado, 0.00) AS valor_efetivado,
      COALESCE(gant.total_efetivado, 0.00) AS gasto_periodo_anterior
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id
    LEFT JOIN limites_atual la ON la.subcategoria_id = s.id
    LEFT JOIN gastos_atual ga ON ga.subcategoria_id = s.id
    LEFT JOIN gastos_anterior gant ON gant.subcategoria_id = s.id
    WHERE s.workspace_id = p_workspace_id
      AND s.deleted_at IS NULL
      AND c.tipo = 'despesa'
      AND c.deleted_at IS NULL
    ORDER BY s.nome ASC
  ),
  cats_agrupadas AS (
    SELECT
      c.id AS categoria_id,
      c.nome AS categoria_nome,
      c.cor AS categoria_cor,
      c.icone AS categoria_icone,
      COALESCE(SUM(sd.limite_definido), 0.00) AS limite_definido,
      COALESCE(SUM(sd.valor_efetivado), 0.00) AS valor_efetivado,
      COALESCE(SUM(sd.gasto_periodo_anterior), 0.00) AS gasto_periodo_anterior,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', sd.subcategoria_id,
            'nome', sd.subcategoria_nome,
            'limite_definido', sd.limite_definido,
            'valor_efetivado', sd.valor_efetivado,
            'gasto_periodo_anterior', sd.gasto_periodo_anterior
          )
          ORDER BY sd.subcategoria_nome ASC
        ) FILTER (WHERE sd.subcategoria_id IS NOT NULL),
        '[]'::jsonb
      ) AS subcategorias
    FROM public.categorias c
    LEFT JOIN subcats_dados sd ON sd.categoria_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND c.tipo = 'despesa'
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.nome, c.cor, c.icone
    ORDER BY c.nome ASC
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ca.categoria_id,
        'nome', ca.categoria_nome,
        'cor', ca.categoria_cor,
        'icone', ca.categoria_icone,
        'limite_definido', ca.limite_definido,
        'valor_efetivado', ca.valor_efetivado,
        'gasto_periodo_anterior', ca.gasto_periodo_anterior,
        'subcategorias', ca.subcategorias
      )
      ORDER BY ca.categoria_nome ASC
    ), '[]'::jsonb),
    COALESCE(SUM(ca.valor_efetivado), 0.00),
    COALESCE(SUM(ca.limite_definido), 0.00)
  INTO v_categorias_json, v_total_efetivado, v_total_limite
  FROM cats_agrupadas ca;

  RETURN jsonb_build_object(
    'competencia', p_competencia,
    'competencia_anterior', v_comp_anterior,
    'tem_limites', v_tem_limites,
    'tem_limites_anterior', v_tem_limites_anterior,
    'despesas_efetivado', v_total_efetivado,
    'despesas_limite', v_total_limite,
    'categorias', COALESCE(v_categorias_json, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.obter_orcamento_consolidado_rpc(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_orcamento_consolidado_rpc(UUID, TEXT) TO service_role;


-- ============================================================================
-- RPC 4: listar_lancamentos_periodo_anterior_rpc
-- Retorna os lançamentos do período anterior para modal dos 3 pontinhos.
-- Filtra por categoria_id e opcionalmente subcategoria_id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listar_lancamentos_periodo_anterior_rpc(
  p_workspace_id UUID,
  p_competencia TEXT, -- Competência ATUAL (o RPC busca a ANTERIOR)
  p_categoria_id UUID DEFAULT NULL,
  p_subcategoria_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano INT;
  v_mes INT;
  v_data_inicio DATE;
  v_data_inicio_ant DATE;
  v_data_fim_ant DATE;
  v_comp_anterior TEXT;
  v_lancs_json JSONB;
  v_total NUMERIC := 0.00;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Workspace e competência são obrigatórios.';
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;
  v_data_inicio := make_date(v_ano, v_mes, 1);

  -- Período anterior
  v_data_inicio_ant := (v_data_inicio - interval '1 month')::DATE;
  v_data_fim_ant := (v_data_inicio - interval '1 day')::DATE;
  v_comp_anterior := to_char(v_data_inicio_ant, 'YYYY-MM');

  WITH lancs_selecionados AS (
    SELECT
      l.id,
      l.data,
      l.descricao,
      l.valor,
      l.tipo,
      l.status_pagamento,
      l.meio_pagamento_tipo,
      c.nome AS categoria_nome,
      s.nome AS subcategoria_nome,
      co.nome AS conta_nome,
      cr.nome AS cartao_nome
    FROM public.lancamentos l
    LEFT JOIN public.categorias c ON c.id = l.categoria_id
    LEFT JOIN public.subcategorias s ON s.id = l.subcategoria_id
    LEFT JOIN public.contas co ON co.id = l.conta_origem_id
    LEFT JOIN public.cartoes cr ON cr.id = l.cartao_id
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status_pagamento != 'cancelado'
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND (l.status_pagamento = 'pago' OR l.meio_pagamento_tipo = 'CARTAO')
      AND l.data >= v_data_inicio_ant
      AND l.data <= v_data_fim_ant
      AND (p_categoria_id IS NULL OR l.categoria_id = p_categoria_id)
      AND (p_subcategoria_id IS NULL OR l.subcategoria_id = p_subcategoria_id)
    ORDER BY l.data DESC, l.created_at DESC
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ls.id,
        'data', ls.data,
        'descricao', ls.descricao,
        'valor', ls.valor,
        'tipo', ls.tipo,
        'status_pagamento', ls.status_pagamento,
        'meio_pagamento_tipo', ls.meio_pagamento_tipo,
        'categoria_nome', ls.categoria_nome,
        'subcategoria_nome', ls.subcategoria_nome,
        'conta_nome', ls.conta_nome,
        'cartao_nome', ls.cartao_nome
      )
    ), '[]'::jsonb),
    COALESCE(SUM(ls.valor), 0.00)
  INTO v_lancs_json, v_total
  FROM lancs_selecionados ls;

  RETURN jsonb_build_object(
    'competencia_anterior', v_comp_anterior,
    'data_inicio', v_data_inicio_ant,
    'data_fim', v_data_fim_ant,
    'total', v_total,
    'lancamentos', COALESCE(v_lancs_json, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_lancamentos_periodo_anterior_rpc(UUID, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_lancamentos_periodo_anterior_rpc(UUID, TEXT, UUID, UUID) TO service_role;
