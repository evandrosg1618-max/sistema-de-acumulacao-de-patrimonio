-- ==============================================================================
-- Migration: 20261108000000_novo_tipo_ajuste.sql
-- Descrição:
-- 1. Estende lancamentos_tipo_check para incluir 'ajuste'
-- 2. Adiciona colunas subtipo_ajuste e efeito_fatura em public.lancamentos
-- 3. Adiciona CHECK constraint para regras invariantes de ajustes
-- 4. Atualiza recalcular_fatura_rpc para somar/subtrair ajustes da competência
-- 5. Atualiza calcular_regime_competencia_integral_rpc para refletir Ajuste Banco no Resultado
-- 6. Atualiza editar_lancamento_atomico_rpc com suporte a tipo='ajuste' e recálculo
-- ==============================================================================

-- 1. Estender lancamentos_tipo_check
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lancamentos_tipo_check'
      AND conrelid = 'public.lancamentos'::regclass
  ) THEN
    ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_tipo_check;
  END IF;

  ALTER TABLE public.lancamentos
    ADD CONSTRAINT lancamentos_tipo_check
    CHECK (tipo IN ('despesa', 'receita', 'transferencia', 'ajuste'));
END $$;

-- 2. Adicionar colunas subtipo_ajuste e efeito_fatura
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS subtipo_ajuste text,
  ADD COLUMN IF NOT EXISTS efeito_fatura text;

-- Constraints para as novas colunas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lancamentos_subtipo_ajuste_check'
      AND conrelid = 'public.lancamentos'::regclass
  ) THEN
    ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_subtipo_ajuste_check;
  END IF;

  ALTER TABLE public.lancamentos
    ADD CONSTRAINT lancamentos_subtipo_ajuste_check
    CHECK (subtipo_ajuste IS NULL OR subtipo_ajuste IN ('ajuste_fatura_banco', 'ajuste_tecnico_sap'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lancamentos_efeito_fatura_check'
      AND conrelid = 'public.lancamentos'::regclass
  ) THEN
    ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_efeito_fatura_check;
  END IF;

  ALTER TABLE public.lancamentos
    ADD CONSTRAINT lancamentos_efeito_fatura_check
    CHECK (efeito_fatura IS NULL OR efeito_fatura IN ('aumenta', 'reduz'));

  -- Regra estrita: tipo = 'ajuste' exige subtipo_ajuste, efeito_fatura, cartao_id, regime = 'unico' e meio_pagamento_tipo = 'CARTAO'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lancamentos_ajuste_regras_check'
      AND conrelid = 'public.lancamentos'::regclass
  ) THEN
    ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_ajuste_regras_check;
  END IF;

  ALTER TABLE public.lancamentos
    ADD CONSTRAINT lancamentos_ajuste_regras_check
    CHECK (
      tipo <> 'ajuste' OR (
        subtipo_ajuste IS NOT NULL
        AND efeito_fatura IS NOT NULL
        AND cartao_id IS NOT NULL
        AND regime = 'unico'
        AND meio_pagamento_tipo = 'CARTAO'
      )
    );
END $$;

-- 4. Atualizar recalcular_fatura_rpc com 4º bloco: Ajustes
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
  v_total_avulso_sem_parcela numeric := 0;
  v_total_recorrente numeric := 0;
  v_total_ajustes numeric := 0;
  v_total_final numeric := 0;
  v_fatura_id uuid;
  v_total_pago numeric := 0;
