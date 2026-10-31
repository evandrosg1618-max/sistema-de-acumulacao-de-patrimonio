-- ============================================================================
-- SAP — Migração: Meta de Poupança e Validações Atômicas de Contas e Cartões
-- ============================================================================

-- 1. Tabela orcamento_metas_poupanca (salva meta e percentual de poupança mínima por competência)
CREATE TABLE IF NOT EXISTS public.orcamento_metas_poupanca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
  meta_poupanca NUMERIC(15, 2) DEFAULT NULL, -- NULL quando não definida
  percentual_minimo NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  subcategorias_selecionadas JSONB DEFAULT '[]'::jsonb, -- lista de UUIDs de subcategorias selecionadas
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT orcamento_metas_poupanca_workspace_competencia_key UNIQUE (workspace_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_metas_poupanca_lookup
  ON public.orcamento_metas_poupanca(workspace_id, competencia);

ALTER TABLE public.orcamento_metas_poupanca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver metas de poupanca do workspace"
  ON public.orcamento_metas_poupanca
  FOR SELECT
  USING (is_member_of_workspace(workspace_id));

CREATE POLICY "Membros podem inserir metas de poupanca no workspace"
  ON public.orcamento_metas_poupanca
  FOR INSERT
  WITH CHECK (is_member_of_workspace(workspace_id));

CREATE POLICY "Membros podem atualizar metas de poupanca no workspace"
  ON public.orcamento_metas_poupanca
  FOR UPDATE
  USING (is_member_of_workspace(workspace_id))
  WITH CHECK (is_member_of_workspace(workspace_id));

CREATE POLICY "Membros podem deletar metas de poupanca no workspace"
  ON public.orcamento_metas_poupanca
  FOR DELETE
  USING (is_member_of_workspace(workspace_id));

-- 2. RPC gravar_meta_poupanca_rpc (atômica e idempotente com SELECT FOR UPDATE)
CREATE OR REPLACE FUNCTION public.gravar_meta_poupanca_rpc(
  p_workspace_id UUID,
  p_competencia TEXT,
  p_meta_poupanca NUMERIC DEFAULT NULL,
  p_percentual_minimo NUMERIC DEFAULT 10.00,
  p_subcategorias_selecionadas JSONB DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_rec public.orcamento_metas_poupanca%ROWTYPE;
  v_meta NUMERIC(15, 2);
  v_perc NUMERIC(5, 2);
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Workspace e competência são obrigatórios.';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NOT NULL AND NOT is_member_of_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Usuário não tem permissão neste workspace.';
  END IF;

  v_meta := p_meta_poupanca;
  v_perc := COALESCE(p_percentual_minimo, 10.00);

  -- SELECT FOR UPDATE para garantir atomicidade
  SELECT * INTO v_rec
  FROM public.orcamento_metas_poupanca
  WHERE workspace_id = p_workspace_id
    AND competencia = p_competencia
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.orcamento_metas_poupanca
    SET meta_poupanca = v_meta,
        percentual_minimo = v_perc,
        subcategorias_selecionadas = COALESCE(p_subcategorias_selecionadas, v_rec.subcategorias_selecionadas),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_rec.id
    RETURNING * INTO v_rec;
  ELSE
    INSERT INTO public.orcamento_metas_poupanca (
      workspace_id,
      competencia,
      meta_poupanca,
      percentual_minimo,
      subcategorias_selecionadas,
      created_by
    ) VALUES (
      p_workspace_id,
      p_competencia,
      v_meta,
      v_perc,
      COALESCE(p_subcategorias_selecionadas, '[]'::jsonb),
      v_user_id
    )
    RETURNING * INTO v_rec;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'id', v_rec.id,
    'workspace_id', v_rec.workspace_id,
    'competencia', v_rec.competencia,
    'meta_poupanca', v_rec.meta_poupanca,
    'percentual_minimo', v_rec.percentual_minimo,
    'subcategorias_selecionadas', v_rec.subcategorias_selecionadas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gravar_meta_poupanca_rpc(UUID, TEXT, NUMERIC, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_meta_poupanca_rpc(UUID, TEXT, NUMERIC, NUMERIC, JSONB, UUID) TO service_role;

-- 3. RPC calcular_meta_poupanca_rpc
-- Realiza os 10 passos do requisito 9.7:
-- 1) Identificar competência;
-- 2) Buscar receitas selecionadas (se não informadas, usar Salário por padrão);
-- 3) Considerar somente receitas efetivadas (status_pagamento = 'pago');
-- 4) Calcular Renda Considerada;
-- 5) Calcular Poupança Mínima (SALARIO_EFETIVADO * percentual);
-- 6) Recuperar Orçamento Total de Despesas (soma de orcamento_limites da competência);
-- 7) Calcular Capacidade = RENDA_CONSIDERADA - ORCAMENTO_TOTAL_DESPESAS;
-- 8) Verificar primeiro se orçamento > renda (prioritário);
-- 9) Caso contrário, comparar Capacidade x Meta;
-- 10) Retornar dados e status correspondente.
CREATE OR REPLACE FUNCTION public.calcular_meta_poupanca_rpc(
  p_workspace_id UUID,
  p_competencia TEXT,
  p_subcategorias_ids UUID[] DEFAULT NULL,
  p_percentual_minimo NUMERIC DEFAULT NULL
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
  v_meta_rec public.orcamento_metas_poupanca%ROWTYPE;
  v_subcats_efetivas UUID[];
  v_salario_subcat_id UUID;
  v_percentual NUMERIC := 10.00;
  v_meta NUMERIC := NULL;
  v_salario_efetivado NUMERIC := 0.00;
  v_renda_considerada NUMERIC := 0.00;
  v_poupanca_minima NUMERIC := 0.00;
  v_orcamento_total NUMERIC := 0.00;
  v_capacidade NUMERIC := 0.00;
  v_situacao TEXT;
  v_titulo_status TEXT;
  v_mensagem_status TEXT;
  v_cor_status TEXT; -- 'verde', 'azul', 'laranja', 'vermelho'
  v_diferenca NUMERIC := 0.00;
  v_receitas_disponiveis JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Workspace e competência são obrigatórios.';
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;
  v_data_inicio := make_date(v_ano, v_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month' - interval '1 day')::DATE;

  -- Localiza a subcategoria de "Salário" no workspace
  SELECT s.id INTO v_salario_subcat_id
  FROM public.subcategorias s
  JOIN public.categorias c ON c.id = s.categoria_id
  WHERE s.workspace_id = p_workspace_id
    AND s.deleted_at IS NULL
    AND c.tipo = 'receita'
    AND unaccent(lower(s.nome)) = 'salario'
  LIMIT 1;

  -- Se não achar por nome exato 'salario', busca por substring
  IF v_salario_subcat_id IS NULL THEN
    SELECT s.id INTO v_salario_subcat_id
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id
    WHERE s.workspace_id = p_workspace_id
      AND s.deleted_at IS NULL
      AND c.tipo = 'receita'
      AND unaccent(lower(s.nome)) LIKE '%salario%'
    LIMIT 1;
  END IF;

  -- Buscar dados gravados para a competência
  SELECT * INTO v_meta_rec
  FROM public.orcamento_metas_poupanca
  WHERE workspace_id = p_workspace_id
    AND competencia = p_competencia;

  IF FOUND THEN
    v_meta := v_meta_rec.meta_poupanca;
    v_percentual := COALESCE(p_percentual_minimo, v_meta_rec.percentual_minimo, 10.00);
  ELSE
    v_percentual := COALESCE(p_percentual_minimo, 10.00);
  END IF;

  -- Determinar subcategorias selecionadas
  IF p_subcategorias_ids IS NOT NULL AND array_length(p_subcategorias_ids, 1) > 0 THEN
    v_subcats_efetivas := p_subcategorias_ids;
  ELSIF FOUND AND v_meta_rec.subcategorias_selecionadas IS NOT NULL AND jsonb_array_length(v_meta_rec.subcategorias_selecionadas) > 0 THEN
    SELECT array_agg(value::text::uuid)
    INTO v_subcats_efetivas
    FROM jsonb_array_elements_text(v_meta_rec.subcategorias_selecionadas);
  ELSE
    -- Padrão: somente Salário
    IF v_salario_subcat_id IS NOT NULL THEN
      v_subcats_efetivas := ARRAY[v_salario_subcat_id];
    ELSE
      v_subcats_efetivas := ARRAY[]::UUID[];
    END IF;
  END IF;

  -- 1) Buscar Salário efetivamente recebido na competência (status_pagamento = 'pago')
  IF v_salario_subcat_id IS NOT NULL THEN
    SELECT COALESCE(SUM(valor), 0.00)
    INTO v_salario_efetivado
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND tipo = 'receita'
      AND status_pagamento = 'pago'
      AND subcategoria_id = v_salario_subcat_id
      AND (
        competencia = p_competencia
        OR (competencia IS NULL AND data >= v_data_inicio AND data <= v_data_fim)
      );
  END IF;

  -- 2) Renda Considerada = soma das receitas SELECIONADAS e EFETIVADAS (status_pagamento = 'pago')
  IF v_subcats_efetivas IS NOT NULL AND array_length(v_subcats_efetivas, 1) > 0 THEN
    SELECT COALESCE(SUM(valor), 0.00)
    INTO v_renda_considerada
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND tipo = 'receita'
      AND status_pagamento = 'pago'
      AND subcategoria_id = ANY(v_subcats_efetivas)
      AND (
        competencia = p_competencia
        OR (competencia IS NULL AND data >= v_data_inicio AND data <= v_data_fim)
      );
  ELSE
    v_renda_considerada := 0.00;
  END IF;

  -- 3) Poupança Mínima = SALARIO_EFETIVADO * (percentual / 100)
  -- Se não houver salário efetivado, NÃO calcular artificialmente sobre previstos (resultado 0.00)
  IF v_salario_efetivado > 0 THEN
    v_poupanca_minima := ROUND(v_salario_efetivado * (v_percentual / 100.0), 2);
  ELSE
    v_poupanca_minima := 0.00;
  END IF;

  -- 4) Orçamento Total de Despesas (soma dos limites definidos na competência atual)
  SELECT COALESCE(SUM(limite_definido), 0.00)
  INTO v_orcamento_total
  FROM public.orcamento_limites
  WHERE workspace_id = p_workspace_id
    AND competencia = p_competencia;

  -- 5) Capacidade de Poupança = RENDA_CONSIDERADA - ORCAMENTO_TOTAL_DESPESAS
  v_capacidade := v_renda_considerada - v_orcamento_total;

  -- 6) Status e Comparação conforme 9.5 e 9.6
  -- Regra 9.6 (Prioritária): Orçamento superior à renda
  IF v_orcamento_total > v_renda_considerada THEN
    v_situacao := 'orcamento_excedente';
    v_cor_status := 'vermelho';
    v_diferenca := v_orcamento_total - v_renda_considerada;
    v_titulo_status := 'Orçamento excedente: R$ ' || to_char(v_diferenca, 'FM999G999G990D00');
    v_mensagem_status := 'O orçamento planejado supera a renda considerada em R$ ' ||
      to_char(v_diferenca, 'FM999G999G990D00') || ' antes mesmo da formação da poupança.';

  -- Regra 9.3: Se não houver meta cadastrada (meta is NULL)
  ELSIF v_meta IS NULL THEN
    v_situacao := 'sem_meta';
    v_cor_status := 'azul';
    v_diferenca := 0.00;
    v_titulo_status := 'Defina uma Meta de Poupança';
    v_mensagem_status := 'Defina uma Meta de Poupança para comparar com a capacidade do orçamento.';

  -- Regra 9.5 A: Capacidade < Meta
  ELSIF v_capacidade < v_meta THEN
    v_situacao := 'capacidade_menor_meta';
    v_cor_status := 'laranja';
    v_diferenca := v_meta - v_capacidade;
    v_titulo_status := 'Ajuste necessário no orçamento: R$ ' || to_char(v_diferenca, 'FM999G999G990D00');
    v_mensagem_status := 'Para atingir a Meta de Poupança, será necessário reduzir R$ ' ||
      to_char(v_diferenca, 'FM999G999G990D00') || ' do orçamento planejado.';

  -- Regra 9.5 B: Capacidade = Meta
  ELSIF v_capacidade = v_meta THEN
    v_situacao := 'capacidade_igual_meta';
    v_cor_status := 'azul';
    v_diferenca := 0.00;
    v_titulo_status := 'Meta compatível com o orçamento';
    v_mensagem_status := 'O orçamento planejado permite atingir exatamente a Meta de Poupança estabelecida.';

  -- Regra 9.5 C: Capacidade > Meta
  ELSE
    v_situacao := 'capacidade_maior_meta';
    v_cor_status := 'verde';
    v_diferenca := v_capacidade - v_meta;
    v_titulo_status := 'Potencial acima da meta: R$ ' || to_char(v_diferenca, 'FM999G999G990D00');
    v_mensagem_status := 'Seu orçamento permite uma poupança de até R$ ' ||
      to_char(v_capacidade, 'FM999G999G990D00') || ', correspondente ao valor da Capacidade de Poupança.';
  END IF;

  -- Lista de todas as subcategorias de receita para o seletor visual
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'nome', s.nome,
        'categoria_id', s.categoria_id,
        'categoria_nome', c.nome,
        'icone', c.icone,
        'cor', c.cor,
        'is_salario', (s.id = v_salario_subcat_id),
        'selecionada', (s.id = ANY(COALESCE(v_subcats_efetivas, ARRAY[]::UUID[]))),
        'total_efetivado', COALESCE(ef.total, 0.00)
      )
      ORDER BY (s.id = v_salario_subcat_id) DESC, s.nome ASC
    ),
    '[]'::jsonb
  )
  INTO v_receitas_disponiveis
  FROM public.subcategorias s
  JOIN public.categorias c ON c.id = s.categoria_id
  LEFT JOIN (
    SELECT subcategoria_id, SUM(valor) as total
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND tipo = 'receita'
      AND status_pagamento = 'pago'
      AND (
        competencia = p_competencia
        OR (competencia IS NULL AND data >= v_data_inicio AND data <= v_data_fim)
      )
    GROUP BY subcategoria_id
  ) ef ON ef.subcategoria_id = s.id
  WHERE s.workspace_id = p_workspace_id
    AND s.deleted_at IS NULL
    AND c.tipo = 'receita'
    AND c.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'competencia', p_competencia,
    'renda_considerada', v_renda_considerada,
    'salario_subcategoria_id', v_salario_subcat_id,
    'salario_efetivado', v_salario_efetivado,
    'poupanca_minima', v_poupanca_minima,
    'percentual_minimo', v_percentual,
    'meta_poupanca', v_meta,
    'orcamento_total_despesas', v_orcamento_total,
    'capacidade_poupanca', v_capacidade,
    'situacao', v_situacao,
    'status_cor', v_cor_status,
    'status_titulo', v_titulo_status,
    'status_mensagem', v_mensagem_status,
    'status_diferenca', v_diferenca,
    'subcategorias_selecionadas_ids', COALESCE(v_subcats_efetivas, ARRAY[]::UUID[]),
    'receitas_disponiveis', v_receitas_disponiveis
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_meta_poupanca_rpc(UUID, TEXT, UUID[], NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_meta_poupanca_rpc(UUID, TEXT, UUID[], NUMERIC) TO service_role;

-- 4. Atualização da RPC obter_orcamento_consolidado_rpc para incluir:
-- a) classificacao e natureza em cada subcategoria;
-- b) valor recorrente fixo previsto (independente de efetivado) da subcategoria para pré-preenchimento no limite (requisito 9.11).
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
      AND (
        l.competencia = p_competencia
        OR (l.competencia IS NULL AND l.data >= v_data_inicio AND l.data <= v_data_fim)
      )
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
      AND (
        l.competencia = v_comp_anterior
        OR (l.competencia IS NULL AND l.data >= v_data_inicio_ant AND l.data <= v_data_fim_ant)
      )
    GROUP BY l.subcategoria_id, l.categoria_id
  ),
  -- Requisito 9.11: Lançamentos recorrentes da subcategoria no período selecionado (independente de efetivado)
  recorrentes_atual AS (
    SELECT
      l.subcategoria_id,
      COALESCE(SUM(l.valor), 0.00) AS total_recorrente
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.regime = 'fixo'
      AND l.status_pagamento != 'cancelado'
      AND (
        l.competencia = p_competencia
        OR (l.competencia IS NULL AND l.data >= v_data_inicio AND l.data <= v_data_fim)
      )
    GROUP BY l.subcategoria_id
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
      s.classificacao,
      s.natureza,
      COALESCE(la.limite_definido, 0.00) AS limite_definido,
      COALESCE(ga.total_efetivado, 0.00) AS valor_efetivado,
      COALESCE(gant.total_efetivado, 0.00) AS gasto_periodo_anterior,
      COALESCE(rec.total_recorrente, 0.00) AS valor_recorrente_periodo
    FROM public.subcategorias s
    JOIN public.categorias c ON c.id = s.categoria_id
    LEFT JOIN limites_atual la ON la.subcategoria_id = s.id
    LEFT JOIN gastos_atual ga ON ga.subcategoria_id = s.id
    LEFT JOIN gastos_anterior gant ON gant.subcategoria_id = s.id
    LEFT JOIN recorrentes_atual rec ON rec.subcategoria_id = s.id
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
            'classificacao', sd.classificacao,
            'natureza', sd.natureza,
            'limite_definido', sd.limite_definido,
            'valor_efetivado', sd.valor_efetivado,
            'gasto_periodo_anterior', sd.gasto_periodo_anterior,
            'valor_recorrente_periodo', sd.valor_recorrente_periodo
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

-- 5. RPC verificar_pode_excluir_conta_rpc (validação de integridade atômica no banco)
-- Requisito 6.2: Bloquear exclusão se houver qualquer movimentação efetivada na conta (entrada ou saída efetiva)
CREATE OR REPLACE FUNCTION public.verificar_pode_excluir_conta_rpc(
  p_workspace_id UUID,
  p_conta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qtd_efetivados INT := 0;
  v_qtd_movimentacoes INT := 0;
  v_qtd_pagamentos_fatura INT := 0;
  v_qtd_conciliacoes INT := 0;
  v_pode_excluir BOOLEAN := TRUE;
  v_motivo TEXT := NULL;
BEGIN
  IF p_workspace_id IS NULL OR p_conta_id IS NULL THEN
    RAISE EXCEPTION 'Workspace e conta são obrigatórios.';
  END IF;

  -- Verifica lançamentos efetivados vinculados à conta como origem ou destino
  SELECT COUNT(*) INTO v_qtd_efetivados
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND status_pagamento = 'pago'
    AND (conta_origem_id = p_conta_id OR conta_destino_id = p_conta_id);

  -- Verifica movimentações bancárias efetivadas
  SELECT COUNT(*) INTO v_qtd_movimentacoes
  FROM public.movimentacoes_conta
  WHERE workspace_id = p_workspace_id
    AND conta_id = p_conta_id;

  -- Verifica pagamentos de fatura pagos por esta conta
  SELECT COUNT(*) INTO v_qtd_pagamentos_fatura
  FROM public.pagamentos_fatura
  WHERE workspace_id = p_workspace_id
    AND conta_origem_id = p_conta_id;

  -- Verifica conciliações já salvas
  SELECT COUNT(*) INTO v_qtd_conciliacoes
  FROM public.conciliacoes_conta
  WHERE workspace_id = p_workspace_id
    AND conta_id = p_conta_id;

  IF (v_qtd_efetivados > 0 OR v_qtd_movimentacoes > 0 OR v_qtd_pagamentos_fatura > 0 OR v_qtd_conciliacoes > 0) THEN
    v_pode_excluir := FALSE;
    v_motivo := 'Esta conta possui movimentações efetivadas e não pode ser excluída para preservar o histórico. Você pode arquivá-la e desarquivá-la quando desejar.';
  END IF;

  RETURN jsonb_build_object(
    'pode_excluir', v_pode_excluir,
    'motivo', v_motivo,
    'total_efetivados', (v_qtd_efetivados + v_qtd_movimentacoes + v_qtd_pagamentos_fatura)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_pode_excluir_conta_rpc(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_pode_excluir_conta_rpc(UUID, UUID) TO service_role;

-- 6. RPC verificar_pode_desativar_cartao_rpc (validação de integridade atômica no banco)
-- Requisito 7.2: Bloquear desativação de cartão caso haja:
-- - comprometimento futuro (faturas futuras com compras ou parcelas pendentes)
-- - faturas não pagas
-- - lançamentos recorrentes futuros vinculados ao cartão
CREATE OR REPLACE FUNCTION public.verificar_pode_desativar_cartao_rpc(
  p_workspace_id UUID,
  p_cartao_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_faturas_nao_pagas INT := 0;
  v_recorrentes_futuros INT := 0;
  v_parcelas_futuras INT := 0;
  v_pode_desativar BOOLEAN := TRUE;
  v_motivos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_workspace_id IS NULL OR p_cartao_id IS NULL THEN
    RAISE EXCEPTION 'Workspace e cartão são obrigatórios.';
  END IF;

  -- 1) Faturas não pagas (abertas ou fechadas com saldo devedor)
  SELECT COUNT(*) INTO v_faturas_nao_pagas
  FROM public.faturas
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND status IN ('aberta', 'fechada')
    AND valor_total > 0;

  IF v_faturas_nao_pagas > 0 THEN
    v_pode_desativar := FALSE;
    v_motivos := array_append(v_motivos, 'Existem faturas abertas ou fechadas pendentes de pagamento para este cartão.');
  END IF;

  -- 2) Lançamentos recorrentes futuros ativos vinculados a este cartão
  SELECT COUNT(*) INTO v_recorrentes_futuros
  FROM public.series_lancamentos
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND status = 'ativo';

  IF v_recorrentes_futuros = 0 THEN
    -- Ou lançamentos fixos pendentes
    SELECT COUNT(*) INTO v_recorrentes_futuros
    FROM public.lancamentos
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND regime = 'fixo'
      AND status_pagamento = 'pendente'
      AND deleted_at IS NULL;
  END IF;

  IF v_recorrentes_futuros > 0 THEN
    v_pode_desativar := FALSE;
    v_motivos := array_append(v_motivos, 'Existem despesas recorrentes ativas vinculadas a este cartão.');
  END IF;

  -- 3) Parcelas futuras pendentes vinculadas a este cartão
  SELECT COUNT(*) INTO v_parcelas_futuras
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND regime = 'parcelado'
    AND status_pagamento = 'pendente'
    AND deleted_at IS NULL;

  IF v_parcelas_futuras > 0 THEN
    v_pode_desativar := FALSE;
    v_motivos := array_append(v_motivos, 'Há compras parceladas com comprometimento futuro ainda não quitadas neste cartão.');
  END IF;

  RETURN jsonb_build_object(
    'pode_desativar', v_pode_desativar,
    'motivos', v_motivos,
    'faturas_nao_pagas', v_faturas_nao_pagas,
    'recorrentes_futuros', v_recorrentes_futuros,
    'parcelas_futuras', v_parcelas_futuras
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_pode_desativar_cartao_rpc(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_pode_desativar_cartao_rpc(UUID, UUID) TO service_role;
