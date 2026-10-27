-- Migration: Criar RPC calcular_regime_competencia_integral_rpc
-- Processamento pesado em RPC no banco filtrando por workspace e pelo período de datas (fonte da verdade: data do lançamento).
-- Idempotente com CREATE OR REPLACE FUNCTION e verificação de workspace.

CREATE OR REPLACE FUNCTION public.calcular_regime_competencia_integral_rpc(
  p_workspace_id UUID,
  p_data_inicio DATE,
  p_data_fim DATE
)
RETURNS JSONB
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
  -- Validar entrada
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

  -- 1. ENTRADAS PREVISTAS: Receitas lançadas no período (data entre início e fim)
  -- Independentemente de terem sido recebidas ou pagas.
  -- Exclui transferências, ajustes, registros deletados ou cancelados, ou parcelas filhas (mantém pai).
  SELECT COALESCE(SUM(l.valor), 0.00)
  INTO v_entradas_previstas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'receita'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 2. SAÍDAS PREVISTAS: Despesas lançadas no período (data entre início e fim)
  -- Para compras parceladas, o lançamento pai registra o compromisso integral na data da compra.
  -- Parcelas filhas (com lancamento_pai_id != id) não são somadas.
  SELECT COALESCE(SUM(l.valor), 0.00)
  INTO v_saidas_previstas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento != 'cancelado'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 3. ENTRADAS EFETIVADAS: Receitas recebidas (status_pagamento = 'pago') na data de lançamento
  SELECT COALESCE(SUM(l.valor), 0.00)
  INTO v_entradas_efetivadas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'receita'
    AND l.status_pagamento = 'pago'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
    AND l.data >= p_data_inicio
    AND l.data <= p_data_fim;

  -- 4. SAÍDAS EFETIVADAS: Despesas pagas (status_pagamento = 'pago') na data de lançamento
  -- Pagamentos de fatura de cartão NUNCA entram (vivem em pagamentos_fatura).
  -- Transferências e ajustes NUNCA entram (tipo != 'despesa').
  SELECT COALESCE(SUM(l.valor), 0.00)
  INTO v_saidas_efetivadas
  FROM public.lancamentos l
  WHERE l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.tipo = 'despesa'
    AND l.status_pagamento = 'pago'
    AND (l.lancamento_pai_id IS NULL OR l.lancamento_pai_id = l.id)
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

-- Grant para authenticated
GRANT EXECUTE ON FUNCTION public.calcular_regime_competencia_integral_rpc(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_regime_competencia_integral_rpc(UUID, DATE, DATE) TO service_role;
