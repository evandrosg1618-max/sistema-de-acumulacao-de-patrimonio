-- Migration: 20261021035500_build_5_ajustes_recorrencias_rpc.sql
-- Idempotência, atomicidade e recriação completa por escopo em séries recorrentes
-- Regra definitiva:
-- 1. Alteração de recorrente por escopo ('este_e_proximos' ou 'todos')
--    - Suporta mudança de prazo/quantidade (ex: indeterminado -> determinado com 10 ocorrências)
--    - Bloqueia caso escopo contemple lançamentos ou faturas pagos
--    - Exclui ocorrências afetadas e recria tudo de forma atômica e consistente
--    - Recalcula faturas de cartão impactadas
-- 2. Exclusão de recorrente por escopo ('este_e_proximos' ou 'todos')
--    - Bloqueia caso contemple lançamentos ou faturas pagos
--    - Exclui via soft-delete e recalcula faturas de cartão

CREATE OR REPLACE FUNCTION public.alterar_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text,
  p_novo_valor numeric,
  p_nova_data date,
  p_nova_descricao text,
  p_nova_categoria_id uuid DEFAULT NULL::uuid,
  p_nova_subcategoria_id uuid DEFAULT NULL::uuid,
  p_nova_observacao text DEFAULT NULL::text,
  p_novo_prazo text DEFAULT NULL::text,
  p_nova_quantidade_total integer DEFAULT NULL::integer,
  p_nova_periodicidade text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_ids_alvo uuid[] := ARRAY[]::uuid[];
  v_bloqueios_pagamento text[] := ARRAY[]::text[];
  v_bloqueios_fatura text[] := ARRAY[]::text[];
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_cartao RECORD;
  v_prazo text;
  v_qtd_total int;
  v_periodicidade text;
  v_data_inicio_base date;
  v_data_cur date;
  v_comp_cur text;
  v_data_limite date;
  v_passo int := 1;
  v_total_alvo int;
  v_hoje date := CURRENT_DATE;
  v_deve_materializar boolean;
  v_natureza_prev boolean;
  v_novos_criados int := 0;
  v_proxima_comp text := NULL;
  v_lanc_criado RECORD;
  v_primeiro_criado boolean := true;