BEGIN
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = p_cartao_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão não encontrado no workspace';
  END IF;

  v_ano_comp := SPLIT_PART(p_competencia, '-', 1)::int;
  v_mes_comp := SPLIT_PART(p_competencia, '-', 2)::int;
  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 28);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 10);

  v_data_fech := make_date(v_ano_comp, v_mes_comp, LEAST(v_dia_fech, 28));
  v_data_venc := v_data_fech + v_dia_venc;
  v_ano_fech := EXTRACT(YEAR FROM v_data_venc)::int;
  v_mes_fech := EXTRACT(MONTH FROM v_data_venc)::int;
  v_ult_dia := CASE
    WHEN v_mes_fech IN (1,3,5,7,8,10,12) THEN 31
    WHEN v_mes_fech = 2 THEN CASE
      WHEN (v_ano_fech % 4 = 0 AND v_ano_fech % 100 <> 0) OR v_ano_fech % 400 = 0 THEN 29
      ELSE 28 END
    ELSE 30 END;
  v_data_venc := make_date(v_ano_fech, v_mes_fech, LEAST(v_dia_venc, v_ult_dia));

  -- 1. Soma parcelas da competência
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras no cartão avulsas de regime = 'unico' e sem parcelas filhas
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'despesa' THEN l.valor
      WHEN l.tipo = 'receita' THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_total_avulso_sem_parcela
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.deleted_at IS NULL
    AND l.regime = 'unico'
    AND l.tipo IN ('despesa', 'receita')
    AND NOT EXISTS (
      SELECT 1 FROM public.parcelas pc
      WHERE pc.lancamento_id = l.id
    );

  -- 3. Recorrentes (fixo) só entram quando a fatura já está FECHADA
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'despesa' THEN l.valor
      WHEN l.tipo = 'receita' THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_total_recorrente
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.deleted_at IS NULL
    AND l.regime = 'fixo'
    AND l.tipo IN ('despesa', 'receita')
    AND CURRENT_DATE >= v_data_fech;

  -- 4. Bloco novo: AJUSTES da competência (tipo = 'ajuste')
  -- efeito_fatura = 'aumenta' -> +valor; efeito_fatura = 'reduz' -> -valor
  SELECT COALESCE(SUM(
    CASE
      WHEN l.efeito_fatura = 'aumenta' THEN l.valor
      WHEN l.efeito_fatura = 'reduz' THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_total_ajustes
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.deleted_at IS NULL
    AND l.tipo = 'ajuste';

  v_total_final := GREATEST(v_total_parcelas + v_total_avulso_sem_parcela + v_total_recorrente + v_total_ajustes, 0);

  -- Localiza ou cria a fatura (idempotente)
  SELECT id INTO v_fatura_id
  FROM public.faturas
  WHERE workspace_id = p_workspace_id
    AND cartao_id = p_cartao_id
    AND competencia = p_competencia
  FOR UPDATE;

  IF v_fatura_id IS NULL THEN
    INSERT INTO public.faturas (
      workspace_id, cartao_id, competencia, data_fechamento, data_vencimento,
      status, valor_total
    ) VALUES (
      p_workspace_id, p_cartao_id, p_competencia, v_data_fech, v_data_venc,
      'aberta', v_total_final
    )
    RETURNING id INTO v_fatura_id;
  END IF;

  -- Sincroniza rastreabilidade de pagamento
  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM public.pagamentos_fatura
  WHERE fatura_id = v_fatura_id AND status = 'efetivado';

  UPDATE public.faturas
  SET valor_total = v_total_final,
      valor_pago = COALESCE(v_total_pago, 0),
      saldo_pendente = GREATEST(v_total_final - COALESCE(v_total_pago, 0), 0),
      updated_at = NOW()
  WHERE id = v_fatura_id;

  RETURN v_total_final;
END;
$$;

-- 5. Atualizar calcular_regime_competencia_integral_rpc para suportar Ajustes de Banco no Resultado
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
  -- Receitas normais (afeta_resultado = true)
  -- + Ajustes da Fatura do Banco que REDUZEM a fatura (efeito_fatura = 'reduz' AND afeta_resultado = true)
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'receita' THEN l.valor
      WHEN l.tipo = 'ajuste' AND l.efeito_fatura = 'reduz' AND COALESCE(l.afeta_resultado, false) = true THEN l.valor
      ELSE 0
    END
  ), 0.00)
  INTO v_entradas_previstas
  FROM public.lancamentos l
  LEFT JOIN public.subcategorias s ON s.id = l.subcategoria_id
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim
    AND (
      (l.tipo = 'receita' AND COALESCE(l.afeta_resultado, s.afeta_resultado, true) = true AND COALESCE(s.afeta_resultado, true) = true)
      OR
      (l.tipo = 'ajuste' AND l.subtipo_ajuste = 'ajuste_fatura_banco' AND l.efeito_fatura = 'reduz' AND COALESCE(l.afeta_resultado, true) = true)
    );

  -- 2. SAÍDAS PREVISTAS:
  -- Despesas normais (afeta_resultado = true)
  -- + Ajustes da Fatura do Banco que AUMENTAM a fatura (efeito_fatura = 'aumenta' AND afeta_resultado = true)
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'despesa' THEN COALESCE(l.valor_proprio, l.valor)
      WHEN l.tipo = 'ajuste' AND l.efeito_fatura = 'aumenta' AND COALESCE(l.afeta_resultado, false) = true THEN l.valor
      ELSE 0
    END
  ), 0.00)
  INTO v_saidas_previstas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim
    AND (
      (l.tipo = 'despesa' AND COALESCE(l.afeta_resultado, true) = true AND COALESCE(l.valor_proprio, l.valor) > 0)
      OR
      (l.tipo = 'ajuste' AND l.subtipo_ajuste = 'ajuste_fatura_banco' AND l.efeito_fatura = 'aumenta' AND COALESCE(l.afeta_resultado, true) = true)
    );

  -- 3. ENTRADAS EFETIVADAS:
  -- Receitas pagas
  -- + Ajustes Banco que reduzem fatura (no cartão, data da operação)
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'receita' THEN l.valor
      WHEN l.tipo = 'ajuste' AND l.efeito_fatura = 'reduz' AND COALESCE(l.afeta_resultado, false) = true THEN l.valor
      ELSE 0
    END
  ), 0.00)
  INTO v_entradas_efetivadas
  FROM public.lancamentos l
  LEFT JOIN public.subcategorias s ON s.id = l.subcategoria_id
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim
    AND (
      (l.tipo = 'receita' AND l.status_pagamento = 'pago' AND COALESCE(l.afeta_resultado, s.afeta_resultado, true) = true AND COALESCE(s.afeta_resultado, true) = true)
      OR
      (l.tipo = 'ajuste' AND l.subtipo_ajuste = 'ajuste_fatura_banco' AND l.efeito_fatura = 'reduz' AND COALESCE(l.afeta_resultado, true) = true)
    );

  -- 4. SAÍDAS EFETIVADAS:
  -- Despesas de cartão (pela data da compra) ou contas pagas
  -- + Ajustes Banco que aumentam fatura (no cartão, pela data da operação)
  SELECT COALESCE(SUM(
    CASE
      WHEN l.tipo = 'despesa' THEN
        CASE
          WHEN l.meio_pagamento_tipo = 'CARTAO' THEN COALESCE(l.valor_proprio, l.valor)
          WHEN l.status_pagamento = 'pago' THEN COALESCE(l.valor_proprio, l.valor)
          ELSE 0
        END
      WHEN l.tipo = 'ajuste' AND l.efeito_fatura = 'aumenta' AND COALESCE(l.afeta_resultado, false) = true THEN l.valor
      ELSE 0
    END
  ), 0.00)
  INTO v_saidas_efetivadas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim
    AND (
      (l.tipo = 'despesa' AND COALESCE(l.afeta_resultado, true) = true AND COALESCE(l.valor_proprio, l.valor) > 0)
      OR
      (l.tipo = 'ajuste' AND l.subtipo_ajuste = 'ajuste_fatura_banco' AND l.efeito_fatura = 'aumenta' AND COALESCE(l.afeta_resultado, true) = true)
    );

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

