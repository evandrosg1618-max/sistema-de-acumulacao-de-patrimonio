-- Migration: 20261025010000_build_5_segunda_rodada_homologacao.sql
-- Correções da bateria de 20 testes do SAP:
-- 1. RPC converter_regime_lancamento_rpc idempotente e completa (suporte a transferência, troca de cartão, remoção de série, escopo Todos)
-- 2. Atualização em alterar_fixo_escopo_rpc (respeitar p_pago_primeira se informado na edição, trocar cartão/conta corretamente)
-- 3. Atualização em regenerar_parcelas_lancamento (suporte à troca de cartão)
-- 4. Ajuste em recalcular_fatura_rpc e obter_cartoes_consolidado_rpc para regra do lançamento único no cartão gerar parcela na fatura

-- 1. Migration da função de conversão de regime
CREATE OR REPLACE FUNCTION public.converter_regime_lancamento_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_novo_regime text, -- 'unico', 'fixo', 'parcelado'
  p_nova_descricao text,
  p_novo_valor numeric,
  p_nova_data date,
  p_novo_meio_pagamento text,
  p_nova_conta_origem uuid DEFAULT NULL::uuid,
  p_nova_conta_destino uuid DEFAULT NULL::uuid,
  p_novo_cartao_id uuid DEFAULT NULL::uuid,
  p_nova_categoria_id uuid DEFAULT NULL::uuid,
  p_nova_subcategoria_id uuid DEFAULT NULL::uuid,
  p_nova_observacao text DEFAULT NULL::text,
  p_nova_quantidade_parcelas int DEFAULT 1,
  p_novo_prazo text DEFAULT 'indeterminado',
  p_nova_periodicidade text DEFAULT 'mensal',
  p_novo_total_ocorrencias int DEFAULT 12,
  p_pago_primeira boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_regime_atual text;
  v_res jsonb;
  v_cartao RECORD;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_comp_base text;
  v_data_cur date;
  v_passo int := 1;
  v_comp_cur text;
  v_c text;
  v_faturas_afetadas text[] := ARRAY[]::text[];
  v_valor_parc numeric;
  v_dif_centavos numeric;
  v_valor_base numeric;
  v_fatura_paga RECORD;
  v_novo_pai_id uuid;
