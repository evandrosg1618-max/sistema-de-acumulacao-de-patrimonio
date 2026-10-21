-- Migração para ajustar cálculo de faturas com lançamentos recorrentes
-- Regra Build 5: Na soma que compõe a fatura, considerar APENAS o lançamento recorrente da próxima competência a vencer.
-- Os demais lançamentos recorrentes ficam visíveis nas faturas seguintes, mas não somam no comprometimento.

CREATE OR REPLACE FUNCTION public.recalcular_fatura_rpc(
  p_workspace_id uuid,
  p_cartao_id uuid,
  p_competencia text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cartao RECORD;
  v_ano_comp int;
  v_mes_comp int;
  v_dia_fech int;
  v_dia_venc int;
  v_ano_fech int;
  v_mes_fech int;
  v_ult_dia int;
  v_data_fech date;
  v_data_venc date;
  v_total_parcelas numeric := 0;
  v_total_avulso numeric := 0;
  v_total_recorrente numeric := 0;
  v_total_final numeric := 0;
  v_proxima_comp text;
BEGIN
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);

  v_ano_comp := CAST(SPLIT_PART(p_competencia, '-', 1) AS int);
  v_mes_comp := CAST(SPLIT_PART(p_competencia, '-', 2) AS int);

  -- Data de vencimento: calculada diretamente no mês/ano da competência
  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_comp, v_mes_comp, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_venc := MAKE_DATE(v_ano_comp, v_mes_comp, LEAST(v_dia_venc, v_ult_dia));

  -- Data de fechamento correspondente:
  IF v_dia_venc <= v_dia_fech THEN
    v_mes_fech := v_mes_comp - 1;
    v_ano_fech := v_ano_comp;
    IF v_mes_fech < 1 THEN
      v_mes_fech := 12;
      v_ano_fech := v_ano_fech - 1;
    END IF;
  ELSE
    v_mes_fech := v_mes_comp;
    v_ano_fech := v_ano_comp;
  END IF;

  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_fech, v_mes_fech, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_fech := MAKE_DATE(v_ano_fech, v_mes_fech, LEAST(v_dia_fech, v_ult_dia));

  -- Garantir registro de fatura
  INSERT INTO public.faturas (
    workspace_id,
    cartao_id,
    competencia,
    data_fechamento,
    data_vencimento,
    status,
    valor_total
  ) VALUES (
    p_workspace_id,
    p_cartao_id,
    p_competencia,
    v_data_fech,
    v_data_venc,
    'aberta',
    0.00
  )
  ON CONFLICT (workspace_id, cartao_id, competencia)
  DO UPDATE SET
    data_fechamento = EXCLUDED.data_fechamento,
    data_vencimento = EXCLUDED.data_vencimento,
    updated_at = NOW();

  -- Se a fatura já estiver paga, NÃO alterar seu valor_total
  IF EXISTS (
    SELECT 1 FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND competencia = p_competencia
      AND status = 'paga'
  ) THEN
    SELECT valor_total INTO v_total_final
    FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = p_cartao_id
      AND competencia = p_competencia;
    RETURN COALESCE(v_total_final, 0);
  END IF;

  -- 1. Soma parcelas ativas desta competência
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras à vista no cartão (regime='unico' e ativo)
  SELECT COALESCE(SUM(
    CASE WHEN l.tipo = 'despesa' THEN l.valor
         WHEN l.tipo = 'receita' THEN -l.valor
         ELSE 0 END
  ), 0)
  INTO v_total_avulso
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.regime = 'unico'
    AND l.deleted_at IS NULL;

  -- 3. Identificar a próxima competência a vencer deste cartão
  SELECT f.competencia INTO v_proxima_comp
  FROM public.faturas f
  WHERE f.workspace_id = p_workspace_id
    AND f.cartao_id = p_cartao_id
    AND f.status <> 'paga'
    AND f.data_vencimento >= CURRENT_DATE
  ORDER BY f.data_vencimento ASC
  LIMIT 1;

  IF v_proxima_comp IS NULL THEN
    SELECT f.competencia INTO v_proxima_comp
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.cartao_id = p_cartao_id
      AND f.status <> 'paga'
    ORDER BY f.data_vencimento ASC
    LIMIT 1;
  END IF;

  -- Considerar lançamentos recorrentes APENAS se esta competência for a próxima a vencer
  IF p_competencia = v_proxima_comp THEN
    SELECT COALESCE(SUM(
      CASE WHEN l.tipo = 'despesa' THEN l.valor
           WHEN l.tipo = 'receita' THEN -l.valor
           ELSE 0 END
    ), 0)
    INTO v_total_recorrente
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.cartao_id = p_cartao_id
      AND l.competencia = p_competencia
      AND (l.regime = 'fixo' OR l.serie_id IS NOT NULL)
      AND l.deleted_at IS NULL;
  ELSE
    v_total_recorrente := 0;
  END IF;

  v_total_final := GREATEST(0, ROUND(v_total_parcelas + v_total_avulso + v_total_recorrente, 2));

  -- Atualiza o valor_total da fatura
  UPDATE public.faturas
  SET valor_total = v_total_final,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND competencia = p_competencia
    AND status <> 'paga';

  RETURN v_total_final;
