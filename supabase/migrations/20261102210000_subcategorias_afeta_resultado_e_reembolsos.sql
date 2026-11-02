-- ==============================================================================
-- Migration: 20261102210000_subcategorias_afeta_resultado_e_reembolsos.sql
-- Descrição:
-- 1. Garante coluna afeta_resultado BOOLEAN DEFAULT true em public.subcategorias
-- 2. Atualiza constraint de origem_economica para permitir 'Reembolso'
-- 3. Backfill idempotente: todas as subcategorias existentes de receitas recebem afeta_resultado = true
--    (exceto quando já configuradas como false para Reembolso)
-- 4. Carga da Categoria Reembolsos com subcategorias 'Reembolso de Compras para Terceiros'
--    e 'Reembolso de Empréstimos a Terceiros' (Eventual / Reembolso / afeta_resultado = false)
--    em todos os workspaces existentes, de forma estritamente idempotente sem apagar nada.
-- 5. Atualiza RPC calcular_regime_competencia_integral_rpc para garantir exclusão de receitas
--    quando afeta_resultado = false tanto no lançamento quanto na subcategoria.
-- ==============================================================================

-- 1. Adicionar coluna afeta_resultado em subcategorias (se não existir)
ALTER TABLE public.subcategorias
  ADD COLUMN IF NOT EXISTS afeta_resultado BOOLEAN DEFAULT true;

-- 2. Atualizar CHECK constraint de subcategorias.origem_economica para incluir 'Reembolso'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subcategorias_origem_economica_check'
      AND conrelid = 'public.subcategorias'::regclass
  ) THEN
    ALTER TABLE public.subcategorias DROP CONSTRAINT subcategorias_origem_economica_check;
  END IF;

  ALTER TABLE public.subcategorias
    ADD CONSTRAINT subcategorias_origem_economica_check
    CHECK (
      origem_economica IS NULL OR
      origem_economica IN ('Trabalho', 'Capital', 'Outras', 'Reembolso')
    );
END $$;

-- 3. Backfill idempotente: subcategorias de receita existentes recebem afeta_resultado = true
-- (preservando aquelas já marcadas como false, ex: Reembolsos)
UPDATE public.subcategorias s
SET afeta_resultado = true
FROM public.categorias c
WHERE s.categoria_id = c.id
  AND c.tipo = 'receita'
  AND s.afeta_resultado IS NULL;

-- 4. Carga da Categoria "Reembolsos" e suas subcategorias por workspace (idempotente)
DO $$
DECLARE
  ws RECORD;
  v_cat_id UUID;
  v_sub_compra_id UUID;
  v_sub_emp_id UUID;
BEGIN
  FOR ws IN SELECT id, owner_user_id FROM public.workspaces LOOP
    -- Garantir ou localizar a Categoria 'Reembolsos'
    SELECT id INTO v_cat_id
    FROM public.categorias
    WHERE workspace_id = ws.id
      AND nome = 'Reembolsos'
      AND tipo = 'receita'
    LIMIT 1;

    IF v_cat_id IS NULL THEN
      INSERT INTO public.categorias (
        workspace_id,
        nome,
        tipo,
        natureza,
        classificacao_gerencial,
        cor,
        icone,
        ativo,
        arquivado,
        created_by
      ) VALUES (
        ws.id,
        'Reembolsos',
        'receita',
        'variavel',
        'Outras',
        '#10B981',
        'arrow-down-left',
        true,
        false,
        ws.owner_user_id
      )
      RETURNING id INTO v_cat_id;
    END IF;

    -- Subcategoria 1: "Reembolso de Compras para Terceiros"
    SELECT id INTO v_sub_compra_id
    FROM public.subcategorias
    WHERE workspace_id = ws.id
      AND categoria_id = v_cat_id
      AND nome = 'Reembolso de Compras para Terceiros'
    LIMIT 1;

    IF v_sub_compra_id IS NULL THEN
      INSERT INTO public.subcategorias (
        workspace_id,
        categoria_id,
        nome,
        regularidade,
        origem_economica,
        afeta_resultado,
        cor,
        icone,
        ativo,
        arquivado,
        created_by
      ) VALUES (
        ws.id,
        v_cat_id,
        'Reembolso de Compras para Terceiros',
        'Eventual',
        'Reembolso',
        false,
        '#10B981',
        'arrow-down-left',
        true,
        false,
        ws.owner_user_id
      );
    ELSE
      -- Garantir conformidade
      UPDATE public.subcategorias
      SET regularidade = 'Eventual',
          origem_economica = 'Reembolso',
          afeta_resultado = false
      WHERE id = v_sub_compra_id;
    END IF;

    -- Subcategoria 2: "Reembolso de Empréstimos a Terceiros"
    SELECT id INTO v_sub_emp_id
    FROM public.subcategorias
    WHERE workspace_id = ws.id
      AND categoria_id = v_cat_id
      AND nome = 'Reembolso de Empréstimos a Terceiros'
    LIMIT 1;

    IF v_sub_emp_id IS NULL THEN
      INSERT INTO public.subcategorias (
        workspace_id,
        categoria_id,
        nome,
        regularidade,
        origem_economica,
        afeta_resultado,
        cor,
        icone,
        ativo,
        arquivado,
        created_by
      ) VALUES (
        ws.id,
        v_cat_id,
        'Reembolso de Empréstimos a Terceiros',
        'Eventual',
        'Reembolso',
        false,
        '#10B981',
        'arrow-down-left',
        true,
        false,
        ws.owner_user_id
      );
    ELSE
      -- Garantir conformidade
      UPDATE public.subcategorias
      SET regularidade = 'Eventual',
          origem_economica = 'Reembolso',
          afeta_resultado = false
      WHERE id = v_sub_emp_id;
    END IF;

  END LOOP;
