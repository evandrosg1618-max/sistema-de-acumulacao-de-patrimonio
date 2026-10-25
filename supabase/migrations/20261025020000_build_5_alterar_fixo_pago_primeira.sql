-- Migration: 20261025020000_build_5_alterar_fixo_pago_primeira.sql
-- Atualiza alterar_fixo_escopo_rpc para aceitar p_pago_primeira e atualizar a conta / saldo do 1º lançamento corretamente se o toggle estiver ligado.

DROP FUNCTION IF EXISTS public.alterar_fixo_escopo_rpc(uuid, uuid, text, text, numeric, date, text, uuid, text, text, integer, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.alterar_fixo_escopo_rpc(uuid, uuid, text, text, numeric, date, text, uuid, text, text, integer, uuid, uuid, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.alterar_fixo_escopo_rpc(
  p_workspace_id uuid,
  p_lancamento_id uuid,
  p_escopo text DEFAULT 'todos',
  p_nova_descricao text DEFAULT NULL,
  p_novo_valor numeric DEFAULT NULL,
  p_nova_data date DEFAULT NULL,
  p_novo_meio_pagamento_tipo text DEFAULT NULL,
  p_novo_cartao_id uuid DEFAULT NULL,
  p_novo_prazo text DEFAULT NULL,
  p_nova_periodicidade text DEFAULT NULL,
  p_nova_quantidade_total integer DEFAULT NULL,
  p_nova_categoria_id uuid DEFAULT NULL,
  p_nova_subcategoria_id uuid DEFAULT NULL,
  p_nova_observacao text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_nova_conta_origem_id uuid DEFAULT NULL,
  p_nova_conta_destino_id uuid DEFAULT NULL,
  p_pago_primeira boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lanc RECORD;
  v_serie RECORD;
  v_cartao RECORD;
  v_ids_nao_pagos uuid[] := ARRAY[]::uuid[];
  v_ids_pagos uuid[] := ARRAY[]::uuid[];
  v_faturas_afetadas_antigas text[] := ARRAY[]::text[];
  v_faturas_afetadas_novas text[] := ARRAY[]::text[];
  v_fatura_paga_comp text;
  v_antigo_cartao_id uuid;
  v_novo_cartao_id uuid;
  v_antigo_meio text;
  v_novo_meio text;
  v_antiga_conta_origem uuid;
  v_antiga_conta_destino uuid;
  v_nova_conta_origem uuid;
  v_nova_conta_destino uuid;
  v_prazo text;
  v_qtd_total int;
  v_periodicidade text;
  v_data_limite date;
  v_total_alvo int;
  v_data_cur date;
  v_passo int := 1;
  v_dia_fech int := 10;
  v_dia_venc int := 20;
  v_comp_cur text;
  v_c text;
  v_ja_pago boolean;
  v_lanc_criado RECORD;
  v_novos_criados int := 0;
  v_total_ativas_pos int := 0;
  v_proxima_comp text;
  v_hoje date := CURRENT_DATE;
  v_deve_materializar boolean;
  v_natureza_prev boolean;
  v_primeiro_criado_id uuid;
  v_status_primeiro text;
  v_c_orig RECORD;
  v_c_dest RECORD;
BEGIN
  -- 1. Buscar lançamento base com lock
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

  -- Se o lançamento base estiver pago, e o usuário está mudando a conta/meio ou valor com p_pago_primeira:
  -- Se o lançamento base for o único pago da série e estiver sendo editado, vamos estornar a movimentação anterior dele
  -- para que ele seja atualizado na nova conta!
  IF v_lanc.status_pagamento = 'pago' AND v_lanc.meio_pagamento_tipo <> 'CARTAO' THEN
    -- Estornar a movimentação da conta antiga do v_lanc
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

    -- Agora colocamos v_lanc no conjunto a ser recriado/atualizado
    v_ids_nao_pagos := array_append(COALESCE(v_ids_nao_pagos, ARRAY[]::uuid[]), v_lanc.id);
    -- removemos de v_ids_pagos
    v_ids_pagos := array_remove(v_ids_pagos, v_lanc.id);
  END IF;

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

      -- Determinar status do pagamento:
      IF v_passo = 1 AND p_pago_primeira AND v_novo_meio <> 'CARTAO' THEN
        v_status_primeiro := 'pago';
      ELSE
        v_status_primeiro := 'pendente';
      END IF;

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
        data_pagamento,
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
        v_status_primeiro,
        (CASE WHEN v_status_primeiro = 'pago' THEN v_data_cur ELSE NULL END),
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
        status_pagamento = EXCLUDED.status_pagamento,
        data_pagamento = EXCLUDED.data_pagamento,
        observacao = EXCLUDED.observacao,
        natureza_previsao = EXCLUDED.natureza_previsao,
        numero_parcela = EXCLUDED.numero_parcela,
        total_parcelas = EXCLUDED.total_parcelas,
        updated_at = NOW()
      RETURNING * INTO v_lanc_criado;

      IF v_lanc_criado.id IS NOT NULL THEN
        v_novos_criados := v_novos_criados + 1;
        IF v_passo = 1 THEN
          v_primeiro_criado_id := v_lanc_criado.id;

          -- Se a 1ª ocorrência foi marcada como paga, atualizar saldo e movimentações da nova conta
          IF v_status_primeiro = 'pago' AND v_novo_meio <> 'CARTAO' THEN
            IF v_serie.tipo = 'despesa' AND v_nova_conta_origem IS NOT NULL THEN
              UPDATE public.contas
              SET saldo_atual = saldo_atual - p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_origem AND workspace_id = p_workspace_id;

              INSERT INTO public.movimentacoes_conta (
                workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
              ) VALUES (
                p_workspace_id, v_nova_conta_origem, v_lanc_criado.id, 'saida', p_novo_valor, v_data_cur, p_nova_descricao, p_user_id
              );
            ELSIF v_serie.tipo = 'receita' AND v_nova_conta_origem IS NOT NULL THEN
              UPDATE public.contas
              SET saldo_atual = saldo_atual + p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_origem AND workspace_id = p_workspace_id;

              INSERT INTO public.movimentacoes_conta (
                workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
              ) VALUES (
                p_workspace_id, v_nova_conta_origem, v_lanc_criado.id, 'entrada', p_novo_valor, v_data_cur, p_nova_descricao, p_user_id
              );
            ELSIF v_serie.tipo = 'transferencia' AND v_nova_conta_origem IS NOT NULL AND v_nova_conta_destino IS NOT NULL THEN
              UPDATE public.contas
              SET saldo_atual = saldo_atual - p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_origem AND workspace_id = p_workspace_id;

              UPDATE public.contas
              SET saldo_atual = saldo_atual + p_novo_valor, updated_at = NOW()
              WHERE id = v_nova_conta_destino AND workspace_id = p_workspace_id;

              SELECT nome INTO v_c_dest FROM public.contas WHERE id = v_nova_conta_destino;
              SELECT nome INTO v_c_orig FROM public.contas WHERE id = v_nova_conta_origem;

              INSERT INTO public.movimentacoes_conta (
                workspace_id, conta_id, lancamento_id, tipo, valor, data, descricao, created_by
              ) VALUES 
              (p_workspace_id, v_nova_conta_origem, v_lanc_criado.id, 'transferencia_saida', p_novo_valor, v_data_cur, 'Transf. saída para ' || COALESCE(v_c_dest.nome, 'Conta destino'), p_user_id),
              (p_workspace_id, v_nova_conta_destino, v_lanc_criado.id, 'transferencia_entrada', p_novo_valor, v_data_cur, 'Transf. entrada de ' || COALESCE(v_c_orig.nome, 'Conta origem'), p_user_id);
            END IF;
          END IF;
        END IF;

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
      'pago_primeira', p_pago_primeira,
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
