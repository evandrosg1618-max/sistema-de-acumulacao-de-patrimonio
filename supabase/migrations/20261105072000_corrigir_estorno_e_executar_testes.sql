-- ============================================================================
-- Migration: Corrigir estornar_fatura_rpc, regenerar_parcelas_lancamento (cálculo de data_parc)
-- e executar a RPC executar_bateria_testes_e_f_g_h_rpc
-- ============================================================================

-- 1. Corrigir estornar_fatura_rpc (movimentacoes_conta não possui updated_at)
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

    -- movimentacoes_conta não possui updated_at
    UPDATE public.movimentacoes_conta
    SET descricao = COALESCE(descricao, '') || ' [ESTORNADO]'
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

-- 2. Corrigir a função canônica regenerar_parcelas_lancamento (cálculo robusto de v_data_parc usando intervalos)
CREATE OR REPLACE FUNCTION public.regenerar_parcelas_lancamento(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_novo_valor numeric,
  p_nova_data date,
  p_nova_quantidade_parcelas integer,
  p_nova_descricao text,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_subcategoria_id uuid DEFAULT NULL::uuid,
  p_novo_cartao_id uuid DEFAULT NULL::uuid,
  p_nova_observacao text DEFAULT NULL::text,
  p_novo_valor_proprio numeric DEFAULT NULL::numeric,
  p_novo_valor_terceiros numeric DEFAULT NULL::numeric,
  p_modalidade_saida text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig RECORD;
  v_pai_id uuid;
  v_cartao RECORD;
  v_cartao_antigo_id uuid;
  v_cartao_final_id uuid;
  v_dia_fech int;
  v_dia_venc int;
  v_comp_inicial text;
  v_fatura_paga RECORD;
  v_valor_total numeric;
  v_valor_proprio numeric;
  v_valor_terceiros numeric;
  v_modalidade text;
  v_desc_limpa text;
  v_valor_base numeric;
  v_residuo numeric;
  v_i int;
  v_comp text;
  v_data_parc date;
  v_competencias_afetadas text[] := ARRAY[]::text[];
  v_c text;
  v_total_parcelas_soma numeric;
  v_diff_parc numeric;
  v_deleted_ids uuid[];
  v_estado_anterior jsonb;
BEGIN
  IF p_novo_valor IS NULL OR p_novo_valor <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Valor total deve ser maior que zero');
  END IF;
  IF p_nova_quantidade_parcelas IS NULL OR p_nova_quantidade_parcelas < 1 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Quantidade de parcelas deve ser ao menos 1');
  END IF;

  -- 1. Localizar lançamento (se informado filho, resolve para o pai)
  SELECT * INTO v_orig
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento não encontrado');
  END IF;

  v_pai_id := COALESCE(v_orig.lancamento_pai_id, v_orig.id);

  IF v_pai_id <> v_orig.id THEN
    SELECT * INTO v_orig
    FROM public.lancamentos
    WHERE id = v_pai_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Lançamento pai não encontrado');
    END IF;
  END IF;

  v_cartao_antigo_id := v_orig.cartao_id;
  v_cartao_final_id := COALESCE(p_novo_cartao_id, v_orig.cartao_id);

  IF v_cartao_final_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'A compra parcelada exige vínculo a um cartão de crédito');
  END IF;

  v_estado_anterior := to_jsonb(v_orig);

  -- 2. BLOQUEIO: verificar se qualquer fatura vinculada está paga
  FOR v_fatura_paga IN
    SELECT DISTINCT f.competencia
    FROM public.parcelas p
    JOIN public.faturas f ON f.cartao_id = p.cartao_id 
                         AND f.competencia = p.competencia 
                         AND f.workspace_id = p.workspace_id
    WHERE p.lancamento_id = v_pai_id
      AND p.workspace_id = p_workspace_id
      AND f.status = 'paga'
  LOOP
    RETURN jsonb_build_object(
      'sucesso', false,
      'bloqueado', true,
      'mensagem', 'A fatura de ' || v_fatura_paga.competencia || ' já está paga e contém parcelas desta compra. Para editar, desfaça o pagamento da fatura na tela de Cartões.'
    );
  END LOOP;

  -- Dados do cartão para cálculo de competências
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = v_cartao_final_id AND workspace_id = p_workspace_id;

  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);

  -- Coletar competências antigas
  SELECT ARRAY_AGG(DISTINCT p.competencia), ARRAY_AGG(p.id)
  INTO v_competencias_afetadas, v_deleted_ids
  FROM public.parcelas p
  WHERE p.lancamento_id = v_pai_id AND p.workspace_id = p_workspace_id;

  IF v_competencias_afetadas IS NULL THEN
    v_competencias_afetadas := ARRAY[]::text[];
  END IF;

  IF v_orig.competencia IS NOT NULL AND NOT (v_orig.competencia = ANY(v_competencias_afetadas)) THEN
    v_competencias_afetadas := array_append(v_competencias_afetadas, v_orig.competencia);
  END IF;

  v_valor_total := ROUND(p_novo_valor, 2);
  v_modalidade := COALESCE(p_modalidade_saida, v_orig.modalidade_saida, 'compra_propria');

  -- Valor Próprio e Terceiros:
  IF p_novo_valor_proprio IS NOT NULL AND p_novo_valor_proprio > 0 THEN
    v_valor_proprio := ROUND(p_novo_valor_proprio, 2);
  ELSE
    IF COALESCE(v_orig.valor_proprio, 0) > 0 AND COALESCE(v_orig.valor, 0) > 0 THEN
      v_valor_proprio := ROUND((v_orig.valor_proprio / v_orig.valor) * v_valor_total, 2);
    ELSE
      v_valor_proprio := v_valor_total;
    END IF;
  END IF;

  IF v_valor_proprio > v_valor_total THEN
    v_valor_proprio := v_valor_total;
  END IF;

  IF COALESCE(p_novo_valor_terceiros, -1) >= 0 THEN
    v_valor_terceiros := ROUND(p_novo_valor_terceiros, 2);
  ELSE
    v_valor_terceiros := GREATEST(v_valor_total - v_valor_proprio, 0);
  END IF;

  v_desc_limpa := REGEXP_REPLACE(TRIM(p_nova_descricao), '\s*\(\d+\/\d+\)$', '', 'g');
  v_comp_inicial := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);

  -- Atualizar o lançamento pai
  UPDATE public.lancamentos
  SET
    descricao = v_desc_limpa,
    valor = v_valor_total,
    valor_proprio = v_valor_proprio,
    valor_terceiros = v_valor_terceiros,
    data = p_nova_data,
    competencia = v_comp_inicial,
    cartao_id = v_cartao_final_id,
    meio_pagamento_tipo = 'CARTAO',
    quantidade_parcelas = p_nova_quantidade_parcelas,
    total_parcelas = p_nova_quantidade_parcelas,
    numero_parcela = 1,
    regime = 'parcelado',
    modalidade_saida = v_modalidade,
    lancamento_pai_id = v_pai_id,
    categoria_id = COALESCE(p_categoria_id, v_orig.categoria_id),
    subcategoria_id = p_subcategoria_id,
    observacao = COALESCE(p_nova_observacao, v_orig.observacao),
    status_pagamento = 'pendente',
    data_pagamento = NULL,
    updated_at = NOW()
  WHERE id = v_pai_id AND workspace_id = p_workspace_id;

  -- Soft delete em filhos antigos na tabela lancamentos
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE lancamento_pai_id = v_pai_id
    AND id <> v_pai_id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  -- Deletar parcelas antigas
  DELETE FROM public.parcelas
  WHERE lancamento_id = v_pai_id
    AND workspace_id = p_workspace_id;

  -- Regenerar parcelas
  v_valor_base := TRUNC((v_valor_total / p_nova_quantidade_parcelas), 2);
  v_residuo := ROUND(v_valor_total - (v_valor_base * p_nova_quantidade_parcelas), 2);

  FOR v_i IN 1..p_nova_quantidade_parcelas LOOP
    v_comp := public.somar_meses_competencia(v_comp_inicial, v_i - 1);

    IF NOT (v_comp = ANY(v_competencias_afetadas)) THEN
      v_competencias_afetadas := array_append(v_competencias_afetadas, v_comp);
    END IF;

    -- Data aproximada da parcela calculada com adição de meses segura (evita mês 13)
    v_data_parc := (p_nova_data + ((v_i - 1) || ' month')::interval)::date;

    INSERT INTO public.parcelas (
      workspace_id,
      lancamento_id,
      numero_parcela,
      total_parcelas,
      valor,
      competencia,
      data_vencimento,
      cartao_id,
      status
    ) VALUES (
      p_workspace_id,
      v_pai_id,
      v_i,
      p_nova_quantidade_parcelas,
      CASE WHEN v_i = 1 THEN v_valor_base + v_residuo ELSE v_valor_base END,
      v_comp,
      v_data_parc,
      v_cartao_final_id,
      'pendente'
    );
  END LOOP;

  -- Consistência: conferir soma das parcelas
  SELECT COALESCE(SUM(valor), 0) INTO v_total_parcelas_soma
  FROM public.parcelas
  WHERE lancamento_id = v_pai_id AND workspace_id = p_workspace_id;

  v_diff_parc := v_total_parcelas_soma - v_valor_total;
  IF ABS(v_diff_parc) > 0.01 THEN
    RAISE EXCEPTION 'Regeneração inconsistente: soma das parcelas (%) difere do valor total (%)', v_total_parcelas_soma, v_valor_total;
  END IF;

  -- Recalcular faturas impactadas
  IF v_cartao_antigo_id IS NOT NULL AND v_cartao_antigo_id <> v_cartao_final_id THEN
    FOREACH v_c IN ARRAY v_competencias_afetadas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_antigo_id, v_c);
    END LOOP;
  END IF;

  FOREACH v_c IN ARRAY v_competencias_afetadas LOOP
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_final_id, v_c);
  END LOOP;

  -- Auditoria
  INSERT INTO public.auditoria_operacoes (
    workspace_id,
    entidade,
    entidade_id,
    acao,
    estado_anterior,
    estado_posterior,
    created_by
  ) VALUES (
    p_workspace_id,
    'lancamentos',
    v_pai_id,
    'regenerar_parcelas',
    v_estado_anterior,
    jsonb_build_object(
      'valor', v_valor_total,
      'valor_proprio', v_valor_proprio,
      'valor_terceiros', v_valor_terceiros,
      'quantidade_parcelas', p_nova_quantidade_parcelas,
      'faturas_recalculadas', v_competencias_afetadas
    ),
    (SELECT created_by FROM public.lancamentos WHERE id = v_pai_id)
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'lancamento_id', v_pai_id,
    'pai_id', v_pai_id,
    'valor', v_valor_total,
    'valor_total', v_valor_total,
    'valor_proprio', v_valor_proprio,
    'valor_terceiros', v_valor_terceiros,
    'quantidade_parcelas', p_nova_quantidade_parcelas,
    'total_parcelas', p_nova_quantidade_parcelas,
    'faturas_recalculadas', v_competencias_afetadas
  );