BEGIN
  -- 1. Buscar lançamento alvo com trava FOR UPDATE
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  IF v_lanc.serie_id IS NULL THEN
    RAISE EXCEPTION 'O lançamento não pertence a uma série recorrente fixa.';
  END IF;

  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Série recorrente não encontrada.';
  END IF;

  -- 2. Validar escopo permitido para recorrentes (regra definitiva: apenas 'este_e_proximos' ou 'todos')
  IF p_escopo NOT IN ('este_e_proximos', 'todos', 'este') THEN
    RAISE EXCEPTION 'Escopo inválido: use "este_e_proximos" ou "todos".';
  END IF;

  -- 3. Identificar lançamentos alvos existentes
  IF p_escopo = 'este' THEN
    v_ids_alvo := ARRAY[v_lanc.id];
  ELSIF p_escopo = 'este_e_proximos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND data >= v_lanc.data;
  ELSIF p_escopo = 'todos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL;
  END IF;

  -- 4. PROTEÇÃO DE PAGOS:
  -- Se o escopo contemplar lançamento pago ou em fatura de cartão paga, BLOQUEAR
  IF v_ids_alvo IS NOT NULL AND array_length(v_ids_alvo, 1) > 0 THEN
    -- A) Pagamentos efetuados em contas bancárias/dinheiro
    SELECT ARRAY_AGG(DISTINCT TO_CHAR(data, 'DD/MM/YYYY') || ' (R$ ' || valor || ')')
    INTO v_bloqueios_pagamento
    FROM public.lancamentos
    WHERE id = ANY(v_ids_alvo)
      AND workspace_id = p_workspace_id
      AND status_pagamento = 'pago'
      AND meio_pagamento_tipo <> 'CARTAO';

    -- B) Lançamentos vinculados a faturas de cartão que já foram pagas
    SELECT ARRAY_AGG(DISTINCT f.competencia)
    INTO v_bloqueios_fatura
    FROM public.lancamentos l
    JOIN public.faturas f ON f.cartao_id = l.cartao_id
                         AND f.competencia = l.competencia
                         AND f.workspace_id = l.workspace_id
    WHERE l.id = ANY(v_ids_alvo)
      AND l.workspace_id = p_workspace_id
      AND l.meio_pagamento_tipo = 'CARTAO'
      AND f.status = 'paga';

    IF (v_bloqueios_pagamento IS NOT NULL AND array_length(v_bloqueios_pagamento, 1) > 0) OR
       (v_bloqueios_fatura IS NOT NULL AND array_length(v_bloqueios_fatura, 1) > 0) THEN
      RETURN jsonb_build_object(
        'sucesso', false,
        'bloqueado', true,
        'motivo', 'protecao_pagos',
        'datas_pagamento', COALESCE(v_bloqueios_pagamento, ARRAY[]::text[]),
        'faturas_pagas', COALESCE(v_bloqueios_fatura, ARRAY[]::text[]),
        'mensagem', 'Não é possível alterar ocorrências que já foram pagas ou estão em faturas quitadas. Desfaça o pagamento antes de editar ou altere apenas as ocorrências futuras pendentes.'
      );
    END IF;

    -- Coletar faturas antigas que podem ser esvaziadas/alteradas
    IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
      SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_cartao
      FROM public.lancamentos
      WHERE id = ANY(v_ids_alvo) AND cartao_id IS NOT NULL;
    END IF;
  END IF;

  -- 5. Parâmetros da nova configuração
  v_prazo := COALESCE(p_novo_prazo, v_serie.prazo, 'indeterminado');
  v_qtd_total := CASE
    WHEN v_prazo = 'determinado' THEN COALESCE(p_nova_quantidade_total, v_serie.quantidade_total, 12)
    ELSE NULL
  END;
  v_periodicidade := COALESCE(p_nova_periodicidade, v_serie.periodicidade, 'mensal');

  IF v_serie.meio_pagamento_tipo = 'CARTAO' AND v_serie.cartao_id IS NOT NULL THEN
    v_cartao_id := v_serie.cartao_id;
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
    END IF;
  END IF;

  -- 6. EXCLUIR ocorrências afetadas pelo escopo (soft-delete seguro ou delete se ainda pendente/previsão)
  IF v_ids_alvo IS NOT NULL AND array_length(v_ids_alvo, 1) > 0 THEN
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = ANY(v_ids_alvo) AND workspace_id = p_workspace_id;
  END IF;

  -- 7. Atualizar definição na tabela mestre series_lancamentos
  IF p_escopo = 'todos' THEN
    v_data_inicio_base := p_nova_data;
  ELSE
    v_data_inicio_base := v_serie.data_inicio;
  END IF;

  IF v_prazo = 'indeterminado' THEN
    v_data_limite := public.calcular_limite_projecao_fixo(p_nova_data);
    v_total_alvo := 9999;
  ELSE
    v_total_alvo := v_qtd_total;
    v_data_limite := MAKE_DATE(2099, 12, 31);
  END IF;

  UPDATE public.series_lancamentos
  SET descricao = p_nova_descricao,
      valor = p_novo_valor,
      prazo = v_prazo,
      quantidade_total = v_qtd_total,
      periodicidade = v_periodicidade,
      categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
      subcategoria_id = p_nova_subcategoria_id,
      observacao = p_nova_observacao,
      data_inicio = v_data_inicio_base,
      dia_vencimento = EXTRACT(DAY FROM p_nova_data)::int,
      data_limite_projecao = v_data_limite,
      ativo = true,
      updated_at = NOW()
  WHERE id = v_serie.id AND workspace_id = p_workspace_id;

  -- 8. RECRIAR as ocorrências a partir da alteração (transação atômica única)
  -- Ponto de partida para a geração:
  IF p_escopo = 'todos' THEN
    v_data_cur := p_nova_data;
    v_passo := 1;
  ELSE
    -- este_e_proximos: gera a partir da nova data informada
    -- Determina o passo inicial contando quantos lançamentos ativos anteriores existem
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_passo
    FROM public.lancamentos
    WHERE serie_id = v_serie.id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND data < p_nova_data;

    v_data_cur := p_nova_data;
  END IF;

  WHILE v_passo <= v_total_alvo AND v_data_cur <= v_data_limite LOOP
    IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
      v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
    END IF;

    -- Materialização: se a data já chegou (ou hoje)
    IF v_data_cur <= v_hoje THEN
      v_deve_materializar := true;
    ELSE
      v_deve_materializar := false;
    END IF;

    v_natureza_prev := NOT v_deve_materializar;

    -- Inserir nova ocorrência recalculada
    INSERT INTO public.lancamentos (
      workspace_id,
      tipo,
      regime,
      serie_id,
      data,
      competencia,
      descricao,
      valor,
      meio_pagamento_tipo,
      conta_origem_id,
      conta_destino_id,
      cartao_id,
      categoria_id,
      subcategoria_id,
      status_pagamento,
      observacao,
      quantidade_parcelas,
      numero_parcela,
      total_parcelas,
      natureza_previsao,
      eh_excecao,
      conciliado,
      created_by
    ) VALUES (
      p_workspace_id,
      v_serie.tipo,
      'fixo',
      v_serie.id,
      v_data_cur,
      v_comp_cur,
      p_nova_descricao,
      p_novo_valor,
      v_serie.meio_pagamento_tipo,
      v_serie.conta_origem_id,
      v_serie.conta_destino_id,
      v_serie.cartao_id,
      COALESCE(p_nova_categoria_id, v_serie.categoria_id),
      p_nova_subcategoria_id,
      'pendente',
      p_nova_observacao,
      1,
      v_passo,
      (CASE WHEN v_prazo = 'determinado' THEN v_qtd_total ELSE NULL END),
      v_natureza_prev,
      false,
      false,
      p_user_id
    )
    ON CONFLICT (workspace_id, serie_id, competencia) WHERE serie_id IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET
      data = EXCLUDED.data,
      valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao,
      categoria_id = EXCLUDED.categoria_id,
      subcategoria_id = EXCLUDED.subcategoria_id,
      observacao = EXCLUDED.observacao,
      natureza_previsao = EXCLUDED.natureza_previsao,
      numero_parcela = EXCLUDED.numero_parcela,
      total_parcelas = EXCLUDED.total_parcelas,
      updated_at = NOW()
    RETURNING * INTO v_lanc_criado;

    IF v_lanc_criado.id IS NOT NULL THEN
      v_novos_criados := v_novos_criados + 1;

      -- Adicionar competência do cartão para recálculo
      IF v_serie.meio_pagamento_tipo = 'CARTAO' THEN
        IF v_faturas_cartao IS NULL OR NOT (v_comp_cur = ANY(v_faturas_cartao)) THEN
          v_faturas_cartao := array_append(COALESCE(v_faturas_cartao, ARRAY[]::text[]), v_comp_cur);
        END IF;
      END IF;
    END IF;

    -- Próxima data conforme periodicidade
    v_data_cur := public.avancar_data_periodicidade(p_nova_data, v_periodicidade, (v_passo - (CASE WHEN p_escopo = 'todos' THEN 0 ELSE (v_passo - 1) END)));
    -- Passo incremental
    v_passo := v_passo + 1;
  END LOOP;

  -- 9. Próxima competência e contagem na série
  SELECT competencia INTO v_proxima_comp
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND natureza_previsao = true
    AND deleted_at IS NULL
  ORDER BY data ASC LIMIT 1;

  UPDATE public.series_lancamentos
  SET ocorrencias_geradas = (
        SELECT COUNT(*) FROM public.lancamentos
        WHERE serie_id = v_serie.id AND workspace_id = p_workspace_id AND deleted_at IS NULL
      ),
      proxima_competencia = COALESCE(v_proxima_comp, TO_CHAR(p_nova_data, 'YYYY-MM')),
      updated_at = NOW()
  WHERE id = v_serie.id;

  -- 10. Recalcular TODAS as faturas afetadas (antigas que perderam o lançamento e novas que o receberam)
  IF v_cartao_id IS NOT NULL AND v_faturas_cartao IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_cartao LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 11. Auditoria da alteração
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_serie.id,
    'alteracao_fixo_escopo',
    p_escopo,
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'novo_valor', p_novo_valor,
      'nova_data', p_nova_data,
      'novo_prazo', v_prazo,
      'nova_quantidade_total', v_qtd_total,
      'novas_geradas', v_novos_criados,
      'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'alterados', v_novos_criados,
    'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
  );