END;
$$;

-- Função consolidada de cartões
CREATE OR REPLACE FUNCTION public.obter_cartoes_consolidado_rpc(
  p_workspace_id uuid,
  p_incluir_inativos boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  workspace_id uuid,
  nome text,
  bandeira text,
  dia_fechamento integer,
  dia_vencimento integer,
  limite numeric,
  cor text,
  ativo boolean,
  fatura_atual numeric,
  total_comprometido numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH proxima_fatura AS (
    SELECT DISTINCT ON (f.cartao_id)
      f.cartao_id,
      f.competencia,
      f.valor_total
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.status <> 'paga'
      AND f.data_vencimento >= CURRENT_DATE
    ORDER BY f.cartao_id, f.data_vencimento ASC
  ),
  faturas_abertas AS (
    SELECT
      f.cartao_id,
      COALESCE(SUM(f.valor_total), 0) AS total_aberta
    FROM public.faturas f
    WHERE f.workspace_id = p_workspace_id
      AND f.status = 'aberta'
    GROUP BY f.cartao_id
  ),
  parcelas_pendentes AS (
    SELECT
      p.cartao_id,
      COALESCE(SUM(p.valor), 0) AS total_parcelas
    FROM public.parcelas p
    JOIN public.lancamentos l ON l.id = p.lancamento_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'pendente'
      AND l.deleted_at IS NULL
    GROUP BY p.cartao_id
  ),
  avulsos_pendentes AS (
    SELECT
      l.cartao_id,
      COALESCE(SUM(
        CASE WHEN l.tipo = 'despesa' THEN l.valor
             WHEN l.tipo = 'receita' THEN -l.valor
             ELSE 0 END
      ), 0) AS total_avulso
    FROM public.lancamentos l
    WHERE l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND l.regime = 'unico'
      AND l.status_pagamento = 'pendente'
      AND l.deleted_at IS NULL
    GROUP BY l.cartao_id
  ),
  recorrente_proxima AS (
    SELECT
      l.cartao_id,
      COALESCE(SUM(
        CASE WHEN l.tipo = 'despesa' THEN l.valor
             WHEN l.tipo = 'receita' THEN -l.valor
             ELSE 0 END
      ), 0) AS total_recorrente
    FROM public.lancamentos l
    JOIN proxima_fatura pf ON pf.cartao_id = l.cartao_id AND pf.competencia = l.competencia
    WHERE l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND (l.regime = 'fixo' OR l.serie_id IS NOT NULL)
      AND l.deleted_at IS NULL
    GROUP BY l.cartao_id
  )
  SELECT
    c.id,
    c.workspace_id,
    c.nome,
    c.bandeira,
    c.dia_fechamento,
    c.dia_vencimento,
    c.limite,
    c.cor,
    c.ativo,
    COALESCE(pf.valor_total, fa.total_aberta, 0)::numeric AS fatura_atual,
    GREATEST(0, COALESCE(pp.total_parcelas, 0) + COALESCE(ap.total_avulso, 0) + COALESCE(rp.total_recorrente, 0))::numeric AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN proxima_fatura pf ON pf.cartao_id = c.id
  LEFT JOIN faturas_abertas fa ON fa.cartao_id = c.id
  LEFT JOIN parcelas_pendentes pp ON pp.cartao_id = c.id
  LEFT JOIN avulsos_pendentes ap ON ap.cartao_id = c.id
  LEFT JOIN recorrente_proxima rp ON rp.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo = true)
  ORDER BY c.nome ASC;
END;
$$;