END $$;

-- 5. RPC calcular_regime_competencia_integral_rpc garantida
CREATE OR REPLACE FUNCTION public.calcular_regime_competencia_integral_rpc(
  p_workspace_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entradas_previstas NUMERIC := 0.00;
  v_saidas_previstas NUMERIC := 0.00;
  v_entradas_efetivadas NUMERIC := 0.00;
  v_saidas_efetivadas NUMERIC := 0.00;
  v_resultado_previsto NUMERIC := 0.00;
  v_resultado_efetivado NUMERIC := 0.00;
BEGIN
  IF p_workspace_id IS NULL OR p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RETURN jsonb_build_object(
      'entradas_previstas', 0.00,
      'saidas_previstas', 0.00,
      'entradas_efetivadas', 0.00,
      'saidas_efetivadas', 0.00,
      'resultado_previsto', 0.00,
      'resultado_efetivado', 0.00
    );
  END IF;

  -- 1. ENTRADAS PREVISTAS:
  -- Receitas lançadas no período onde afeta_resultado = true.
  -- Se l.afeta_resultado for nulo, herdamos de subcategoria.afeta_resultado (default true).
  -- Se l.afeta_resultado for false OU s.afeta_resultado for false, é excluído do Resultado!
  SELECT COALESCE(SUM(l.valor), 0.00)
  INTO v_entradas_previstas
  FROM public.lancamentos l
  LEFT JOIN public.subcategorias s ON s.id = l.subcategoria_id
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'receita'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_resultado, s.afeta_resultado, true) = true
    AND COALESCE(s.afeta_resultado, true) = true
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 2. SAÍDAS PREVISTAS:
  -- Despesas lançadas no período onde afeta_resultado = true.
  -- Soma SEMPRE valor_proprio (500 compartilhada com 200 próprio -> soma 200).
  -- Compras para Terceiros e Empréstimos têm afeta_resultado = false ou valor_proprio = 0 -> somam zero.
  SELECT COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00)
  INTO v_saidas_previstas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_resultado, true) = true
    AND COALESCE(l.valor_proprio, l.valor) > 0
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 3. ENTRADAS EFETIVADAS:
  -- Receitas pagas (status_pagamento = 'pago') onde afeta_resultado = true.
  SELECT COALESCE(SUM(l.valor), 0.00)
  INTO v_entradas_efetivadas
  FROM public.lancamentos l
  LEFT JOIN public.subcategorias s ON s.id = l.subcategoria_id
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'receita'
    AND l.status_pagamento = 'pago'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_resultado, s.afeta_resultado, true) = true
    AND COALESCE(s.afeta_resultado, true) = true
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 4. SAÍDAS EFETIVADAS:
  -- Despesas pagas (status_pagamento = 'pago') onde afeta_resultado = true.
  -- Soma SEMPRE valor_proprio.
  SELECT COALESCE(SUM(COALESCE(l.valor_proprio, l.valor)), 0.00)
  INTO v_saidas_efetivadas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento = 'pago'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND COALESCE(l.afeta_resultado, true) = true
    AND COALESCE(l.valor_proprio, l.valor) > 0
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 5. Resultados
  v_resultado_previsto := v_entradas_previstas - v_saidas_previstas;
  v_resultado_efetivado := v_entradas_efetivadas - v_saidas_efetivadas;

  RETURN jsonb_build_object(
    'entradas_previstas', v_entradas_previstas,
    'saidas_previstas', v_saidas_previstas,
    'entradas_efetivadas', v_entradas_efetivadas,
    'saidas_efetivadas', v_saidas_efetivadas,
    'resultado_previsto', v_resultado_previsto,
    'resultado_efetivado', v_resultado_efetivado
  );
END;
$$;