-- 6. Atualizar editar_lancamento_atomico_rpc com suporte a tipo='ajuste' e campos subtipo_ajuste/efeito_fatura
CREATE OR REPLACE FUNCTION public.editar_lancamento_atomico_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data date,
  p_meio_pagamento_tipo text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_cartao_id uuid,
  p_categoria_id uuid,
  p_subcategoria_id uuid,
  p_status_pagamento text,
  p_observacao text,
  p_quantidade_parcelas integer,
  p_user_id uuid,
  p_modalidade_saida text DEFAULT 'compra_propria',
  p_valor_proprio numeric DEFAULT NULL,
  p_valor_terceiros numeric DEFAULT NULL,
  p_afeta_resultado boolean DEFAULT NULL,
  p_afeta_orcamento boolean DEFAULT NULL,
  p_subtipo_ajuste text DEFAULT NULL,
  p_efeito_fatura text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_antigo RECORD;
  v_fatura RECORD;
  v_novo_valor numeric;
  v_valor_proprio_final numeric;
  v_valor_terceiros_final numeric;
  v_afeta_res_final boolean;
  v_afeta_orc_final boolean;
  v_nova_competencia text;
  v_cartao RECORD;
  v_modalidade text;
  v_subtipo_ajuste text;
  v_efeito_fatura text;