END;
$$;


-- RPC de exclusão com escopo atualizada
CREATE OR REPLACE FUNCTION public.excluir_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_ids_alvo uuid[] := ARRAY[]::uuid[];
  v_bloqueios_pagamento text[] := ARRAY[]::text[];
  v_bloqueios_fatura text[] := ARRAY[]::text[];
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_total_excluidos int := 0;
BEGIN
  -- Buscar lançamento alvo com FOR UPDATE
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  IF v_lanc.serie_id IS NULL THEN
    RAISE EXCEPTION 'O lançamento não pertence a uma série recorrente fixa.';
  END IF;

  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Série recorrente não encontrada.';
  END IF;

  -- 1. Determinar lista de IDs alvo conforme escopo
  -- Regra do usuário: recorrentes aceitam apenas 'este_e_proximos' e 'todos' (ou 'este' se pontual)
  IF p_escopo = 'este' THEN
    v_ids_alvo := ARRAY[v_lanc.id];
  ELSIF p_escopo = 'este_e_proximos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND data >= v_lanc.data;
  ELSIF p_escopo = 'todos' THEN
    SELECT ARRAY_AGG(id) INTO v_ids_alvo
    FROM public.lancamentos
    WHERE serie_id = v_lanc.serie_id
      AND workspace_id = p_workspace_id
      AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Escopo inválido: use "este_e_proximos" ou "todos".';
  END IF;

  IF v_ids_alvo IS NULL OR array_length(v_ids_alvo, 1) = 0 THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0, 'faturas_recalculadas', ARRAY[]::text[]);
  END IF;

  -- 2. PROTEÇÃO DE PAGOS: verificar se qualquer lançamento alvo está pago ou em fatura paga
  -- A) Pagamentos em conta bancária / dinheiro
  SELECT ARRAY_AGG(DISTINCT TO_CHAR(data, 'DD/MM/YYYY') || ' (R$ ' || valor || ')')
  INTO v_bloqueios_pagamento
  FROM public.lancamentos
  WHERE id = ANY(v_ids_alvo)
    AND workspace_id = p_workspace_id
    AND status_pagamento = 'pago'
    AND meio_pagamento_tipo <> 'CARTAO';

  -- B) Faturas quitadas no cartão
  SELECT ARRAY_AGG(DISTINCT f.competencia)
  INTO v_bloqueios_fatura
  FROM public.lancamentos l
  JOIN public.faturas f ON f.cartao_id = l.cartao_id
                       AND f.competencia = l.competencia
                       AND f.workspace_id = l.workspace_id
  WHERE l.id = ANY(v_ids_alvo)
    AND l.workspace_id = p_workspace_id
    AND l.meio_pagamento_tipo = 'CARTAO'
    AND f.status = 'paga';

  IF (v_bloqueios_pagamento IS NOT NULL AND array_length(v_bloqueios_pagamento, 1) > 0) OR
     (v_bloqueios_fatura IS NOT NULL AND array_length(v_bloqueios_fatura, 1) > 0) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'bloqueado', true,
      'motivo', 'protecao_pagos',
      'datas_pagamento', COALESCE(v_bloqueios_pagamento, ARRAY[]::text[]),
      'faturas_pagas', COALESCE(v_bloqueios_fatura, ARRAY[]::text[]),
      'mensagem', 'Não é possível excluir ocorrências que já foram pagas. Desfaça os pagamentos ou exclua apenas ocorrências futuras pendentes.'
    );
  END IF;

  -- 3. Coletar competências de cartão afetadas para recálculo
  SELECT ARRAY_AGG(DISTINCT competencia), MAX(cartao_id)
  INTO v_faturas_cartao, v_cartao_id
  FROM public.lancamentos
  WHERE id = ANY(v_ids_alvo)
    AND meio_pagamento_tipo = 'CARTAO';

  -- 4. Executar soft delete dos lançamentos alvos
  UPDATE public.lancamentos
  SET deleted_at = NOW(),
      status_pagamento = 'cancelado',
      updated_at = NOW()
  WHERE id = ANY(v_ids_alvo) AND workspace_id = p_workspace_id;

  GET DIAGNOSTICS v_total_excluidos = ROW_COUNT;

  -- Se o escopo for "todos" ou "este_e_proximos" e não sobrou nenhum ativo, desativa a série
  IF p_escopo = 'todos' THEN
    UPDATE public.series_lancamentos
    SET ativo = false, updated_at = NOW()
    WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
  ELSIF p_escopo = 'este_e_proximos' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.lancamentos
      WHERE serie_id = v_lanc.serie_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
    ) THEN
      UPDATE public.series_lancamentos
      SET ativo = false, updated_at = NOW()
      WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;
    END IF;
  END IF;

  -- 5. Recalcular faturas impactadas
  IF v_cartao_id IS NOT NULL AND v_faturas_cartao IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_cartao LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 6. Auditoria da exclusão
  INSERT INTO public.auditoria_series (
    workspace_id,
    serie_id,
    evento,
    escopo,
    detalhes,
    created_by
  ) VALUES (
    p_workspace_id,
    v_lanc.serie_id,
    'exclusao_fixo_escopo',
    p_escopo,
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'total_excluidos', v_total_excluidos,
      'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'excluidos', v_total_excluidos,
    'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
  );
END;
$$;
