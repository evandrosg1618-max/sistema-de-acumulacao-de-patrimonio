-- Migration: 20261021221500_build_5_correcao_alteracao_fixos_escopo_todos.sql
-- Build 5: Correção definitiva da alteração e exclusão de séries recorrentes + regra de escopo único "Todos"
-- 1. Suporte a todos os campos editados (meio de pagamento, cartão, contas, valor, descrição, data inicial, prazo e periodicidade)
-- 2. Não tocar nem excluir ocorrências pagas
-- 3. Transação atômica única com SELECT FOR UPDATE
-- 4. Excluir ocorrências não pagas e recriar recalculando a partir da nova data
-- 5. Recálculo integral de faturas dos cartões afetados (antigo e novo)
-- 6. Verificação de integridade e contagem com erro garantido em caso de falha

-- Função auxiliar para inspecionar competências pagas da série
CREATE OR REPLACE FUNCTION public.obter_status_serie_fixa_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_faturas_pagas text[] := ARRAY[]::text[];
  v_pagamentos_pagos text[] := ARRAY[]::text[];
  v_total_pagos int := 0;
  v_total_nao_pagos int := 0;
  v_competencias_pagas text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id;

  IF NOT FOUND OR v_lanc.serie_id IS NULL THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id;

  -- 1. Competências vinculadas a faturas pagas (Cartão)
  SELECT ARRAY_AGG(DISTINCT l.competencia ORDER BY l.competencia ASC)
  INTO v_faturas_pagas
  FROM public.lancamentos l
  JOIN public.faturas f ON f.cartao_id = l.cartao_id
                       AND f.competencia = l.competencia
                       AND f.workspace_id = l.workspace_id
  WHERE l.serie_id = v_serie.id
    AND l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.meio_pagamento_tipo = 'CARTAO'
    AND f.status = 'paga';

  -- 2. Competências com pagamento efetuado em conta bancária/dinheiro
  SELECT ARRAY_AGG(DISTINCT l.competencia ORDER BY l.competencia ASC)
  INTO v_pagamentos_pagos
  FROM public.lancamentos l
  WHERE l.serie_id = v_serie.id
    AND l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND l.meio_pagamento_tipo <> 'CARTAO'
    AND l.status_pagamento = 'pago';

  -- 3. Consolidar competências pagas distintas
  SELECT ARRAY_AGG(DISTINCT c ORDER BY c ASC)
  INTO v_competencias_pagas
  FROM (
    SELECT unnest(COALESCE(v_faturas_pagas, ARRAY[]::text[])) AS c
    UNION
    SELECT unnest(COALESCE(v_pagamentos_pagos, ARRAY[]::text[])) AS c
  ) t;

  -- 4. Contar ocorrências não pagas ativas
  SELECT COUNT(*) INTO v_total_nao_pagos
  FROM public.lancamentos l
  WHERE l.serie_id = v_serie.id
    AND l.workspace_id = p_workspace_id
    AND l.deleted_at IS NULL
    AND NOT (
      (l.status_pagamento = 'pago' AND l.meio_pagamento_tipo <> 'CARTAO')
      OR (l.meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = l.cartao_id
          AND f.competencia = l.competencia
          AND f.workspace_id = l.workspace_id
          AND f.status = 'paga'
      ))
    );

  v_total_pagos := COALESCE(array_length(v_competencias_pagas, 1), 0);

  RETURN jsonb_build_object(
    'encontrado', true,
    'serie_id', v_serie.id,
    'tem_pagas', (v_total_pagos > 0),
    'competencias_pagas', COALESCE(v_competencias_pagas, ARRAY[]::text[]),
    'total_nao_pagos', v_total_nao_pagos,
    'descricao', v_serie.descricao,
    'data_inicio', v_serie.data_inicio,
    'valor', v_serie.valor
  );
END;
$$;

