-- ============================================================================
-- SAP — Migration: Unificação das sobrecargas de regenerar_parcelas_lancamento
-- e correção de consistência do dado real f953b711-4a2a-498f-9a70-1afcb6ae8655.
--
-- Motivo:
-- 1. As sobrecargas legadas de 10 e 11 argumentos de regenerar_parcelas_lancamento
--    atualizavam apenas `valor` do pai, mantendo `valor_proprio` e `valor_terceiros`
--    antigos/desatualizados, causando divergência entre Orçamento/Resultado
--    (que usam COALESCE(valor_proprio, valor)) e Cartões/Faturas.
-- 2. As sobrecargas legadas agora delegam canonicamente para a função principal
--    recalculando valor_proprio proporcionalmente (ou igualando ao total se próprio = total).
-- 3. A função canônica de 13 argumentos foi aprimorada para calcular competências
--    pelo vencimento/fechamento do cartão (usando calcular_competencia_cartao e somar_meses_competencia)
--    e acionar recalcular_fatura_rpc para todas as competências impactadas.
-- 4. O lançamento real f953b711-4a2a-498f-9a70-1afcb6ae8655 é reparado para
--    valor_proprio = 1080.00 e valor_terceiros = 0.00 com auditoria.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNÇÃO CANÔNICA DE 13 PARÂMETROS
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

    -- Data aproximada da parcela (mês correspondente)
    v_data_parc := make_date(
      EXTRACT(YEAR FROM p_nova_data)::int,
      EXTRACT(MONTH FROM p_nova_data)::int + (v_i - 1),
      LEAST(EXTRACT(DAY FROM p_nova_data)::int, 28)
    );

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

-- ----------------------------------------------------------------------------
-- 2. SOBRECARGA LEGADA DE 11 PARÂMETROS (DELEGA PARA CANÔNICA)
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
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_novo_cartao_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.regenerar_parcelas_lancamento(
    p_workspace_id := p_workspace_id,
    p_lancamento_id := p_lancamento_id,
    p_novo_valor := p_novo_valor,
    p_nova_data := p_nova_data,
    p_nova_quantidade_parcelas := p_nova_quantidade_parcelas,
    p_nova_descricao := p_nova_descricao,
    p_categoria_id := p_categoria_id,
    p_subcategoria_id := p_subcategoria_id,
    p_novo_cartao_id := p_novo_cartao_id,
    p_nova_observacao := p_observacao,
    p_novo_valor_proprio := NULL,
    p_novo_valor_terceiros := NULL,
    p_modalidade_saida := NULL
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. SOBRECARGA LEGADA DE 10 PARÂMETROS (DELEGA PARA CANÔNICA)
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
  p_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.regenerar_parcelas_lancamento(
    p_workspace_id := p_workspace_id,
    p_lancamento_id := p_lancamento_id,
    p_novo_valor := p_novo_valor,
    p_nova_data := p_nova_data,
    p_nova_quantidade_parcelas := p_nova_quantidade_parcelas,
    p_nova_descricao := p_nova_descricao,
    p_categoria_id := p_categoria_id,
    p_subcategoria_id := p_subcategoria_id,
    p_novo_cartao_id := NULL,
    p_nova_observacao := p_observacao,
    p_novo_valor_proprio := NULL,
    p_novo_valor_terceiros := NULL,
    p_modalidade_saida := NULL
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. REPARO DO DADO REAL f953b711-4a2a-498f-9a70-1afcb6ae8655
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT * INTO v_rec
  FROM public.lancamentos
  WHERE id = 'f953b711-4a2a-498f-9a70-1afcb6ae8655'::uuid;

  IF FOUND THEN
    UPDATE public.lancamentos
    SET valor_proprio = valor,
        valor_terceiros = 0,
        updated_at = NOW()
    WHERE id = 'f953b711-4a2a-498f-9a70-1afcb6ae8655'::uuid;

    INSERT INTO public.auditoria_operacoes (
      workspace_id,
      entidade,
      entidade_id,
      acao,
      estado_anterior,
      estado_posterior,
      created_by
    ) VALUES (
      v_rec.workspace_id,
      'lancamentos',
      v_rec.id,
      'reparo_valor_proprio_bug_teste_h',
      jsonb_build_object('valor', v_rec.valor, 'valor_proprio', v_rec.valor_proprio, 'valor_terceiros', v_rec.valor_terceiros),
      jsonb_build_object('valor', v_rec.valor, 'valor_proprio', v_rec.valor, 'valor_terceiros', 0),
      v_rec.created_by
    );
  END IF;
END $$;
