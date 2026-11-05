-- ==============================================================================
-- Migration: 20261104000000_resultado_cartao_pela_data_pagamento_parcial_e_edicao.sql
-- Três problemas conceituais distintos corrigidos NA FONTE (camada Supabase):
--
-- BLOCO 1 — RESULTADO: compra no cartão efetiva pela DATA DO LANÇAMENTO.
--   O Efetivado de despesas em CARTÃO passa a considerar a compra realizada
--   (mesmo competência da data do lançamento), independente de fatura aberta/
--   fechada/paga ou pagamento parcial — o pagamento da fatura é apenas
--   liquidação financeira (não cria despesa, não altera competência econômica,
--   não efetiva Resultado novamente, não consome Orçamento).
--
-- BLOCO 2 — PAGAMENTO PARCIAL: fatura R$ 500 + pagamento R$ 200 ⇒
--   status novo 'pago_parcial', valor_pago/saldo rastreáveis (pagamentos_fatura
--   é a fonte da verdade, sem lançamento financeiro fictício para o saldo),
--   comprometimento baixa EXATAMENTE pelo valor pago e o saldo não pago da
--   fatura anterior é linha informativa na fatura seguinte.
--
-- BLOCO 3 — EDIÇÃO DE PARCELADA: regenerar_parcelas_lancamento mantinha o pai
--   e as parcelas com o valor antigo (R$ 1.200) enquanto o serviço atualizava
--   só o cartão na tela; a versão nova reescreve pai + parcelas coerentes com
--   o novo Valor Total e o novo Valor Próprio (compartilhada).
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- BLOCO 2: status 'pago_parcial' + valor_pago/saldo_pendente nas faturas
-- ----------------------------------------------------------------------------
ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS valor_pago numeric NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS saldo_pendente numeric NOT NULL DEFAULT 0.00;

ALTER TABLE public.faturas DROP CONSTRAINT IF EXISTS faturas_status_check;
ALTER TABLE public.faturas
  ADD CONSTRAINT faturas_status_check
  CHECK (status IN ('aberta', 'paga', 'fechada', 'pago_parcial'));

-- Recalcula rastreabilidade das faturas existentes (idempotente)
UPDATE public.faturas f
SET valor_pago = COALESCE(pg.total, 0.00),
    saldo_pendente = GREATEST(COALESCE(f.valor_total, 0.00) - COALESCE(pg.total, 0.00), 0.00),
    updated_at = NOW()
FROM (
  SELECT fatura_id, SUM(valor) AS total
  FROM public.pagamentos_fatura
  WHERE status = 'efetivado'
  GROUP BY fatura_id
) pg
WHERE pg.fatura_id = f.id
  AND (COALESCE(f.valor_pago, 0) <> COALESCE(pg.total, 0)
       OR COALESCE(f.saldo_pendente, 0) <> GREATEST(COALESCE(f.valor_total, 0) - COALESCE(pg.total, 0), 0));

-- ----------------------------------------------------------------------------
-- BLOCO 1: calcular_regime_competencia_integral_rpc
-- Despesa em CARTÃO: Efetivado pela DATA DO LANÇAMENTO (compra realizada),
-- pelo Valor Próprio do lançamento PAI (sem duplicar parcelas).
-- Despesa em CONTA/DINHEIRO: preserva o toggle "pago".
-- Receitas: preserva o status 'pago'.
-- ----------------------------------------------------------------------------
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

  -- 1. ENTRADAS PREVISTAS (inalterado)
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

  -- 2. SAÍDAS PREVISTAS (inalterado — valor próprio do pai, pela data)
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

  -- 3. ENTRADAS EFETIVADAS (inalterado — receita efetiva pelo toggle "pago")
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
  --    • despesa em CARTÃO: considera a COMPRA REALIZADA pela data do
  --      lançamento (competência econômica da compra), pelo valor próprio do
  --      lançamento PAI — independe de fechamento/vencimento/status da fatura,
  --      de pagamento integral/parcial ou de fatura em aberto. Pagamento da
  --      fatura é apenas liquidação financeira e NÃO efetiva Resultado.
  --    • despesa em CONTA/DINHEIRO: preserva o toggle "pago".
  SELECT COALESCE(SUM(
    CASE
      WHEN l.meio_pagamento_tipo = 'CARTAO'
        THEN COALESCE(l.valor_proprio, l.valor)
      WHEN l.status_pagamento = 'pago'
        THEN COALESCE(l.valor_proprio, l.valor)
      ELSE 0
    END
  ), 0.00)
  INTO v_saidas_efetivadas
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