BEGIN
  -- 1. Travar lançamento para atualização com SELECT FOR UPDATE
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  v_regime_atual := COALESCE(v_lanc.regime, 'unico');

  -- Validação de faturas quitadas se for cartão
  IF v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
    FOR v_fatura_paga IN
      SELECT competencia FROM public.faturas
      WHERE cartao_id = v_lanc.cartao_id AND competencia = v_lanc.competencia AND workspace_id = p_workspace_id AND status = 'paga'
    LOOP
      RAISE EXCEPTION 'A fatura de % já está quitada. Desfaça o pagamento da fatura para converter ou alterar este lançamento.',
        v_fatura_paga.competencia;
    END LOOP;
  END IF;

  -- ========================================================
  -- CASO 1: Conversão para 'unico' (a partir de fixo ou parcelado)
  -- ========================================================
  IF p_novo_regime = 'unico' THEN
    -- A. Se era fixo com série
    IF v_lanc.serie_id IS NOT NULL THEN
      -- Se houver recorrências pagas que NÃO sejam este lançamento, preservá-las
      -- e excluir APENAS as recorrências NÃO PAGAS da série
      UPDATE public.lancamentos
      SET deleted_at = NOW(),
          status_pagamento = 'cancelado',
          updated_at = NOW()
      WHERE serie_id = v_lanc.serie_id
        AND id <> v_lanc.id
        AND workspace_id = p_workspace_id
        AND NOT (status_pagamento = 'pago');

      -- Desativar a série
      UPDATE public.series_lancamentos
      SET ativo = false, updated_at = NOW()
      WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
    END IF;

    -- B. Se era parcelado
    IF v_regime_atual = 'parcelado' OR v_lanc.lancamento_pai_id IS NOT NULL OR (v_lanc.total_parcelas > 1) THEN
      DECLARE
        v_pai uuid := COALESCE(v_lanc.lancamento_pai_id, v_lanc.id);
      BEGIN
        -- Excluir parcelas não pagas (filhos)
        UPDATE public.lancamentos
        SET deleted_at = NOW(),
            status_pagamento = 'cancelado',
            updated_at = NOW()
        WHERE (lancamento_pai_id = v_pai OR id = v_pai)
          AND id <> v_lanc.id
          AND workspace_id = p_workspace_id
          AND NOT (status_pagamento = 'pago');

        -- Limpar tabela parcelas associadas exceto se pagas
        DELETE FROM public.parcelas
        WHERE lancamento_id = v_pai
          AND workspace_id = p_workspace_id
          AND status <> 'pago';
      END;
    END IF;

    -- Calcular nova competência
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      SELECT dia_fechamento, dia_vencimento INTO v_cartao
      FROM public.cartoes WHERE id = p_novo_cartao_id AND workspace_id = p_workspace_id;
      IF FOUND THEN
        v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
        v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
      END IF;
      v_comp_base := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_base := TO_CHAR(p_nova_data, 'YYYY-MM');
    END IF;

    -- Atualizar o lançamento em si para ÚNICO
    UPDATE public.lancamentos
    SET regime = 'unico',
        serie_id = NULL,
        lancamento_pai_id = NULL,
        numero_parcela = 1,
        total_parcelas = 1,
        quantidade_parcelas = 1,
        descricao = TRIM(p_nova_descricao),
        valor = p_novo_valor,
        data = p_nova_data,
        competencia = v_comp_base,
        meio_pagamento_tipo = p_novo_meio_pagamento,
        conta_origem_id = p_nova_conta_origem,
        conta_destino_id = p_nova_conta_destino,
        cartao_id = p_novo_cartao_id,
        categoria_id = p_nova_categoria_id,
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        natureza_previsao = false,
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Se for no cartão, garantir exatamente 1 parcela na tabela parcelas
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      DELETE FROM public.parcelas WHERE lancamento_id = v_lanc.id AND workspace_id = p_workspace_id;
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
        v_lanc.id,
        1,
        1,
        p_novo_valor,
        v_comp_base,
        p_nova_data,
        p_novo_cartao_id,
        'pendente'
      );
    ELSE
      DELETE FROM public.parcelas WHERE lancamento_id = v_lanc.id AND workspace_id = p_workspace_id;
    END IF;

    -- Recalcular faturas impactadas
    IF v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_lanc.cartao_id, v_lanc.competencia);
    END IF;
    IF p_novo_cartao_id IS NOT NULL AND v_comp_base IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_novo_cartao_id, v_comp_base);
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'novo_regime', 'unico',
      'lancamento_id', v_lanc.id
    );
  END IF;

  -- ========================================================
  -- CASO 2: Conversão para 'fixo' (a partir de único ou parcelado)
  -- ========================================================
  IF p_novo_regime = 'fixo' THEN
    -- Se vinha de parcelado, limpar parcelas antigas não pagas
    IF v_regime_atual = 'parcelado' OR v_lanc.lancamento_pai_id IS NOT NULL THEN
      DECLARE
        v_pai uuid := COALESCE(v_lanc.lancamento_pai_id, v_lanc.id);
      BEGIN
        UPDATE public.lancamentos
        SET deleted_at = NOW(),
            status_pagamento = 'cancelado',
            updated_at = NOW()
        WHERE (lancamento_pai_id = v_pai OR id = v_pai)
          AND id <> v_lanc.id
          AND workspace_id = p_workspace_id
          AND NOT (status_pagamento = 'pago');
        DELETE FROM public.parcelas WHERE lancamento_id = v_pai AND workspace_id = p_workspace_id;
      END;
    END IF;

    -- Se o lançamento original estava pago no banco, estornar movimentação anterior para que
    -- a criação da série processe a conta certa de forma limpa e atômica
    IF v_lanc.status_pagamento = 'pago' AND v_lanc.meio_pagamento_tipo <> 'CARTAO' THEN
      IF v_lanc.tipo = 'despesa' AND v_lanc.conta_origem_id IS NOT NULL THEN
        UPDATE public.contas SET saldo_atual = saldo_atual + v_lanc.valor, updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
      ELSIF v_lanc.tipo = 'receita' AND v_lanc.conta_origem_id IS NOT NULL THEN
        UPDATE public.contas SET saldo_atual = saldo_atual - v_lanc.valor, updated_at = NOW()
        WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
      ELSIF v_lanc.tipo = 'transferencia' THEN
        IF v_lanc.conta_origem_id IS NOT NULL THEN
          UPDATE public.contas SET saldo_atual = saldo_atual + v_lanc.valor, updated_at = NOW()
          WHERE id = v_lanc.conta_origem_id AND workspace_id = p_workspace_id;
        END IF;
        IF v_lanc.conta_destino_id IS NOT NULL THEN
          UPDATE public.contas SET saldo_atual = saldo_atual - v_lanc.valor, updated_at = NOW()
          WHERE id = v_lanc.conta_destino_id AND workspace_id = p_workspace_id;
        END IF;
      END IF;
      DELETE FROM public.movimentacoes_conta WHERE lancamento_id = v_lanc.id AND workspace_id = p_workspace_id;
    END IF;

    -- Criar a série fixa completa
    v_res := public.criar_serie_fixa_rpc(
      p_workspace_id := p_workspace_id,
      p_tipo := v_lanc.tipo,
      p_descricao := p_nova_descricao,
      p_valor := p_novo_valor,
      p_data_inicio := p_nova_data,
      p_prazo := COALESCE(p_novo_prazo, 'indeterminado'),
      p_periodicidade := COALESCE(p_nova_periodicidade, 'mensal'),
      p_quantidade_total := CASE WHEN p_novo_prazo = 'determinado' THEN p_novo_total_ocorrencias ELSE NULL END,
      p_meio_pagamento_tipo := p_novo_meio_pagamento,
      p_conta_origem_id := p_nova_conta_origem,
      p_conta_destino_id := p_nova_conta_destino,
      p_cartao_id := p_novo_cartao_id,
      p_categoria_id := p_nova_categoria_id,
      p_subcategoria_id := p_nova_subcategoria_id,
      p_observacao := p_nova_observacao,
      p_pago_primeira := COALESCE(p_pago_primeira, (v_lanc.status_pagamento = 'pago')),
      p_user_id := p_user_id
    );

    -- Cancelar/excluir o lançamento único antigo que virou série
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    DELETE FROM public.parcelas WHERE lancamento_id = v_lanc.id AND workspace_id = p_workspace_id;

    IF v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_lanc.cartao_id, v_lanc.competencia);
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'novo_regime', 'fixo',
      'serie_id', v_res->>'serie_id'
    );
  END IF;

  -- ========================================================
  -- CASO 3: Conversão para 'parcelado' (a partir de único ou fixo)
  -- ========================================================
  IF p_novo_regime = 'parcelado' THEN
    -- Se vinha de fixo com série, desativar série
    IF v_lanc.serie_id IS NOT NULL THEN
      UPDATE public.lancamentos
      SET deleted_at = NOW(),
          status_pagamento = 'cancelado',
          updated_at = NOW()
      WHERE serie_id = v_lanc.serie_id
        AND id <> v_lanc.id
        AND workspace_id = p_workspace_id
        AND NOT (status_pagamento = 'pago');

      UPDATE public.series_lancamentos
      SET ativo = false, updated_at = NOW()
      WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
    END IF;

    -- Obter dia de fechamento/vencimento se cartão
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      SELECT dia_fechamento, dia_vencimento INTO v_cartao
      FROM public.cartoes WHERE id = p_novo_cartao_id AND workspace_id = p_workspace_id;
      IF FOUND THEN
        v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
        v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
      END IF;
      v_comp_base := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_base := TO_CHAR(p_nova_data, 'YYYY-MM');
    END IF;

    v_valor_base := TRUNC((p_novo_valor / GREATEST(1, p_nova_quantidade_parcelas)), 2);
    v_dif_centavos := ROUND((p_novo_valor - (v_valor_base * GREATEST(1, p_nova_quantidade_parcelas))), 2);
    v_valor_parc := v_valor_base;
    IF p_nova_quantidade_parcelas = 1 THEN
      v_valor_parc := v_valor_base + v_dif_centavos;
    END IF;

    -- Se for no cartão: o lançamento original guarda o total (p_novo_valor), e NUNCA aparece na fatura
    -- O lançamento original é a raiz (lancamento_pai_id = v_lanc.id)
    UPDATE public.lancamentos
    SET regime = 'parcelado',
        serie_id = NULL,
        lancamento_pai_id = v_lanc.id,
        numero_parcela = 1,
        total_parcelas = p_nova_quantidade_parcelas,
        quantidade_parcelas = p_nova_quantidade_parcelas,
        descricao = TRIM(p_nova_descricao) || ' (1/' || p_nova_quantidade_parcelas || ')',
        valor = CASE WHEN p_novo_meio_pagamento = 'CARTAO' THEN p_novo_valor ELSE v_valor_parc END,
        data = p_nova_data,
        competencia = v_comp_base,
        meio_pagamento_tipo = p_novo_meio_pagamento,
        conta_origem_id = p_nova_conta_origem,
        conta_destino_id = p_nova_conta_destino,
        cartao_id = p_novo_cartao_id,
        categoria_id = p_nova_categoria_id,
        subcategoria_id = p_nova_subcategoria_id,
        observacao = p_nova_observacao,
        status_pagamento = CASE WHEN p_novo_meio_pagamento = 'CARTAO' THEN 'pendente' ELSE (CASE WHEN p_pago_primeira THEN 'pago' ELSE 'pendente' END) END,
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Limpar parcelas antigas
    DELETE FROM public.parcelas WHERE lancamento_id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Inserir parcela 1 na tabela parcelas (se cartão)
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
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
        v_lanc.id,
        1,
        p_nova_quantidade_parcelas,
        v_valor_parc,
        v_comp_base,
        p_nova_data,
        p_novo_cartao_id,
        'pendente'
      );
      v_faturas_afetadas := array_append(v_faturas_afetadas, v_comp_base);
    END IF;

    -- Gerar parcelas 2 a N
    FOR v_passo IN 2..p_nova_quantidade_parcelas LOOP
      v_data_cur := (p_nova_data + ((v_passo - 1) || ' month')::interval)::date;
      IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
        v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
      ELSE
        v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
      END IF;

      IF v_passo = p_nova_quantidade_parcelas THEN
        v_valor_parc := v_valor_base + v_dif_centavos;
      ELSE
        v_valor_parc := v_valor_base;
      END IF;

      INSERT INTO public.lancamentos (
        workspace_id,
        tipo,
        regime,
        lancamento_pai_id,
        numero_parcela,
        total_parcelas,
        quantidade_parcelas,
        descricao,
        valor,
        data,
        competencia,
        meio_pagamento_tipo,
        conta_origem_id,
        conta_destino_id,
        cartao_id,
        categoria_id,
        subcategoria_id,
        status_pagamento,
        observacao,
        created_by
      ) VALUES (
        p_workspace_id,
        v_lanc.tipo,
        'parcelado',
        v_lanc.id,
        v_passo,
        p_nova_quantidade_parcelas,
        p_nova_quantidade_parcelas,
        TRIM(p_nova_descricao) || ' (' || v_passo || '/' || p_nova_quantidade_parcelas || ')',
        v_valor_parc,
        v_data_cur,
        v_comp_cur,
        p_novo_meio_pagamento,
        p_nova_conta_origem,
        p_nova_conta_destino,
        p_novo_cartao_id,
        p_nova_categoria_id,
        p_nova_subcategoria_id,
        'pendente',
        p_nova_observacao,
        p_user_id
      );

      IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
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
          v_lanc.id,
          v_passo,
          p_nova_quantidade_parcelas,
          v_valor_parc,
          v_comp_cur,
          v_data_cur,
          p_novo_cartao_id,
          'pendente'
        );

        IF NOT (v_comp_cur = ANY(v_faturas_afetadas)) THEN
          v_faturas_afetadas := array_append(v_faturas_afetadas, v_comp_cur);
        END IF;
      END IF;
    END LOOP;

    -- Recalcular faturas impactadas
    IF p_novo_meio_pagamento = 'CARTAO' AND p_novo_cartao_id IS NOT NULL THEN
      FOREACH v_c IN ARRAY v_faturas_afetadas LOOP
        PERFORM public.recalcular_fatura_rpc(p_workspace_id, p_novo_cartao_id, v_c);
      END LOOP;
    END IF;

    IF v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_lanc.cartao_id, v_lanc.competencia);
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'novo_regime', 'parcelado',
      'lancamento_pai_id', v_lanc.id,
      'faturas_recalculadas', v_faturas_afetadas
    );
  END IF;

  RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Regime não reconhecido');
