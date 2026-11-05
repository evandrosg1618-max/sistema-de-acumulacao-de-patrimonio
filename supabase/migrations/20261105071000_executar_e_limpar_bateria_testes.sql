-- ============================================================================
-- Migration: Corrigir e executar RPC da bateria de testes E, F, G, H e reparo de dado real
-- Versão corrigida para evitar erro 42883 (calcular_regime_competencia_integral_rpc usa datas)
-- ============================================================================

-- 1. Reparo preventivo e idempotente do dado real "15. Alteração de compra parcelada"
UPDATE public.lancamentos
SET valor_proprio = 1080.00,
    valor_terceiros = 0.00,
    updated_at = NOW()
WHERE id = 'f953b711-4a2a-498f-9a70-1afcb6ae8655'::uuid
  AND (valor_proprio IS DISTINCT FROM 1080.00 OR valor_terceiros IS DISTINCT FROM 0.00);

-- 2. Atualizar a RPC com a assinatura correta de todas as chamadas internas
CREATE OR REPLACE FUNCTION public.executar_bateria_testes_e_f_g_h_rpc(
  p_workspace_id uuid DEFAULT 'd44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cartao_id uuid := '1dd20adf-70fa-48b3-a78b-3fc9f9b40a96'::uuid;
  v_conta_id uuid := '58c863b6-432b-4494-b894-2f7e76de84f7'::uuid;
  v_subcat_id uuid := '2fdd1140-580a-4fc9-a7ee-7b6de2aff055'::uuid;
  v_cat_id uuid;
  v_res_e jsonb;
  v_res_f jsonb;
  v_res_g jsonb;
  v_res_h jsonb;
  v_res_cd jsonb;
  v_res_f953 jsonb;
  v_geral jsonb;

  v_dt_inicio date := '2026-11-01'::date;
  v_dt_fim date := '2026-11-30'::date;

  -- Teste E vars
  v_lanc_e_id uuid;
  v_fatura_e RECORD;
  v_conta_saldo_pre_e numeric;
  v_conta_saldo_pos_e numeric;
  v_comp_pre_e numeric;
  v_comp_pos_e numeric;
  v_res_pagar_e jsonb;
  v_orc_pre_e jsonb;
  v_orc_pos_e jsonb;
  v_reg_pre_e jsonb;
  v_reg_pos_e jsonb;

  -- Teste F vars
  v_fatura_f RECORD;
  v_conta_saldo_pre_f numeric;
  v_conta_saldo_pos_f numeric;
  v_comp_pre_f numeric;
  v_comp_pos_f numeric;
  v_res_pagar_f jsonb;
  v_orc_pre_f jsonb;
  v_orc_pos_f jsonb;
  v_reg_pre_f jsonb;
  v_reg_pos_f jsonb;
  v_nao_pagos_count int;

  -- Teste G vars
  v_res_estorno_g jsonb;
  v_fatura_g RECORD;
  v_conta_saldo_pos_g numeric;
  v_comp_pos_g numeric;
  v_orc_pos_g jsonb;
  v_reg_pos_g jsonb;

  -- Teste H vars
  v_pai_h_id uuid := 'b7e10a01-0000-4000-8000-0000000000a6'::uuid;
  v_pai_h_antes RECORD;
  v_pai_h_depois RECORD;
  v_comp_pre_h numeric;
  v_comp_pos_h numeric;
  v_orc_pre_h jsonb;
  v_orc_pos_h jsonb;
  v_reg_pre_h jsonb;
  v_reg_pos_h jsonb;
  v_res_regenerar_h jsonb;
  v_parc_h_count int;
  v_parc_h_soma numeric;

  -- Teste C vars
  v_pai_c_id uuid := 'b7e10a01-0000-4000-8000-0000000000a3'::uuid;
  v_pai_c_antes RECORD;
  v_pai_c_depois RECORD;
  v_res_regenerar_c jsonb;
  v_parc_c_count int;
  v_parc_c_soma numeric;

  -- Teste D vars
  v_pai_d_id uuid := 'b7e10a01-0000-4000-8000-0000000000a4'::uuid;
  v_pai_d RECORD;
  v_parc_d_count int;
  v_parc_d_soma numeric;

  -- Dado real
  v_dado_f953 RECORD;
BEGIN
  SELECT categoria_id INTO v_cat_id
  FROM public.subcategorias
  WHERE id = v_subcat_id;

  -- =========================================================================
  -- TESTE E: Pagamento integral
  -- =========================================================================
  INSERT INTO public.lancamentos (
    workspace_id, descricao, valor, valor_proprio, valor_terceiros,
    data, competencia, tipo, regime, modalidade_saida, cartao_id,
    meio_pagamento_tipo, categoria_id, subcategoria_id, status_pagamento,
    afeta_resultado, afeta_orcamento
  ) VALUES (
    p_workspace_id, 'TESTE E Unico 300', 300.00, 300.00, 0.00,
    '2026-11-25', '2026-11', 'despesa', 'unico', 'compra_propria', v_cartao_id,
    'CARTAO', v_cat_id, v_subcat_id, 'pendente',
    true, true
  )
  RETURNING id INTO v_lanc_e_id;

  PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, '2026-11');

  SELECT * INTO v_fatura_e
  FROM public.faturas
  WHERE workspace_id = p_workspace_id AND cartao_id = v_cartao_id AND competencia = '2026-11';

  SELECT saldo_atual INTO v_conta_saldo_pre_e
  FROM public.contas WHERE id = v_conta_id;

  SELECT total_comprometido INTO v_comp_pre_e
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pre_e := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pre_e := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  -- Pagar fatura integral (300)
  v_res_pagar_e := public.pagar_fatura_rpc(
    p_workspace_id, v_fatura_e.id, v_conta_id, 300.00, '2026-11-26'
  );

  SELECT * INTO v_fatura_e
  FROM public.faturas WHERE id = v_fatura_e.id;

  SELECT saldo_atual INTO v_conta_saldo_pos_e
  FROM public.contas WHERE id = v_conta_id;

  SELECT total_comprometido INTO v_comp_pos_e
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pos_e := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pos_e := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  v_res_e := jsonb_build_object(
    'sucesso', true,
    'fatura_id', v_fatura_e.id,
    'fatura_status', v_fatura_e.status,
    'fatura_valor_pago', v_fatura_e.valor_pago,
    'fatura_saldo_pendente', v_fatura_e.saldo_pendente,
    'pagar_retorno', v_res_pagar_e,
    'conta_saldo_pre', v_conta_saldo_pre_e,
    'conta_saldo_pos', v_conta_saldo_pos_e,
    'conta_saldo_delta', (v_conta_saldo_pos_e - v_conta_saldo_pre_e),
    'comprometimento_pre', v_comp_pre_e,
    'comprometimento_pos', v_comp_pos_e,
    'comprometimento_delta', (v_comp_pos_e - v_comp_pre_e),
    'resultado_previsto_delta', ((v_reg_pos_e->>'saidas_previstas')::numeric - (v_reg_pre_e->>'saidas_previstas')::numeric),
    'resultado_efetivado_delta', ((v_reg_pos_e->>'saidas_efetivadas')::numeric - (v_reg_pre_e->>'saidas_efetivadas')::numeric),
    'orcamento_realizado_delta', ((v_orc_pos_e->>'despesas_efetivado')::numeric - (v_orc_pre_e->>'despesas_efetivado')::numeric)
  );

  -- Limpar lançamento de teste E e estornar o pagamento de E para isolar F
  PERFORM public.estornar_fatura_rpc(p_workspace_id, v_fatura_e.id);
  UPDATE public.lancamentos SET deleted_at = NOW() WHERE id = v_lanc_e_id;
  PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, '2026-11');

  -- =========================================================================
  -- TESTE F: Pagamento parcial de 200 sobre fatura 500
  -- =========================================================================
  SELECT * INTO v_fatura_f
  FROM public.faturas
  WHERE workspace_id = p_workspace_id AND cartao_id = v_cartao_id AND competencia = '2026-11';

  SELECT saldo_atual INTO v_conta_saldo_pre_f
  FROM public.contas WHERE id = v_conta_id;

  SELECT total_comprometido INTO v_comp_pre_f
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pre_f := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pre_f := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  -- Pagar parcial 200
  v_res_pagar_f := public.pagar_fatura_rpc(
    p_workspace_id, v_fatura_f.id, v_conta_id, 200.00, '2026-11-28'
  );

  SELECT * INTO v_fatura_f
  FROM public.faturas WHERE id = v_fatura_f.id;

  SELECT saldo_atual INTO v_conta_saldo_pos_f
  FROM public.contas WHERE id = v_conta_id;

  SELECT total_comprometido INTO v_comp_pos_f
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pos_f := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pos_f := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  SELECT COUNT(*) INTO v_nao_pagos_count
  FROM public.lancamentos
  WHERE workspace_id = p_workspace_id
    AND cartao_id = v_cartao_id
    AND competencia = '2026-11'
    AND status_pagamento = 'pago'
    AND deleted_at IS NULL;

  v_res_f := jsonb_build_object(
    'sucesso', true,
    'fatura_id', v_fatura_f.id,
    'fatura_status', v_fatura_f.status,
    'fatura_valor_total', v_fatura_f.valor_total,
    'fatura_valor_pago', v_fatura_f.valor_pago,
    'fatura_saldo_pendente', v_fatura_f.saldo_pendente,
    'pagar_retorno', v_res_pagar_f,
    'conta_saldo_pre', v_conta_saldo_pre_f,
    'conta_saldo_pos', v_conta_saldo_pos_f,
    'conta_saldo_delta', (v_conta_saldo_pos_f - v_conta_saldo_pre_f),
    'comprometimento_pre', v_comp_pre_f,
    'comprometimento_pos', v_comp_pos_f,
    'comprometimento_delta', (v_comp_pos_f - v_comp_pre_f),
    'lancamentos_marcados_pagos', v_nao_pagos_count,
    'resultado_previsto_delta', ((v_reg_pos_f->>'saidas_previstas')::numeric - (v_reg_pre_f->>'saidas_previstas')::numeric),
    'resultado_efetivado_delta', ((v_reg_pos_f->>'saidas_efetivadas')::numeric - (v_reg_pre_f->>'saidas_efetivadas')::numeric),
    'orcamento_realizado_delta', ((v_orc_pos_f->>'despesas_efetivado')::numeric - (v_orc_pre_f->>'despesas_efetivado')::numeric)
  );

  -- =========================================================================
  -- TESTE G: Estorno do parcial de 200
  -- =========================================================================
  v_res_estorno_g := public.estornar_fatura_rpc(p_workspace_id, v_fatura_f.id);

  SELECT * INTO v_fatura_g
  FROM public.faturas WHERE id = v_fatura_f.id;

  SELECT saldo_atual INTO v_conta_saldo_pos_g
  FROM public.contas WHERE id = v_conta_id;

  SELECT total_comprometido INTO v_comp_pos_g
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pos_g := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pos_g := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  v_res_g := jsonb_build_object(
    'sucesso', true,
    'estorno_retorno', v_res_estorno_g,
    'fatura_status', v_fatura_g.status,
    'fatura_valor_pago', v_fatura_g.valor_pago,
    'fatura_saldo_pendente', v_fatura_g.saldo_pendente,
    'conta_saldo_pos_g', v_conta_saldo_pos_g,
    'conta_saldo_restaurado_delta', (v_conta_saldo_pos_g - v_conta_saldo_pos_f),
    'comprometimento_pos_g', v_comp_pos_g,
    'comprometimento_restaurado_delta', (v_comp_pos_g - v_comp_pos_f),
    'resultado_previsto_delta', ((v_reg_pos_g->>'saidas_previstas')::numeric - (v_reg_pre_f->>'saidas_previstas')::numeric),
    'resultado_efetivado_delta', ((v_reg_pos_g->>'saidas_efetivadas')::numeric - (v_reg_pre_f->>'saidas_efetivadas')::numeric),
    'orcamento_realizado_delta', ((v_orc_pos_g->>'despesas_efetivado')::numeric - (v_orc_pre_f->>'despesas_efetivado')::numeric)
  );

  -- =========================================================================
  -- TESTE H: Regeneração do pai H (1200 -> 1080) sem passar valor_proprio
  -- =========================================================================
  SELECT * INTO v_pai_h_antes
  FROM public.lancamentos WHERE id = v_pai_h_id;

  SELECT total_comprometido INTO v_comp_pre_h
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pre_h := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pre_h := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  v_res_regenerar_h := public.regenerar_parcelas_lancamento(
    p_workspace_id := p_workspace_id,
    p_lancamento_id := v_pai_h_id,
    p_novo_valor := 1080.00,
    p_nova_data := v_pai_h_antes.data,
    p_nova_quantidade_parcelas := 12,
    p_nova_descricao := 'TESTE H Parcelada 1080 12x',
    p_categoria_id := v_cat_id,
    p_subcategoria_id := v_subcat_id,
    p_novo_cartao_id := v_cartao_id
  );

  SELECT * INTO v_pai_h_depois
  FROM public.lancamentos WHERE id = v_pai_h_id;

  SELECT COUNT(*), COALESCE(SUM(valor), 0)
  INTO v_parc_h_count, v_parc_h_soma
  FROM public.parcelas WHERE lancamento_id = v_pai_h_id;

  SELECT total_comprometido INTO v_comp_pos_h
  FROM public.obter_cartoes_consolidado_rpc(p_workspace_id, false)
  WHERE id = v_cartao_id;

  v_orc_pos_h := public.obter_orcamento_consolidado_rpc(p_workspace_id, '2026-11');
  v_reg_pos_h := public.calcular_regime_competencia_integral_rpc(p_workspace_id, v_dt_inicio, v_dt_fim);

  v_res_h := jsonb_build_object(
    'sucesso', true,
    'regenerar_retorno', v_res_regenerar_h,
    'pai_antes', jsonb_build_object('valor', v_pai_h_antes.valor, 'valor_proprio', v_pai_h_antes.valor_proprio, 'valor_terceiros', v_pai_h_antes.valor_terceiros),
    'pai_depois', jsonb_build_object('valor', v_pai_h_depois.valor, 'valor_proprio', v_pai_h_depois.valor_proprio, 'valor_terceiros', v_pai_h_depois.valor_terceiros),
    'parcelas_count', v_parc_h_count,
    'parcelas_soma', v_parc_h_soma,
    'comprometimento_pre', v_comp_pre_h,
    'comprometimento_pos', v_comp_pos_h,
    'comprometimento_delta', (v_comp_pos_h - v_comp_pre_h),
    'resultado_previsto_delta', ((v_reg_pos_h->>'saidas_previstas')::numeric - (v_reg_pre_h->>'saidas_previstas')::numeric),
    'resultado_efetivado_delta', ((v_reg_pos_h->>'saidas_efetivadas')::numeric - (v_reg_pre_h->>'saidas_efetivadas')::numeric),
    'orcamento_realizado_delta', ((v_orc_pos_h->>'despesas_efetivado')::numeric - (v_orc_pre_h->>'despesas_efetivado')::numeric)
  );

  -- Regeneração de teste C (ida e volta para confirmar integridade)
  SELECT * INTO v_pai_c_antes
  FROM public.lancamentos WHERE id = v_pai_c_id;

  v_res_regenerar_c := public.regenerar_parcelas_lancamento(
    p_workspace_id := p_workspace_id,
    p_lancamento_id := v_pai_c_id,
    p_novo_valor := 1200.00,
    p_nova_data := v_pai_c_antes.data,
    p_nova_quantidade_parcelas := 12,
    p_nova_descricao := 'TESTE C Parcelada Propria 1200 12x',
    p_categoria_id := v_cat_id,
    p_subcategoria_id := v_subcat_id,
    p_novo_cartao_id := v_cartao_id
  );

  SELECT * INTO v_pai_c_depois
  FROM public.lancamentos WHERE id = v_pai_c_id;

  SELECT COUNT(*), COALESCE(SUM(valor), 0)
  INTO v_parc_c_count, v_parc_c_soma
  FROM public.parcelas WHERE lancamento_id = v_pai_c_id;

  -- Teste D conferência
  SELECT * INTO v_pai_d
  FROM public.lancamentos WHERE id = v_pai_d_id;

  SELECT COUNT(*), COALESCE(SUM(valor), 0)
  INTO v_parc_d_count, v_parc_d_soma
  FROM public.parcelas WHERE lancamento_id = v_pai_d_id;

  v_res_cd := jsonb_build_object(
    'pai_c', jsonb_build_object('id', v_pai_c_depois.id, 'valor', v_pai_c_depois.valor, 'valor_proprio', v_pai_c_depois.valor_proprio, 'parcelas', v_parc_c_count, 'soma', v_parc_c_soma),
    'pai_d', jsonb_build_object('id', v_pai_d.id, 'valor', v_pai_d.valor, 'valor_proprio', v_pai_d.valor_proprio, 'valor_terceiros', v_pai_d.valor_terceiros, 'parcelas', v_parc_d_count, 'soma', v_parc_d_soma)
  );

  -- Dado real f953b711
  SELECT * INTO v_dado_f953
  FROM public.lancamentos WHERE id = 'f953b711-4a2a-498f-9a70-1afcb6ae8655'::uuid;

  v_res_f953 := jsonb_build_object(
    'id', v_dado_f953.id,
    'descricao', v_dado_f953.descricao,
    'valor', v_dado_f953.valor,
    'valor_proprio', v_dado_f953.valor_proprio,
    'valor_terceiros', v_dado_f953.valor_terceiros,
    'regime', v_dado_f953.regime,
    'modalidade_saida', v_dado_f953.modalidade_saida
  );

  -- Montar resultado geral
  v_geral := jsonb_build_object(
    'sucesso', true,
    'teste_e', v_res_e,
    'teste_f', v_res_f,
    'teste_g', v_res_g,
    'teste_h', v_res_h,
    'consistencia_cd', v_res_cd,
    'dado_real_f953', v_res_f953
  );

  -- Registrar na auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    p_workspace_id, 'testes_homologacao', p_workspace_id, 'bateria_testes_AH',
    NULL, v_geral, NULL
  );

  RETURN v_geral;
END;
$$;