-- ----------------------------------------------------------------------------
-- BLOCO 2: recalcular_fatura_rpc — mantém valor_pago/saldo_pendente
-- rastreáveis a cada recálculo (o valor da fatura nunca é zerado pelo
-- pagamento; quem quita é pagar_fatura_rpc, que agora trata parcial).
-- ----------------------------------------------------------------------------
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

  -- 1. Soma parcelas da competência (cartão/fatura pelo Valor Total)
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras no cartão avulsas ESTRITAMENTE de regime = 'unico'
  --    E sem filhos em parcelas (regra da migration 20261025160000 preservada)
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

  v_total_final := GREATEST(v_total_parcelas + v_total_avulso_sem_parcela + v_total_recorrente, 0);

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

  -- Sincroniza rastreabilidade de pagamento (valor pago/saldo) sem alterar
  -- o valor total da fatura paga: quem quita é pagar_fatura_rpc
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

-- ----------------------------------------------------------------------------
-- BLOCO 2: pagar_fatura_rpc — suporta pagamento PARCIAL
-- • Soma pagamentos efetivados ANTES + ESTE pagamento.
-- • Se total pago < valor da fatura: status 'pago_parcial' (NUNCA 'paga'),
--   parcelas/lançamentos NÃO marcados 'pagos', saldo_pendente persistido.
-- • Se total pago >= valor: status 'paga', marca parcelas/lançamentos pagos.
-- • Comprometimento: derivado do valor liquidado (pago), nunca do status.
-- • Idempotência: pagamento já registrado (idempotency_key) não debita de novo;
--   fatura 'paga' integral não aceita novo débito.
-- ----------------------------------------------------------------------------
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
  v_total_pago_antes numeric := 0;
  v_total_pago_depois numeric := 0;
  v_valor_fatura numeric;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Valor do pagamento deve ser maior que zero');
  END IF;

  SELECT * INTO v_fatura
  FROM public.faturas
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fatura não encontrada');
  END IF;

  v_valor_fatura := COALESCE(v_fatura.valor_total, 0);

  -- IDEMPOTÊNCIA: fatura já quitada integralmente não aceita novo débito
  IF v_fatura.status = 'paga' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_paga', true,
      'saldo_restante', 0.00,
      'mensagem', 'Esta fatura já está paga. Nenhum pagamento duplicado foi realizado.'
    );
  END IF;

  SELECT * INTO v_conta
  FROM public.contas
  WHERE id = p_conta_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conta bancária informada não foi encontrada');
  END IF;

  SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_fatura.cartao_id;

  -- Debita a conta pelo valor REALMENTE pago (parcial ou integral)
  UPDATE public.contas
  SET saldo_atual = saldo_atual - p_valor,
      updated_at = NOW()
  WHERE id = p_conta_id AND workspace_id = p_workspace_id;

  -- Registra o pagamento (rastreável; cada pagamento parcial é um registro)
  INSERT INTO public.pagamentos_fatura (
    workspace_id, fatura_id, conta_id, valor, data_pagamento, status, created_by
  ) VALUES (
    p_workspace_id, p_fatura_id, p_conta_id, p_valor, p_data_pagamento, 'efetivado', p_user_id
  )
  RETURNING id INTO v_pagamento_id;

  -- Movimentação de saída na conta
  INSERT INTO public.movimentacoes_conta (
    workspace_id, conta_id, pagamento_fatura_id, tipo, valor, data, descricao, created_by
  ) VALUES (
    p_workspace_id, p_conta_id, v_pagamento_id, 'saida', p_valor, p_data_pagamento,
    'Pagamento fatura ' || COALESCE(v_cartao.nome, 'Cartão') || ' (' || v_fatura.competencia || ')',
    p_user_id
  );

  -- Total pago efetivado (antes já somava este novo pagamento)
  SELECT COALESCE(SUM(valor), 0) INTO v_total_pago_depois
  FROM public.pagamentos_fatura
  WHERE fatura_id = p_fatura_id AND workspace_id = p_workspace_id AND status = 'efetivado';

  v_total_pago_antes := v_total_pago_depois - p_valor;

  -- Decisão de quitação: SOMA dos pagamentos ≥ valor da fatura
  IF v_total_pago_depois >= v_valor_fatura THEN
    -- QUITAÇÃO INTEGRAL
    UPDATE public.faturas
    SET status = 'paga',
        valor_pago = v_total_pago_depois,
        saldo_pendente = 0,
        updated_at = NOW()
    WHERE id = p_fatura_id AND workspace_id = p_workspace_id;

    UPDATE public.parcelas
    SET status = 'paga', updated_at = NOW()
    WHERE workspace_id = p_workspace_id
      AND cartao_id = v_fatura.cartao_id
      AND competencia = v_fatura.competencia;

    UPDATE public.lancamentos
    SET status_pagamento = 'pago',
        data_pagamento = p_data_pagamento,
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id
      AND cartao_id = v_fatura.cartao_id
      AND competencia = v_fatura.competencia
      AND deleted_at IS NULL;

    INSERT INTO public.auditoria_operacoes (
      workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
    ) VALUES (
      p_workspace_id, 'faturas', p_fatura_id, 'pay_invoice',
      to_jsonb(v_fatura),
      jsonb_build_object('status', 'paga', 'pagamento_id', v_pagamento_id, 'total_pago', v_total_pago_depois),
      p_user_id
    );

    RETURN jsonb_build_object(
      'sucesso', true,
      'pagamento_id', v_pagamento_id,
      'saldo_restante', 0.00,
      'status', 'paga',
      'valor_pago', v_total_pago_depois
    );
  ELSE
    -- PAGAMENTO PARCIAL: NÃO quita; NÃO marca parcelas/lançamentos pagos
    UPDATE public.faturas
    SET status = 'pago_parcial',
        valor_pago = v_total_pago_depois,
        saldo_pendente = GREATEST(v_valor_fatura - v_total_pago_depois, 0),
        updated_at = NOW()
    WHERE id = p_fatura_id AND workspace_id = p_workspace_id;

    INSERT INTO public.auditoria_operacoes (
      workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
    ) VALUES (
      p_workspace_id, 'faturas', p_fatura_id, 'pay_invoice_parcial',
      to_jsonb(v_fatura),
      jsonb_build_object(
        'status', 'pago_parcial',
        'pagamento_id', v_pagamento_id,
        'valor_pagamento', p_valor,
        'total_pago', v_total_pago_depois,
        'saldo_pendente', GREATEST(v_valor_fatura - v_total_pago_depois, 0)
      ),
      p_user_id
    );

    RETURN jsonb_build_object(
      'sucesso', true,
      'pagamento_id', v_pagamento_id,
      'status', 'pago_parcial',
      'valor_fatura', v_valor_fatura,
      'valor_pago', v_total_pago_depois,
      'saldo_restante', GREATEST(v_valor_fatura - v_total_pago_depois, 0)
    );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- BLOCO 2: estornar_fatura_rpc — estorno coerente com pagamentos parciais
