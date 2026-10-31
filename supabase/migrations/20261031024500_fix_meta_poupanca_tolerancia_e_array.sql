-- Migration: Correção de gravação e cálculo tolerante da Meta de Poupança (Bloco C)
-- 1. Normalizar linha corrompida existente na competência '2026-10' (jsonb array real)
-- 2. Atualizar gravar_meta_poupanca_rpc para normalizar e garantir array jsonb real
-- 3. Atualizar calcular_meta_poupanca_rpc para tolerar formato string legado, array ou null

-- Passo 1: Reparo dos dados existentes (preserva meta, percentual 15% e subcategorias)
UPDATE public.orcamento_metas_poupanca
SET subcategorias_selecionadas = CASE
  WHEN jsonb_typeof(subcategorias_selecionadas) = 'string' THEN
    (subcategorias_selecionadas #>> '{}')::jsonb
  ELSE
    COALESCE(subcategorias_selecionadas, '[]'::jsonb)
END,
updated_at = timezone('utc'::text, now())
WHERE jsonb_typeof(subcategorias_selecionadas) = 'string';

-- Passo 2: RPC gravar_meta_poupanca_rpc com validação e normalização estrita de jsonb array
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
  v_subcats_norm JSONB := '[]'::jsonb;
  v_eh_membro BOOLEAN := FALSE;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Workspace e competência são obrigatórios.';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Se houver um v_user_id, checa se ele é membro ativo do workspace
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = p_workspace_id
        AND user_id = v_user_id
        AND status = 'ativo'
    ) INTO v_eh_membro;

    IF NOT v_eh_membro THEN
      -- Checa se é o dono do workspace
      SELECT EXISTS (
        SELECT 1 FROM public.workspaces
        WHERE id = p_workspace_id
          AND owner_user_id = v_user_id
      ) INTO v_eh_membro;
    END IF;

    IF NOT v_eh_membro THEN
      RAISE EXCEPTION 'Usuário não tem permissão neste workspace.';
    END IF;
  END IF;

  v_meta := p_meta_poupanca;
  v_perc := COALESCE(p_percentual_minimo, 10.00);

  -- Normalização de p_subcategorias_selecionadas para garantir SEMPRE jsonb array real
  IF p_subcategorias_selecionadas IS NOT NULL THEN
    IF jsonb_typeof(p_subcategorias_selecionadas) = 'string' THEN
      BEGIN
        v_subcats_norm := (p_subcategorias_selecionadas #>> '{}')::jsonb;
        IF jsonb_typeof(v_subcats_norm) <> 'array' THEN
          v_subcats_norm := '[]'::jsonb;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_subcats_norm := '[]'::jsonb;
      END;
    ELSIF jsonb_typeof(p_subcategorias_selecionadas) = 'array' THEN
      v_subcats_norm := p_subcategorias_selecionadas;
    ELSE
      v_subcats_norm := '[]'::jsonb;
    END IF;
  ELSE
    v_subcats_norm := NULL;
  END IF;

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
        subcategorias_selecionadas = COALESCE(v_subcats_norm, v_rec.subcategorias_selecionadas, '[]'::jsonb),
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
      COALESCE(v_subcats_norm, '[]'::jsonb),
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

-- Passo 3: RPC calcular_meta_poupanca_rpc tolerante a qualquer formato
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
  v_subcats_jsonb JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_competencia IS NULL THEN
    RAISE EXCEPTION 'Workspace e competência são obrigatórios.';
  END IF;

  v_ano := split_part(p_competencia, '-', 1)::INT;
  v_mes := split_part(p_competencia, '-', 2)::INT;
  v_data_inicio := make_date(v_ano, v_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month' - interval '1 day')::DATE;

  -- Localiza a subcategoria de "Salário" no workspace (tolerante a acentos e maiúsculas/minúsculas)
  SELECT s.id INTO v_salario_subcat_id
  FROM public.subcategorias s
  JOIN public.categorias c ON c.id = s.categoria_id
  WHERE s.workspace_id = p_workspace_id
    AND s.deleted_at IS NULL
    AND c.tipo = 'receita'
    AND (
      lower(s.nome) = 'salario'
      OR lower(s.nome) = 'salário'
      OR lower(s.nome) LIKE '%salario%'
      OR lower(s.nome) LIKE '%salário%'
    )
  ORDER BY (lower(s.nome) = 'salario' OR lower(s.nome) = 'salário') DESC
  LIMIT 1;

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

  -- Determinar subcategorias selecionadas com total tolerância a formatos legados
  IF p_subcategorias_ids IS NOT NULL AND array_length(p_subcategorias_ids, 1) > 0 THEN
    v_subcats_efetivas := p_subcategorias_ids;
  ELSIF FOUND AND v_meta_rec.subcategorias_selecionadas IS NOT NULL THEN
    -- Normalizar v_subcats_jsonb
    IF jsonb_typeof(v_meta_rec.subcategorias_selecionadas) = 'string' THEN
      BEGIN
        v_subcats_jsonb := (v_meta_rec.subcategorias_selecionadas #>> '{}')::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_subcats_jsonb := '[]'::jsonb;
      END;
    ELSIF jsonb_typeof(v_meta_rec.subcategorias_selecionadas) = 'array' THEN
      v_subcats_jsonb := v_meta_rec.subcategorias_selecionadas;
    ELSE
      v_subcats_jsonb := '[]'::jsonb;
    END IF;

    IF v_subcats_jsonb IS NOT NULL AND jsonb_typeof(v_subcats_jsonb) = 'array' AND jsonb_array_length(v_subcats_jsonb) > 0 THEN
      SELECT array_agg(value::text::uuid)
      INTO v_subcats_efetivas
      FROM jsonb_array_elements_text(v_subcats_jsonb)
      WHERE value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    END IF;
  END IF;

  -- Se após avaliação v_subcats_efetivas for nulo ou vazio, usar padrão: Salário
  IF v_subcats_efetivas IS NULL OR coalesce(array_length(v_subcats_efetivas, 1), 0) = 0 THEN
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