-- Drop assinaturas antigas de alterar_fixo_escopo_rpc para evitar sobrecarga ambígua
DROP FUNCTION IF EXISTS public.alterar_fixo_escopo_rpc(uuid, uuid, text, numeric, date, text, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.alterar_fixo_escopo_rpc(uuid, uuid, text, numeric, date, text, uuid, uuid, text, text, integer, text, uuid);

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
  p_novo_meio_pagamento_tipo text DEFAULT NULL::text,
  p_nova_conta_origem_id uuid DEFAULT NULL::uuid,
  p_nova_conta_destino_id uuid DEFAULT NULL::uuid,
  p_novo_cartao_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_ids_nao_pagos uuid[] := ARRAY[]::uuid[];
  v_ids_pagos uuid[] := ARRAY[]::uuid[];
  v_faturas_afetadas_antigas text[] := ARRAY[]::text[];
  v_faturas_afetadas_novas text[] := ARRAY[]::text[];
  v_antigo_cartao_id uuid;
  v_novo_cartao_id uuid;
  v_antigo_meio text;
  v_novo_meio text;
  v_antiga_conta_origem uuid;
  v_nova_conta_origem uuid;
  v_antiga_conta_destino uuid;
  v_nova_conta_destino uuid;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_cartao RECORD;
  v_prazo text;
  v_qtd_total int;
  v_periodicidade text;
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
  v_total_ativas_pos int := 0;
  v_ja_pago boolean;
  v_c text;
BEGIN
  -- 1. Validar e travar lançamento base e série mestre com FOR UPDATE
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

  -- 2. Guardar referências antigas para recálculo
  v_antigo_meio := v_serie.meio_pagamento_tipo;
  v_antigo_cartao_id := v_serie.cartao_id;
  v_antiga_conta_origem := v_serie.conta_origem_id;
  v_antiga_conta_destino := v_serie.conta_destino_id;

  -- 3. Resolver novos valores definidos pelo usuário
  v_novo_meio := COALESCE(p_novo_meio_pagamento_tipo, v_serie.meio_pagamento_tipo, 'CONTA');
  IF v_novo_meio = 'CARTAO' THEN
    v_novo_cartao_id := COALESCE(p_novo_cartao_id, v_serie.cartao_id);
    v_nova_conta_origem := NULL;
    v_nova_conta_destino := NULL;
  ELSE
    v_novo_cartao_id := NULL;
    v_nova_conta_origem := COALESCE(p_nova_conta_origem_id, v_serie.conta_origem_id);
    v_nova_conta_destino := CASE WHEN v_serie.tipo = 'transferencia' THEN COALESCE(p_nova_conta_destino_id, v_serie.conta_destino_id) ELSE NULL END;
  END IF;

  v_prazo := COALESCE(p_novo_prazo, v_serie.prazo, 'indeterminado');
  v_qtd_total := CASE
    WHEN v_prazo = 'determinado' THEN COALESCE(p_nova_quantidade_total, v_serie.quantidade_total, 12)
    ELSE NULL
  END;
  v_periodicidade := COALESCE(p_nova_periodicidade, v_serie.periodicidade, 'mensal');

  IF v_novo_meio = 'CARTAO' AND v_novo_cartao_id IS NOT NULL THEN
    SELECT * INTO v_cartao FROM public.cartoes WHERE id = v_novo_cartao_id AND workspace_id = p_workspace_id;
    IF FOUND THEN
      v_dia_fech := COALESCE(v_cartao.dia_fechamento, 10);
      v_dia_venc := COALESCE(v_cartao.dia_vencimento, 20);
    END IF;
  END IF;

  -- 4. Identificar lançamentos NÃO PAGOS (alvos para exclusão/recriação) e PAGOS (preservados intactos)
  SELECT
    ARRAY_AGG(id) FILTER (WHERE NOT (
      (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
      OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = lancamentos.cartao_id
          AND f.competencia = lancamentos.competencia
          AND f.workspace_id = lancamentos.workspace_id
          AND f.status = 'paga'
      ))
    )),
    ARRAY_AGG(id) FILTER (WHERE (
      (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
      OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = lancamentos.cartao_id
          AND f.competencia = lancamentos.competencia
          AND f.workspace_id = lancamentos.workspace_id
          AND f.status = 'paga'
      ))
    ))
  INTO v_ids_nao_pagos, v_ids_pagos
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  -- Coletar faturas antigas que podem perder lançamentos para posterior recálculo
  IF v_antigo_cartao_id IS NOT NULL AND v_ids_nao_pagos IS NOT NULL THEN
    SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_afetadas_antigas
    FROM public.lancamentos
    WHERE id = ANY(v_ids_nao_pagos) AND cartao_id = v_antigo_cartao_id;
  END IF;

  -- 5. EXCLUIR SOMENTE as ocorrências NÃO PAGAS da série (soft-delete seguro em transação)
  IF v_ids_nao_pagos IS NOT NULL AND array_length(v_ids_nao_pagos, 1) > 0 THEN
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = ANY(v_ids_nao_pagos) AND workspace_id = p_workspace_id;
  END IF;

  -- 6. Atualizar a definição mestre na tabela series_lancamentos com todos os novos campos
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
      meio_pagamento_tipo = v_novo_meio,
      cartao_id = v_novo_cartao_id,
      conta_origem_id = v_nova_conta_origem,
      conta_destino_id = v_nova_conta_destino,
      prazo = v_prazo,
      quantidade_total = v_qtd_total,
      periodicidade = v_periodicidade,
      categoria_id = COALESCE(p_nova_categoria_id, categoria_id),
      subcategoria_id = p_nova_subcategoria_id,
      observacao = p_nova_observacao,
      data_inicio = p_nova_data,
      dia_vencimento = EXTRACT(DAY FROM p_nova_data)::int,
      data_limite_projecao = v_data_limite,
      ativo = true,
      updated_at = NOW()
  WHERE id = v_serie.id AND workspace_id = p_workspace_id;

  -- 7. RECRIAR as recorrências a partir da nova data inicial
  v_data_cur := p_nova_data;
  v_passo := 1;

  WHILE v_passo <= v_total_alvo AND v_data_cur <= v_data_limite LOOP
    IF v_novo_meio = 'CARTAO' THEN
      v_comp_cur := public.calcular_competencia_cartao(v_data_cur, v_dia_fech, v_dia_venc);
    ELSE
      v_comp_cur := TO_CHAR(v_data_cur, 'YYYY-MM');
    END IF;

    -- Verificar se já existe recorrência PAGA preservada nesta competência
    SELECT EXISTS (
      SELECT 1 FROM public.lancamentos
      WHERE serie_id = v_serie.id
        AND workspace_id = p_workspace_id
        AND competencia = v_comp_cur
        AND deleted_at IS NULL
    ) INTO v_ja_pago;

    -- Se não houver ocorrência paga ativa ocupando a competência, gerar a nova ocorrência
    IF NOT v_ja_pago THEN
      v_deve_materializar := (v_data_cur <= v_hoje);
      v_natureza_prev := NOT v_deve_materializar;

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
        v_novo_meio,
        v_nova_conta_origem,
        v_nova_conta_destino,
        v_novo_cartao_id,
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
        meio_pagamento_tipo = EXCLUDED.meio_pagamento_tipo,
        conta_origem_id = EXCLUDED.conta_origem_id,
        conta_destino_id = EXCLUDED.conta_destino_id,
        cartao_id = EXCLUDED.cartao_id,
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
        IF v_novo_meio = 'CARTAO' THEN
          v_faturas_afetadas_novas := array_append(COALESCE(v_faturas_afetadas_novas, ARRAY[]::text[]), v_comp_cur);
        END IF;
      END IF;
    END IF;

    -- Avançar corretamente a data conforme o passo incremental
    v_data_cur := public.avancar_data_periodicidade(p_nova_data, v_periodicidade, v_passo);
    v_passo := v_passo + 1;
  END LOOP;

  -- 8. Verificação de estado e contagem: se nenhuma foi recriada e existiam não pagas, falhar com erro
  SELECT COUNT(*) INTO v_total_ativas_pos
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  IF v_novos_criados = 0 AND (v_ids_nao_pagos IS NOT NULL AND array_length(v_ids_nao_pagos, 1) > 0) THEN
    RAISE EXCEPTION 'Erro ao recriar recorrências: nenhuma nova ocorrência pôde ser gerada para a série.';
  END IF;

  IF v_total_ativas_pos = 0 THEN
    RAISE EXCEPTION 'Erro de atomicidade: a série ficou vazia após a alteração.';
  END IF;

  -- 9. Próxima competência e contagem na série
  SELECT competencia INTO v_proxima_comp
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND natureza_previsao = true
    AND deleted_at IS NULL
  ORDER BY data ASC LIMIT 1;

  UPDATE public.series_lancamentos
  SET ocorrencias_geradas = v_total_ativas_pos,
      proxima_competencia = COALESCE(v_proxima_comp, TO_CHAR(p_nova_data, 'YYYY-MM')),
      updated_at = NOW()
  WHERE id = v_serie.id;

  -- 10. Recalcular TODAS as faturas afetadas no cartão antigo (se houver) e no novo cartão (se houver)
  IF v_antigo_cartao_id IS NOT NULL AND v_faturas_afetadas_antigas IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_afetadas_antigas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_antigo_cartao_id, v_c);
    END LOOP;
  END IF;

  IF v_novo_cartao_id IS NOT NULL AND v_faturas_afetadas_novas IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_faturas_afetadas_novas LOOP
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_novo_cartao_id, v_c);
    END LOOP;
  END IF;

  -- 11. Auditoria da alteração completa
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
    'todos',
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'novo_valor', p_novo_valor,
      'nova_data', p_nova_data,
      'novo_prazo', v_prazo,
      'nova_quantidade_total', v_qtd_total,
      'novo_meio', v_novo_meio,
      'novo_cartao_id', v_novo_cartao_id,
      'nova_conta_id', v_nova_conta_origem,
      'novas_geradas', v_novos_criados,
      'pagas_preservadas', COALESCE(array_length(v_ids_pagos, 1), 0),
      'faturas_antigas_recalculadas', COALESCE(v_faturas_afetadas_antigas, ARRAY[]::text[]),
      'faturas_novas_recalculadas', COALESCE(v_faturas_afetadas_novas, ARRAY[]::text[])
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'alterados', v_novos_criados,
    'pagas_preservadas', COALESCE(array_length(v_ids_pagos, 1), 0),
    'faturas_recalculadas', COALESCE(v_faturas_afetadas_novas, ARRAY[]::text[])
  );