END;
$$;


-- 2. Atualizar regenerar_parcelas_lancamento para aceitar p_novo_cartao_id (caso o usuário troque o cartão)
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
DECLARE
  v_orig RECORD;
  v_cartao RECORD;
  v_pai_id uuid;
  v_cartao_final_id uuid;
  v_cartao_antigo_id uuid;
  v_dia_fech int;
  v_dia_venc int;
  v_comp_inicial text;
  v_fatura_paga RECORD;
  v_valor_base numeric;
  v_dif_centavos numeric;
  v_valor_parcela numeric;
  v_i int;
  v_comp text;
  v_competencias_afetadas text[] := ARRAY[]::text[];
  v_c text;
  v_desc_limpa text;
  v_estado_anterior jsonb;
BEGIN
  -- 1. Localizar lançamento original (se chamado com id de filho, resolve para o pai)
  SELECT * INTO v_orig
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  v_pai_id := COALESCE(v_orig.lancamento_pai_id, v_orig.id);

  IF v_pai_id <> v_orig.id THEN
    SELECT * INTO v_orig
    FROM public.lancamentos
    WHERE id = v_pai_id AND workspace_id = p_workspace_id
    FOR UPDATE;
  END IF;

  v_cartao_antigo_id := v_orig.cartao_id;
  v_cartao_final_id := COALESCE(p_novo_cartao_id, v_orig.cartao_id);

  IF v_cartao_final_id IS NULL THEN
    RAISE EXCEPTION 'A compra parcelada exige vínculo a um cartão de crédito';
  END IF;

  v_estado_anterior := to_jsonb(v_orig);

  -- 2. BLOQUEIO ÚNICO: verificar se QUALQUER fatura vinculada ao lançamento (atual ou anterior) está paga
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
    RAISE EXCEPTION 'A fatura de % já está paga e contém parcelas desta compra. Para editar, desfaça o pagamento da fatura de % na tela de Cartões.',
      v_fatura_paga.competencia, v_fatura_paga.competencia;
  END LOOP;

  -- Buscar dados do cartão novo/final
  SELECT id, dia_fechamento, dia_vencimento INTO v_cartao
  FROM public.cartoes
  WHERE id = v_cartao_final_id AND workspace_id = p_workspace_id;

  v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
  v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);

  -- Coletar competências antigas antes de deletar
  SELECT ARRAY_AGG(DISTINCT p.competencia)
  INTO v_competencias_afetadas
  FROM public.parcelas p
  WHERE p.lancamento_id = v_pai_id;

  IF v_competencias_afetadas IS NULL THEN
    v_competencias_afetadas := ARRAY[]::text[];
  END IF;

  v_desc_limpa := REGEXP_REPLACE(TRIM(p_nova_descricao), '\s*\(\d+\/\d+\)$', '', 'g');
  v_comp_inicial := public.calcular_competencia_cartao(p_nova_data, v_dia_fech, v_dia_venc);

  -- Atualizar o lançamento original pai
  UPDATE public.lancamentos
  SET
    descricao = v_desc_limpa,
    valor = ROUND(p_novo_valor, 2),
    data = p_nova_data,
    competencia = v_comp_inicial,
    cartao_id = v_cartao_final_id,
    meio_pagamento_tipo = 'CARTAO',
    quantidade_parcelas = p_nova_quantidade_parcelas,
    total_parcelas = p_nova_quantidade_parcelas,
    numero_parcela = 1,
    regime = 'parcelado',
    lancamento_pai_id = v_pai_id,
    categoria_id = COALESCE(p_categoria_id, v_orig.categoria_id),
    subcategoria_id = p_subcategoria_id,
    observacao = p_observacao,
    updated_at = NOW()
  WHERE id = v_pai_id AND workspace_id = p_workspace_id;

  -- Limpar lançamentos filhos antigos em lancamentos
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
  v_valor_base := TRUNC((p_novo_valor / p_nova_quantidade_parcelas), 2);
  v_dif_centavos := ROUND((p_novo_valor - (v_valor_base * p_nova_quantidade_parcelas)), 2);

  FOR v_i IN 1..p_nova_quantidade_parcelas LOOP
    v_comp := public.somar_meses_competencia(v_comp_inicial, v_i - 1);

    IF NOT (v_comp = ANY(v_competencias_afetadas)) THEN
      v_competencias_afetadas := array_append(v_competencias_afetadas, v_comp);
    END IF;

    IF v_i = p_nova_quantidade_parcelas THEN
      v_valor_parcela := v_valor_base + v_dif_centavos;
    ELSE
      v_valor_parcela := v_valor_base;
    END IF;

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
      v_valor_parcela,
      v_comp,
      p_nova_data,
      v_cartao_final_id,
      'pendente'
    );
  END LOOP;

  -- Recalcular faturas no cartão antigo se mudou
  IF v_cartao_antigo_id IS NOT NULL AND v_cartao_antigo_id <> v_cartao_final_id THEN
    FOREACH v_c IN ARRAY v_competencias_afetadas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_antigo_id, v_c);
    END LOOP;
  END IF;

  -- Recalcular faturas no cartão novo/final
  FOREACH v_c IN ARRAY v_competencias_afetadas LOOP
    PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_final_id, v_c);
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pai_id', v_pai_id,
    'cartao_id', v_cartao_final_id,
    'total_parcelas', p_nova_quantidade_parcelas,
    'valor_total', p_novo_valor,
    'faturas_recalculadas', v_competencias_afetadas
  );