END;
$$;

-- 3. Atualizar a RPC executar_bateria_testes_e_f_g_h_rpc
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
  -- TESTE H: Regeneração do pai H (1200 -> 1080)
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
    p_novo_valor := 1080.00::numeric,
    p_nova_data := v_pai_h_antes.data,
    p_nova_quantidade_parcelas := 12::integer,
    p_nova_descricao := 'TESTE H Parcelada 1080 12x'::text,
    p_categoria_id := v_cat_id,
    p_subcategoria_id := v_subcat_id,
    p_novo_cartao_id := v_cartao_id,
    p_nova_observacao := NULL::text,
    p_novo_valor_proprio := NULL::numeric,
    p_novo_valor_terceiros := NULL::numeric,
    p_modalidade_saida := NULL::text
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
    p_novo_valor := 1200.00::numeric,
    p_nova_data := v_pai_c_antes.data,
    p_nova_quantidade_parcelas := 12::integer,
    p_nova_descricao := 'TESTE C Parcelada Propria 1200 12x'::text,
    p_categoria_id := v_cat_id,
    p_subcategoria_id := v_subcat_id,
    p_novo_cartao_id := v_cartao_id,
    p_nova_observacao := NULL::text,
    p_novo_valor_proprio := NULL::numeric,
    p_novo_valor_terceiros := NULL::numeric,
    p_modalidade_saida := NULL::text
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

-- 4. Execução da bateria de testes e registro de auditoria
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.executar_bateria_testes_e_f_g_h_rpc('d44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid);

  INSERT INTO public.auditoria_operacoes (
    workspace_id, entidade, entidade_id, acao, estado_anterior, estado_posterior, created_by
  ) VALUES (
    'd44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid,
    'relatorio_bateria_testes_efgh',
    'd44cda7f-3c56-4770-afe0-0f6318302fc9'::uuid,
    'execucao_homologada',
    NULL,
    v_res,
    NULL
  );
END $$;