END;
$$;


-- Exclusão de recorrente com escopo único "Todos" (preserva pagas)
DROP FUNCTION IF EXISTS public.excluir_fixo_escopo_rpc(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.excluir_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text DEFAULT 'todos',
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_ids_nao_pagos uuid[] := ARRAY[]::uuid[];
  v_ids_pagos uuid[] := ARRAY[]::uuid[];
  v_faturas_cartao text[] := ARRAY[]::text[];
  v_cartao_id uuid;
  v_c text;
  v_total_excluidos int := 0;
BEGIN
  -- 1. Buscar lançamento base e série mestre com FOR UPDATE
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

  -- 2. Separar ocorrências NÃO PAGAS (a serem excluídas) e PAGAS (preservadas intactas)
  SELECT
    ARRAY_AGG(id) FILTER (WHERE NOT (
      (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
      OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = lancamentos.cartao_id
          AND f.competencia = lancamentos.competencia
          AND f.workspace_id = lancamentos.workspace_id
          AND f.status = 'paga'
      ))
    )),
    ARRAY_AGG(id) FILTER (WHERE (
      (status_pagamento = 'pago' AND meio_pagamento_tipo <> 'CARTAO')
      OR (meio_pagamento_tipo = 'CARTAO' AND EXISTS (
        SELECT 1 FROM public.faturas f
        WHERE f.cartao_id = lancamentos.cartao_id
          AND f.competencia = lancamentos.competencia
          AND f.workspace_id = lancamentos.workspace_id
          AND f.status = 'paga'
      ))
    ))
  INTO v_ids_nao_pagos, v_ids_pagos
  FROM public.lancamentos
  WHERE serie_id = v_serie.id
    AND workspace_id = p_workspace_id
    AND deleted_at IS NULL;

  -- Se houver cartão, coletar competências para recálculo
  IF v_serie.meio_pagamento_tipo = 'CARTAO' AND v_serie.cartao_id IS NOT NULL AND v_ids_nao_pagos IS NOT NULL THEN
    v_cartao_id := v_serie.cartao_id;
    SELECT ARRAY_AGG(DISTINCT competencia) INTO v_faturas_cartao
    FROM public.lancamentos
    WHERE id = ANY(v_ids_nao_pagos);
  END IF;

  -- 3. Executar soft-delete de todas as não pagas
  IF v_ids_nao_pagos IS NOT NULL AND array_length(v_ids_nao_pagos, 1) > 0 THEN
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        updated_at = NOW()
    WHERE id = ANY(v_ids_nao_pagos) AND workspace_id = p_workspace_id;

    GET DIAGNOSTICS v_total_excluidos = ROW_COUNT;
  END IF;

  -- 4. Desativar a série para que não gere novas projeções
  UPDATE public.series_lancamentos
  SET ativo = false,
      ocorrencias_geradas = COALESCE(array_length(v_ids_pagos, 1), 0),
      updated_at = NOW()
  WHERE id = v_serie.id AND workspace_id = p_workspace_id;

  -- 5. Recalcular faturas afetadas no cartão
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
    v_serie.id,
    'exclusao_fixo_escopo',
    'todos',
    jsonb_build_object(
      'lancamento_base_id', p_lancamento_id,
      'total_excluidos', v_total_excluidos,
      'pagas_preservadas', COALESCE(array_length(v_ids_pagos, 1), 0),
      'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
    ),
    p_user_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'bloqueado', false,
    'excluidos', v_total_excluidos,
    'pagas_preservadas', COALESCE(array_length(v_ids_pagos, 1), 0),
    'faturas_recalculadas', COALESCE(v_faturas_cartao, ARRAY[]::text[])
  );
END;
$$;
