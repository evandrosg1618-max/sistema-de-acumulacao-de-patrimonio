-- Migration: 20261022100000_build_5_higienizacao_e_seguranca_fixos.sql
-- Higienização de fixos órfãos e suporte a exclusão/conversão de órfãos

-- 1. Higienizar lançamentos marcados como fixo/parcelado sem série válida
UPDATE public.lancamentos
SET regime = 'unico'
WHERE regime = 'fixo' AND serie_id IS NULL;

UPDATE public.lancamentos
SET regime = 'unico'
WHERE regime = 'parcelado' AND lancamento_pai_id IS NULL AND (total_parcelas <= 1 OR total_parcelas IS NULL);

-- 2. Atualizar excluir_fixo_escopo_rpc para tolerar lançamentos sem serie_id (órfãos)
-- Em vez de bloquear o usuário com erro, efetua a exclusão do lançamento com segurança de faturas/saldos
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
  v_fat_paga boolean;
BEGIN
  -- 1. Buscar lançamento base com FOR UPDATE
  SELECT * INTO v_lanc
  FROM public.lancamentos
  WHERE id = p_lancamento_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  -- Se for órfão (sem serie_id), realizar exclusão segura como lançamento único
  IF v_lanc.serie_id IS NULL THEN
    -- Verificar se está em fatura paga de cartão
    IF v_lanc.meio_pagamento_tipo = 'CARTAO' AND v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.faturas
        WHERE cartao_id = v_lanc.cartao_id
          AND competencia = v_lanc.competencia
          AND workspace_id = p_workspace_id
          AND status = 'paga'
      ) INTO v_fat_paga;

      IF v_fat_paga THEN
        RAISE EXCEPTION 'Este lançamento afeta a fatura paga de %. Desfaça o pagamento antes de excluir.', v_lanc.competencia;
      END IF;
    END IF;

    -- Se estava pago em conta, estornar saldo via toggle_pago_lancamento_rpc
    IF v_lanc.status_pagamento = 'pago' AND v_lanc.meio_pagamento_tipo <> 'CARTAO' THEN
      PERFORM public.toggle_pago_lancamento_rpc(p_workspace_id, v_lanc.id, false, p_user_id);
    END IF;

    -- Excluir movimentações bancárias
    DELETE FROM public.movimentacoes_conta WHERE lancamento_id = v_lanc.id;

    -- Soft delete
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        regime = 'unico',
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    -- Se for cartão, recalcular fatura
    IF v_lanc.meio_pagamento_tipo = 'CARTAO' AND v_lanc.cartao_id IS NOT NULL AND v_lanc.competencia IS NOT NULL THEN
      PERFORM public.recalcular_fatura_rpc(p_workspace_id, v_lanc.cartao_id, v_lanc.competencia);
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'bloqueado', false,
      'excluidos', 1,
      'pagas_preservadas', 0,
      'faturas_recalculadas', CASE WHEN v_lanc.competencia IS NOT NULL THEN ARRAY[v_lanc.competencia] ELSE ARRAY[]::text[] END
    );
  END IF;

  -- Caso possua serie_id, prosseguir com série mestre
  SELECT * INTO v_serie
  FROM public.series_lancamentos
  WHERE id = v_lanc.serie_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Série mestre inexistente (outro caso de órfão): tratar como único
    UPDATE public.lancamentos
    SET deleted_at = NOW(),
        status_pagamento = 'cancelado',
        serie_id = NULL,
        regime = 'unico',
        updated_at = NOW()
    WHERE id = v_lanc.id AND workspace_id = p_workspace_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'bloqueado', false,
      'excluidos', 1,
      'pagas_preservadas', 0,
      'faturas_recalculadas', ARRAY[]::text[]
    );
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
