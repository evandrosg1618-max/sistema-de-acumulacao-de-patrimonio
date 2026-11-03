-- Migration: Eliminar temp tables de obter_orcamento_consolidado_rpc para permitir execução em read-only e otimizar agregações CTE
CREATE OR REPLACE FUNCTION public.obter_orcamento_consolidado_rpc(
  p_workspace_id uuid,
  p_competencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano INT;
  v_mes INT;
  v_comp_anterior TEXT;
  v_ano_ant INT;
  v_mes_ant INT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_data_inicio_ant DATE;
  v_data_fim_ant DATE;
  v_tem_limites BOOLEAN := false;
  v_tem_limites_anterior BOOLEAN := false;
  v_total_efetivado NUMERIC := 0.00;
  v_total_limite NUMERIC := 0.00;
  v_categorias_json JSONB := '[]'::jsonb;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RETURN jsonb_build_object(
      'competencia', p_competencia,
      'competencia_anterior', '',
      'tem_limites', false,
      'tem_limites_anterior', false,
      'despesas_efetivado', 0.00,
      'despesas_limite', 0.00,
      'categorias', '[]'::jsonb
    );
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;
  v_data_inicio := make_date(v_ano, v_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month - 1 day')::date;

  -- Calcular competência anterior e suas datas
  IF v_mes = 1 THEN
    v_ano_ant := v_ano - 1;
    v_mes_ant := 12;
  ELSE
    v_ano_ant := v_ano;
    v_mes_ant := v_mes - 1;
  END IF;
  v_comp_anterior := v_ano_ant || '-' || lpad(v_mes_ant::text, 2, '0');
  v_data_inicio_ant := make_date(v_ano_ant, v_mes_ant, 1);
  v_data_fim_ant := (v_data_inicio_ant + interval '1 month - 1 day')::date;

  -- Verificar limites
  SELECT EXISTS(
    SELECT 1 FROM public.orcamento_limites
    WHERE workspace_id = p_workspace_id
      AND competencia = p_competencia
      AND limite_definido > 0
  ) INTO v_tem_limites;

  SELECT EXISTS(
    SELECT 1 FROM public.orcamento_limites
    WHERE workspace_id = p_workspace_id
      AND competencia = v_comp_anterior
      AND limite_definido > 0
  ) INTO v_tem_limites_anterior;

  -- Total limites definidos
  SELECT COALESCE(SUM(limite_definido), 0.00) INTO v_total_limite
  FROM public.orcamento_limites
  WHERE workspace_id = p_workspace_id
    AND competencia = p_competencia;

  -- Montagem CTE das agregações de gastos e categorias/subcategorias
  WITH cte_gastos_atual AS (
    SELECT
      l.subcategoria_id,
      COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00) as gasto
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status_pagamento != 'cancelado'
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND COALESCE(l.afeta_orcamento, true) = true
      AND COALESCE(l.valor_proprio, l.valor) > 0
      AND l.data >= v_data_inicio
      AND l.data <= v_data_fim
    GROUP BY l.subcategoria_id
  ),
  cte_gastos_anterior AS (
    SELECT
      l.subcategoria_id,
      COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00) as gasto
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status_pagamento != 'cancelado'
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND COALESCE(l.afeta_orcamento, true) = true
      AND COALESCE(l.valor_proprio, l.valor) > 0
      AND l.data >= v_data_inicio_ant
      AND l.data <= v_data_fim_ant
    GROUP BY l.subcategoria_id
  ),
  cte_recorrentes_periodo AS (
    SELECT
      l.subcategoria_id,
      COALESCE(AVG(COALESCE(l.valor_proprio, l.valor)), 0.00) as valor_recorrente
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status_pagamento != 'cancelado'
      AND l.serie_id IS NOT NULL
      AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
      AND COALESCE(l.afeta_orcamento, true) = true
      AND l.data >= v_data_inicio
      AND l.data <= v_data_fim
    GROUP BY l.subcategoria_id
  ),
  subcat_calc AS (
    SELECT
      s.id,
      s.categoria_id,
      s.nome,
      s.classificacao,
      s.natureza,
      COALESCE(ol.limite_definido, 0.00) as limite_definido,
      COALESCE(ga.gasto, 0.00) as valor_efetivado,
      COALESCE(gant.gasto, 0.00) as gasto_periodo_anterior,
      COALESCE(rec.valor_recorrente, 0.00) as valor_recorrente_periodo
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id AND c.tipo = 'despesa'
    LEFT JOIN public.orcamento_limites ol ON ol.subcategoria_id = s.id AND ol.competencia = p_competencia AND ol.workspace_id = p_workspace_id
    LEFT JOIN cte_gastos_atual ga ON ga.subcategoria_id = s.id
    LEFT JOIN cte_gastos_anterior gant ON gant.subcategoria_id = s.id
    LEFT JOIN cte_recorrentes_periodo rec ON rec.subcategoria_id = s.id
    WHERE s.workspace_id = p_workspace_id
      AND s.ativo = true
      AND s.deleted_at IS NULL
      AND (s.arquivado = false OR ol.limite_definido > 0 OR ga.gasto > 0)
    ORDER BY s.nome ASC
  ),
  cat_agg AS (
    SELECT
      c.id,
      c.nome,
      c.cor,
      c.icone,
      COALESCE(SUM(sc.limite_definido), 0.00) as limite_definido,
      COALESCE(SUM(sc.valor_efetivado), 0.00) as valor_efetivado,
      COALESCE(SUM(sc.gasto_periodo_anterior), 0.00) as gasto_periodo_anterior,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', sc.id,
            'nome', sc.nome,
            'classificacao', sc.classificacao,
            'natureza', sc.natureza,
            'limite_definido', sc.limite_definido,
            'valor_efetivado', sc.valor_efetivado,
            'gasto_periodo_anterior', sc.gasto_periodo_anterior,
            'valor_recorrente_periodo', sc.valor_recorrente_periodo
          ) ORDER BY sc.nome ASC
        ) FILTER (WHERE sc.id IS NOT NULL),
        '[]'::jsonb
      ) as subcategorias
    FROM public.categorias c
    LEFT JOIN subcat_calc sc ON sc.categoria_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND c.tipo = 'despesa'
      AND c.ativo = true
      AND c.deleted_at IS NULL
      AND (c.arquivado = false OR EXISTS (SELECT 1 FROM subcat_calc sc2 WHERE sc2.categoria_id = c.id AND (sc2.limite_definido > 0 OR sc2.valor_efetivado > 0)))
    GROUP BY c.id, c.nome, c.cor, c.icone
    ORDER BY c.nome ASC
  )
  SELECT
    COALESCE(SUM(sc_total.valor_efetivado), 0.00),
    jsonb_agg(
      jsonb_build_object(
        'id', ca.id,
        'nome', ca.nome,
        'cor', ca.cor,
        'icone', ca.icone,
        'limite_definido', ca.limite_definido,
        'valor_efetivado', ca.valor_efetivado,
        'gasto_periodo_anterior', ca.gasto_periodo_anterior,
        'subcategorias', ca.subcategorias
      ) ORDER BY ca.nome ASC
    )
  INTO v_total_efetivado, v_categorias_json
  FROM cat_agg ca
  LEFT JOIN subcat_calc sc_total ON true;

  -- Recomputa o total efetivado exato do mês pelo sum dos gastos
  SELECT COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00)
  INTO v_total_efetivado
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_orcamento, true) = true
    AND COALESCE(l.valor_proprio, l.valor) > 0
    AND l.data >= v_data_inicio
    AND l.data <= v_data_fim;

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

GRANT EXECUTE ON FUNCTION public.obter_orcamento_consolidado_rpc(uuid, text) TO authenticated, service_role;
