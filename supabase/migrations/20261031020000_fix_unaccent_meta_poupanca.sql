-- Migration: Corrigir unaccent na RPC calcular_meta_poupanca_rpc criando extensão unaccent ou fallback
CREATE EXTENSION IF NOT EXISTS unaccent;

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