END;
$$;


-- 3. Regra do Lançamento Único no Cartão:
-- Na fatura do cartão, SOMENTE devem somar:
--  - As cotas da tabela `parcelas`
--  - Lançamentos recorrentes ('fixo') da próxima competência a vencer
-- Lançamentos únicos no cartão geram UMA cota na tabela `parcelas`, logo o lançamento avulso em `lancamentos`
-- NUNCA deve ser somado em duplicidade com a tabela `parcelas`.
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

  -- 1. Soma cotas da tabela 'parcelas' desta competência (inclui cotas de parcelados E cotas únicas)
  SELECT COALESCE(SUM(p.valor), 0)
  INTO v_total_parcelas
  FROM public.parcelas p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  WHERE p.workspace_id = p_workspace_id
    AND p.cartao_id = p_cartao_id
    AND p.competencia = p_competencia
    AND l.deleted_at IS NULL;

  -- 2. Soma compras únicas no cartão que porventura NÃO tenham parcela gerada
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


-- 4. Atualizar obter_cartoes_consolidado_rpc para refletir a mesma regra
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
  avulsos_sem_parcela AS (
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
      AND NOT EXISTS (
        SELECT 1 FROM public.parcelas p WHERE p.lancamento_id = l.id
      )
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
    GREATEST(0, COALESCE(pp.total_parcelas, 0) + COALESCE(asp.total_avulso, 0) + COALESCE(rp.total_recorrente, 0))::numeric AS total_comprometido
  FROM public.cartoes c
  LEFT JOIN proxima_fatura pf ON pf.cartao_id = c.id
  LEFT JOIN faturas_abertas fa ON fa.cartao_id = c.id
  LEFT JOIN parcelas_pendentes pp ON pp.cartao_id = c.id
  LEFT JOIN avulsos_sem_parcela asp ON asp.cartao_id = c.id
  LEFT JOIN recorrente_proxima rp ON rp.cartao_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND (p_incluir_inativos OR c.ativo = true)
  ORDER BY c.nome ASC;
END;
$$;
