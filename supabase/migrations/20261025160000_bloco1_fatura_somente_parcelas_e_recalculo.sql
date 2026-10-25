-- ==============================================================================
-- Migração: 20261025160000_bloco1_fatura_somente_parcelas_e_recalculo.sql
-- Objetivo:
-- 1. recalcular_fatura_rpc: excluir explicitamente lançamentos com regime='parcelado'
--    ou que possuam parcelas filhas de qualquer soma avulsa.
--    Na fatura entram ESTRITAMENTE registros de `parcelas` e compras avulsas de regime 'unico' sem filhos em parcelas.
-- 2. Recalcular e normalizar todas as faturas existentes não pagas.
-- 3. pagar_fatura_rpc: garantir que o pagamento do valor da fatura resulte em status 'paga'
--    definitivo e que a fatura recalculada não gere resíduos.
-- ==============================================================================

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

  v_ult_dia := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(v_ano_comp, v_mes_comp, 1)) + INTERVAL '1 month - 1 day'))::int;
  v_data_venc := MAKE_DATE(v_ano_comp, v_mes_comp, LEAST(v_dia_venc, v_ult_dia));

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

  -- 1. Soma cotas da tabela 'parcelas' desta competência (inclui parcelados E cotas únicas)
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras no cartão avulsas ESTRITAMENTE de regime = 'unico' E sem filhos em parcelas
  -- EXCLUI explicitamente qualquer regime = 'parcelado' ou pai de parcelas!
  SELECT COALESCE(SUM(
    CASE WHEN l.tipo = 'despesa' THEN l.valor
         WHEN l.tipo = 'receita' THEN -l.valor
         ELSE 0 END
  ), 0)
  INTO v_total_avulso_sem_parcela
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.cartao_id = p_cartao_id
    AND l.competencia = p_competencia
    AND l.regime = 'unico'
    AND l.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.parcelas p2
      WHERE p2.lancamento_id = l.id
    );

  -- 3. Identificar a próxima competência a vencer deste cartão para o recorrente
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

  v_total_final := GREATEST(0, ROUND(v_total_parcelas + v_total_avulso_sem_parcela + v_total_recorrente, 2));

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


-- Atualizar pagar_fatura_rpc com garantia de idempotência, trava SELECT FOR UPDATE e saldo a pagar ZERO
CREATE OR REPLACE FUNCTION public.pagar_fatura_rpc(
  p_workspace_id uuid,
  p_fatura_id uuid,
  p_conta_id uuid,
  p_valor numeric,
  p_data_pagamento date,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fatura RECORD;
  v_conta RECORD;
  v_cartao RECORD;
  v_pagamento_id uuid;
  v_total_pago numeric := 0;
BEGIN
  IF p_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Valor do pagamento deve ser maior que zero');
  END IF;

  -- Trava a fatura para evitar pagamentos concorrentes
  SELECT * INTO v_fatura
  FROM public.faturas
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fatura não encontrada');
  END IF;

  -- IDEMPOTÊNCIA: Se a fatura já está marcada como 'paga', NÃO debitar a conta de novo!
  IF v_fatura.status = 'paga' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_paga', true,
      'saldo_restante', 0.00,
      'mensagem', 'Esta fatura já está paga. Nenhum pagamento duplicado foi realizado.'
    );
  END IF;

  -- Trava a conta bancária
  SELECT * INTO v_conta
  FROM public.contas
  WHERE id = p_conta_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta bancária informada não foi encontrada');
  END IF;

  SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_fatura.cartao_id;

  -- Debita conta
  UPDATE public.contas
  SET saldo_atual = saldo_atual - p_valor,
      updated_at = NOW()
  WHERE id = p_conta_id AND workspace_id = p_workspace_id;

  -- Insere pagamento da fatura
  INSERT INTO public.pagamentos_fatura (
    workspace_id, fatura_id, conta_id, valor, data_pagamento, status, created_by
  ) VALUES (
    p_workspace_id, p_fatura_id, p_conta_id, p_valor, p_data_pagamento, 'efetivado', p_user_id
  )
  RETURNING id INTO v_pagamento_id;

  -- Registra movimentação de saída na conta com rótulo
  INSERT INTO public.movimentacoes_conta (
    workspace_id, conta_id, pagamento_fatura_id, tipo, valor, data, descricao, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, v_pagamento_id, 'saida', p_valor, p_data_pagamento,
    'Pagamento fatura ' || COALESCE(v_cartao.nome, 'Cartão') || ' (' || v_fatura.competencia || ')',
    p_user_id
  );

  -- Calcula total pago efetivado incluindo este
  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago
  FROM public.pagamentos_fatura
  WHERE fatura_id = p_fatura_id AND workspace_id = p_workspace_id AND status = 'efetivado';

  -- Atualiza status da fatura para 'paga' definitivo
  UPDATE public.faturas
  SET status = 'paga',
      updated_at = NOW()
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id;

  -- Marca parcelas vinculadas a esta fatura como pagas
  UPDATE public.parcelas
  SET status = 'paga',
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia;

  -- Marca lançamentos desta fatura como pagos
  UPDATE public.lancamentos
  SET status_pagamento = 'pago',
      data_pagamento = p_data_pagamento,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia
    AND deleted_at IS NULL;

  -- Registra auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'faturas', p_fatura_id, 'pay_invoice',
    to_jsonb(v_fatura), jsonb_build_object('status', 'paga', 'pagamento_id', v_pagamento_id, 'total_pago', v_total_pago), p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'pagamento_id', v_pagamento_id,
    'saldo_restante', 0.00,
    'status', 'paga'
  );
END;
$$;


-- Recalcular / normalizar TODAS as faturas existentes não pagas com base na nova regra
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT workspace_id, cartao_id, competencia
    FROM public.faturas
    WHERE status <> 'paga'
  LOOP
    PERFORM public.recalcular_fatura_rpc(v_rec.workspace_id, v_rec.cartao_id, v_rec.competencia);
  END LOOP;
END $$;