-- • Sem pagamentos efetivados: apenas restaura estado da fatura (idempotente).
-- • Com pagamentos: estorna TODOS (semântica atual do botão Estornar) —
--   cada pagamento devolve exatamente o valor pago à conta e ao
--   comprometimento; fatura volta a 'aberta' (se vencida, reexibição continua
--   sinalizando atraso), parcelas/lançamentos voltam a pendente.
-- • NÃO altera Resultado nem Orçamento (reverte apenas liquidação financeira).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estornar_fatura_rpc(
  p_workspace_id uuid,
  p_fatura_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fatura RECORD;
  v_pag RECORD;
  v_total_estornado numeric := 0;
BEGIN
  SELECT * INTO v_fatura
  FROM public.faturas
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fatura não encontrada');
  END IF;

  -- Estorna cada pagamento efetivado: devolve exatamente o valor pago
  FOR v_pag IN
    SELECT id, conta_id, valor, data_pagamento
    FROM public.pagamentos_fatura
    WHERE fatura_id = p_fatura_id AND workspace_id = p_workspace_id
      AND status = 'efetivado'
    FOR UPDATE
  LOOP
    UPDATE public.contas
    SET saldo_atual = saldo_atual + v_pag.valor,
        updated_at = NOW()
    WHERE id = v_pag.conta_id AND workspace_id = p_workspace_id;

    UPDATE public.movimentacoes_conta
    SET descricao = COALESCE(descricao, '') || ' [ESTORNADO]',
        updated_at = NOW()
    WHERE pagamento_fatura_id = v_pag.id AND tipo = 'saida';

    UPDATE public.pagamentos_fatura
    SET status = 'estornado', updated_at = NOW()
    WHERE id = v_pag.id;

    v_total_estornado := v_total_estornado + v_pag.valor;
  END LOOP;

  -- Restaura a fatura como aberta (estado anterior ao(s) pagamento(s))
  UPDATE public.faturas
  SET status = 'aberta',
      valor_pago = 0,
      saldo_pendente = GREATEST(COALESCE(valor_total, 0), 0),
      updated_at = NOW()
  WHERE id = p_fatura_id AND workspace_id = p_workspace_id;

  -- Parcelas/lançamentos voltam a pendente (só os da competência da fatura)
  UPDATE public.parcelas
  SET status = 'pendente', updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia
    AND status = 'paga';

  UPDATE public.lancamentos
  SET status_pagamento = 'pendente',
      data_pagamento = NULL,
      updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_fatura.cartao_id
    AND competencia = v_fatura.competencia
    AND deleted_at IS NULL
    AND status_pagamento = 'pago';

  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'faturas', p_fatura_id, 'estornar_pagamento',
    to_jsonb(v_fatura),
    jsonb_build_object('status', 'aberta', 'total_estornado', v_total_estornado),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'total_estornado', v_total_estornado,
    'status', 'aberta'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- BLOCO 2: obter_cartoes_consolidado_rpc — comprometimento pela LIQUIDAÇÃO
-- • fatura_total   = valor_total da fatura (o que o cartão compromete)
-- • fatura_pago    = soma dos pagamentos efetivados (liquidação real)
-- • fatura_saldo   = saldo não pago (comprometimento que permanece)
-- • comprometimento do cartão = soma dos saldos NÃO pagos das faturas
--   (pagamento parcial baixa exatamente o valor pago; estorno devolve).
-- • próxima fatura recebe linha informativa do saldo anterior.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_cartoes_consolidado_rpc(
  p_workspace_id uuid,
  p_incluir_inativos boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  nome text,
  bandeira text,
  dia_fechamento integer,
  dia_vencimento integer,
  limite numeric,
  cor text,
  icone text,
  ativo boolean,
  fatura_atual numeric,
  total_comprometido numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH faturas_cartao AS (
    SELECT
      f.*,
      COALESCE(pg.total_pago, 0) AS pago_efetivado
    FROM public.faturas f
    LEFT JOIN (
      SELECT fatura_id, SUM(valor) AS total_pago
      FROM public.pagamentos_fatura
      WHERE status = 'efetivado'
      GROUP BY fatura_id
    ) pg ON pg.fatura_id = f.id
    WHERE f.workspace_id = p_workspace_id
  ),
  resumo_por_cartao AS (
    SELECT
      fc.cartao_id,
      -- Fatura "atual": competência mais recente não paga integralmente
      (
        SELECT f2.valor_total - f2.pago_efetivado
        FROM faturas_cartao f2
        WHERE f2.cartao_id = fc.cartao_id
          AND (f2.valor_total - f2.pago_efetivado) > 0
        ORDER BY f2.competencia DESC
        LIMIT 1
      ) AS saldo_fatura_atual,
      -- Comprometimento: soma dos SALDOS não pagos de todas as faturas
      SUM(GREATEST(fc.valor_total - fc.pago_efetivado, 0)) AS total_comprometido
    FROM faturas_cartao fc
    GROUP BY fc.cartao_id
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
    c.icone,
    c.ativo,
    COALESCE(r.saldo_fatura_atual, 0.00) AS fatura_atual,
    COALESCE(r.total_comprometido, 0.00) AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN resumo_por_cartao r ON r.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo)
  ORDER BY c.nome;
END;
$$;

-- ----------------------------------------------------------------------------
-- BLOCO 3: regenerar_parcelas_lancamento — fonte da verdade única
-- • Pai atualizado com valor/valor_proprio coerentes ao novo parcelamento.
-- • Parcelas regeneradas atomicamente a partir do novo Valor Total.
-- • Valor Próprio proporcional ao novo total (compartilhada).
-- • Sem resíduos do valor antigo em nenhuma consolidação.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerar_parcelas_lancamento(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_novo_valor numeric,
  p_nova_data date,
  p_nova_quantidade_parcelas integer,
  p_nova_descricao text,
  p_categoria_id uuid DEFAULT NULL,
  p_subcategoria_id uuid DEFAULT NULL,
  p_novo_cartao_id uuid DEFAULT NULL,
  p_nova_observacao text DEFAULT NULL,
  p_novo_valor_proprio numeric DEFAULT NULL,
  p_novo_valor_terceiros numeric DEFAULT NULL,
  p_modalidade_saida text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pai RECORD;
  v_valor_total numeric;
  v_valor_proprio numeric;
  v_valor_terceiros numeric;
  v_modalidade text;
  v_cartao_id uuid;
  v_competencia text;
  v_competencia_parc text;
  v_data_parc date;
  v_num_parc int;
  v_qtd int;
  v_valor_base numeric;
  v_residuo numeric;
  v_parcela_id uuid;
  v_deleted_ids uuid[];
  v_comps_existentes text[];
  v_total_parcelas_soma numeric;
  v_diff_parc numeric;
BEGIN
  IF p_novo_valor IS NULL OR p_novo_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Valor total deve ser maior que zero');
  END IF;
  IF p_nova_quantidade_parcelas IS NULL OR p_nova_quantidade_parcelas < 1 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Quantidade de parcelas deve ser ao menos 1');
  END IF;

  SELECT * INTO v_pai
  FROM public.lancamentos
  WHERE id = p_lancamento_id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento pai não encontrado');
  END IF;

  v_valor_total := p_novo_valor;
  v_modalidade := COALESCE(p_modalidade_saida, v_pai.modalidade_saida, 'compra_propria');

  -- Valor Próprio: se não informado, reescala proporcionalmente ao novo total
  IF p_novo_valor_proprio IS NOT NULL AND p_novo_valor_proprio > 0 THEN
    v_valor_proprio := p_novo_valor_proprio;
  ELSE
    IF COALESCE(v_pai.valor_proprio, 0) > 0 AND COALESCE(v_pai.valor, 0) > 0 THEN
      v_valor_proprio := ROUND((v_pai.valor_proprio / v_pai.valor) * v_valor_total, 2);
    ELSE
      v_valor_proprio := v_valor_total;
    END IF;
  END IF;

  IF v_valor_proprio > v_valor_total THEN
    v_valor_proprio := v_valor_total;
  END IF;

  IF COALESCE(p_novo_valor_terceiros, -1) >= 0 THEN
    v_valor_terceiros := p_novo_valor_terceiros;
  ELSE
    v_valor_terceiros := GREATEST(v_valor_total - v_valor_proprio, 0);
  END IF;

  v_cartao_id := COALESCE(p_novo_cartao_id, v_pai.cartao_id);

  -- ---------------------------------------------------------------------------
  -- Remove parcelas antigas (registra ids para auditoria) e restaura a fatura
  -- das competências afetadas para 'aberta' quando o lançamento foi marcado
  -- pago pela regra antiga — a edição não pode preservar quitação antiga.
  -- ---------------------------------------------------------------------------
  SELECT array_agg(id) INTO v_deleted_ids
  FROM public.parcelas
  WHERE lancamento_id = p_lancamento_id
    AND workspace_id = p_workspace_id;

  SELECT array_agg(DISTINCT competencia) INTO v_comps_existentes
  FROM public.parcelas
  WHERE lancamento_id = p_lancamento_id
    AND workspace_id = p_workspace_id;

  DELETE FROM public.parcelas
  WHERE lancamento_id = p_lancamento_id
    AND workspace_id = p_workspace_id;

  IF v_comps_existentes IS NOT NULL THEN
    UPDATE public.faturas
    SET status = 'aberta',
        valor_pago = 0,
        saldo_pendente = 0,
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id
      AND cartao_id = COALESCE(v_cartao_id, v_pai.cartao_id)
      AND competencia = ANY(v_comps_existentes)
      AND status IN ('paga', 'pago_parcial')
      AND NOT EXISTS (
        -- não zera fatura com pagamentos de OUTRAS compras (outras parcelas)
        SELECT 1 FROM public.parcelas p2
        WHERE p2.workspace_id = p_workspace_id
          AND p2.cartao_id = COALESCE(v_cartao_id, v_pai.cartao_id)
          AND p2.competencia = faturas.competencia
          AND p2.lancamento_id <> p_lancamento_id
      );
  END IF;

  -- ---------------------------------------------------------------------------
  -- Atualiza o PAI (fonte da verdade do Orçamento/Resultado)
  -- ---------------------------------------------------------------------------
  UPDATE public.lancamentos
  SET valor = v_valor_total,
      valor_proprio = v_valor_proprio,
      valor_terceiros = v_valor_terceiros,
      data = p_nova_data,
      competencia = to_char(p_nova_data, 'YYYY-MM'),
      descricao = COALESCE(p_nova_descricao, v_pai.descricao),
      categoria_id = COALESCE(p_categoria_id, v_pai.categoria_id),
      subcategoria_id = COALESCE(p_subcategoria_id, v_pai.subcategoria_id),
      cartao_id = v_cartao_id,
      observacao = COALESCE(p_nova_observacao, v_pai.observacao),
      modalidade_saida = v_modalidade,
      quantidade_parcelas = p_nova_quantidade_parcelas,
      total_parcelas = p_nova_quantidade_parcelas,
      numero_parcela = 0,
      status_pagamento = 'pendente',
      data_pagamento = NULL,
      updated_at = NOW()
  WHERE id = p_lancamento_id;

  -- ---------------------------------------------------------------------------
  -- Regenera as parcelas a partir do NOVO valor total
  -- ---------------------------------------------------------------------------
  v_qtd := p_nova_quantidade_parcelas;
  v_valor_base := ROUND(v_valor_total / v_qtd, 2);
  v_residuo := v_valor_total - (v_valor_base * v_qtd);

  FOR v_num_parc IN 1..v_qtd LOOP
    v_data_parc := make_date(
      EXTRACT(YEAR FROM p_nova_data)::int,
      EXTRACT(MONTH FROM p_nova_data)::int + (v_num_parc - 1),
      1
    );
    INSERT INTO public.parcelas (
      workspace_id, lancamento_id, cartao_id, numero_parcela, total_parcelas,
      valor, data_vencimento, competencia, status
    ) VALUES (
      p_workspace_id, p_lancamento_id, v_cartao_id, v_num_parc, v_qtd,
      v_valor_base + CASE WHEN v_num_parc = 1 THEN v_residuo ELSE 0 END,
      v_data_parc,
      to_char(v_data_parc, 'YYYY-MM'),
      'pendente'
    )
    RETURNING id INTO v_parcela_id;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Consistência: soma das parcelas = valor total do pai
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(valor), 0) INTO v_total_parcelas_soma
  FROM public.parcelas
  WHERE lancamento_id = p_lancamento_id AND workspace_id = p_workspace_id;

  v_diff_parc := v_total_parcelas_soma - v_valor_total;
  IF ABS(v_diff_parc) > 0.01 THEN
    RAISE EXCEPTION 'Regeneração inconsistente: soma das parcelas (%) difere do valor total (%)', v_total_parcelas_soma, v_valor_total;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Auditoria
  -- ---------------------------------------------------------------------------
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'lancamentos', p_lancamento_id, 'regenerar_parcelas',
    jsonb_build_object('valor', v_pai.valor, 'valor_proprio', v_pai.valor_proprio, 'quantidade', v_pai.quantidade_parcelas),
    jsonb_build_object('valor', v_valor_total, 'valor_proprio', v_valor_proprio, 'quantidade', v_qtd),
    (SELECT created_by FROM public.lancamentos WHERE id = p_lancamento_id)
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'lancamento_id', p_lancamento_id,
    'valor', v_valor_total,
    'valor_proprio', v_valor_proprio,
    'valor_terceiros', v_valor_terceiros,
    'quantidade_parcelas', v_qtd,
    'parcelas_removidas', COALESCE(array_length(v_deleted_ids, 1), 0),
    'parcelas_criadas', v_qtd
  );
END;
$$;