BEGIN
  v_novo_valor := COALESCE(p_valor, 0);
  IF v_novo_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Valor do lançamento deve ser maior que zero.');
  END IF;

  SELECT * INTO v_antigo
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado.');
  END IF;

  -- Bloqueio estrito se fatura antiga ou nova estiver paga
  IF v_antigo.cartao_id IS NOT NULL AND v_antigo.competencia IS NOT NULL THEN
    SELECT status INTO v_fatura
    FROM public.faturas
    WHERE workspace_id = p_workspace_id
      AND cartao_id = v_antigo.cartao_id
      AND competencia = v_antigo.competencia;
    IF FOUND AND v_fatura.status = 'paga' THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'mensagem', 'A fatura já foi paga. Desfaça o pagamento da fatura antes de realizar a alteração.'
      );
    END IF;
  END IF;

  -- Calcular nova competência caso seja cartão
  v_nova_competencia := v_antigo.competencia;
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    SELECT dia_fechamento, dia_vencimento INTO v_cartao
    FROM public.cartoes
    WHERE id = p_cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      IF EXTRACT(DAY FROM p_data) >= COALESCE(v_cartao.dia_fechamento, 28) THEN
        v_nova_competencia := TO_CHAR((p_data + INTERVAL '1 month')::date, 'YYYY-MM');
      ELSE
        v_nova_competencia := TO_CHAR(p_data, 'YYYY-MM');
      END IF;

      -- Verificar se a nova fatura de destino também não está paga
      SELECT status INTO v_fatura
      FROM public.faturas
      WHERE workspace_id = p_workspace_id
        AND cartao_id = p_cartao_id
        AND competencia = v_nova_competencia;
      IF FOUND AND v_fatura.status = 'paga' THEN
        RETURN jsonb_build_object(
          'sucesso', false,
          'mensagem', 'A fatura já foi paga. Desfaça o pagamento da fatura antes de realizar a alteração.'
        );
      END IF;
    END IF;
  END IF;

  -- Determinar campos econômicos
  IF v_antigo.tipo = 'ajuste' THEN
    v_subtipo_ajuste := COALESCE(p_subtipo_ajuste, v_antigo.subtipo_ajuste);
    v_efeito_fatura := COALESCE(p_efeito_fatura, v_antigo.efeito_fatura);
    v_modalidade := NULL;
    v_valor_proprio_final := v_novo_valor;
    v_valor_terceiros_final := 0;
    v_afeta_orc_final := false; -- Ajustes NUNCA afetam orçamento
    IF v_subtipo_ajuste = 'ajuste_fatura_banco' THEN
      v_afeta_res_final := true; -- Banco afeta resultado
    ELSE
      v_afeta_res_final := false; -- Técnico NUNCA afeta resultado
    END IF;
  ELSE
    v_subtipo_ajuste := NULL;
    v_efeito_fatura := NULL;
    v_modalidade := COALESCE(p_modalidade_saida, v_antigo.modalidade_saida, 'compra_propria');
    IF v_modalidade = 'compra_terceiros' OR v_modalidade = 'emprestimo_terceiros' THEN
      v_valor_proprio_final := 0.00;
      v_valor_terceiros_final := v_novo_valor;
      v_afeta_res_final := false;
      v_afeta_orc_final := false;
    ELSIF v_modalidade = 'compra_compartilhada' THEN
      v_valor_proprio_final := COALESCE(p_valor_proprio, v_antigo.valor_proprio, v_novo_valor);
      v_valor_terceiros_final := COALESCE(p_valor_terceiros, v_antigo.valor_terceiros, 0.00);
      v_afeta_res_final := true;
      v_afeta_orc_final := true;
    ELSE
      v_valor_proprio_final := v_novo_valor;
      v_valor_terceiros_final := 0.00;
      v_afeta_res_final := COALESCE(p_afeta_resultado, v_antigo.afeta_resultado, true);
      v_afeta_orc_final := COALESCE(p_afeta_orcamento, v_antigo.afeta_orcamento, true);
    END IF;
  END IF;

  -- Reverter movimentações de conta antigas se estavam pagas
  IF v_antigo.status_pagamento = 'pago' AND v_antigo.meio_pagamento_tipo != 'CARTAO' AND v_antigo.tipo != 'ajuste' THEN
    IF v_antigo.tipo = 'despesa' AND v_antigo.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
    ELSIF v_antigo.tipo = 'receita' AND v_antigo.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
    ELSIF v_antigo.tipo = 'transferencia' AND v_antigo.conta_origem_id IS NOT NULL AND v_antigo.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_origem_id AND workspace_id = p_workspace_id;
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_antigo.valor,
          updated_at = NOW()
      WHERE id = v_antigo.conta_destino_id AND workspace_id = p_workspace_id;
    END IF;
    DELETE FROM public.movimentacoes_conta WHERE lancamento_id = p_lancamento_id;
  END IF;

  -- Atualizar lançamento
  UPDATE public.lancamentos
  SET descricao = TRIM(p_descricao),
      valor = v_novo_valor,
      data = p_data,
      competencia = v_nova_competencia,
      meio_pagamento_tipo = p_meio_pagamento_tipo,
      conta_origem_id = p_conta_origem_id,
      conta_destino_id = p_conta_destino_id,
      cartao_id = p_cartao_id,
      categoria_id = p_categoria_id,
      subcategoria_id = p_subcategoria_id,
      status_pagamento = p_status_pagamento,
      observacao = p_observacao,
      quantidade_parcelas = p_quantidade_parcelas,
      modalidade_saida = v_modalidade,
      valor_proprio = v_valor_proprio_final,
      valor_terceiros = v_valor_terceiros_final,
      afeta_resultado = v_afeta_res_final,
      afeta_orcamento = v_afeta_orc_final,
      subtipo_ajuste = v_subtipo_ajuste,
      efeito_fatura = v_efeito_fatura,
      updated_at = NOW()
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  -- Aplicar novas movimentações de conta se pago e não for cartão nem ajuste
  IF p_status_pagamento = 'pago' AND p_meio_pagamento_tipo != 'CARTAO' AND v_antigo.tipo != 'ajuste' THEN
    IF v_antigo.tipo = 'despesa' AND p_conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual - v_novo_valor,
          updated_at = NOW()
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

      INSERT INTO public.movimentacoes_conta (
        workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
      ) VALUES (
        p_workspace_id, p_conta_origem_id, p_lancamento_id, 'saida', v_novo_valor, p_data, TRIM(p_descricao), p_user_id
      );
    ELSIF v_antigo.tipo = 'receita' AND p_conta_origem_id IS NOT NULL THEN
      UPDATE public.contas
      SET saldo_atual = saldo_atual + v_novo_valor,
          updated_at = NOW()
      WHERE id = p_conta_origem_id AND workspace_id = p_workspace_id;

      INSERT INTO public.movimentacoes_conta (
        workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
      ) VALUES (
        p_workspace_id, p_conta_origem_id, p_lancamento_id, 'entrada', v_novo_valor, p_data, TRIM(p_descricao), p_user_id
      );
    END IF;
  END IF;

  -- Recalcular fatura se aplicável
  IF p_meio_pagamento_tipo = 'CARTAO' AND p_cartao_id IS NOT NULL THEN
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_cartao_id, v_nova_competencia);
  END IF;
  IF v_antigo.cartao_id IS NOT NULL AND v_antigo.competencia != v_nova_competencia THEN
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_antigo.cartao_id, v_antigo.competencia);
  END IF;

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id,
    'lancamentos',
    p_lancamento_id,
    'update_atomico',
    to_jsonb(v_antigo),
    jsonb_build_object(
      'id', p_lancamento_id,
      'descricao', p_descricao,
      'valor', v_novo_valor,
      'tipo', v_antigo.tipo,
      'subtipo_ajuste', v_subtipo_ajuste,
      'efeito_fatura', v_efeito_fatura,
      'afeta_resultado', v_afeta_res_final,
      'afeta_orcamento', v_afeta_orc_final
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Lançamento atualizado com sucesso.',
    'id', p_lancamento_id,
    'valor', v_novo_valor
  );
END;
$$;
